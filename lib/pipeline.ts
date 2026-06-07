// Ingest pipeline: ties transcription → metrics → summary/tasks → snapshots →
// store + Muninn memory. Used by /api/ingest (full run) and /api/meetings/[id]
// (speaker-rename recompute).

import { createHash } from "crypto";
import { transcribeAudio, deleteTranscript } from "@/lib/assembly";
import { computeParticipation } from "@/lib/metrics";
import { resolveName } from "@/lib/metrics";
import { summarizeMeeting, generateTasks } from "@/lib/llm";
import {
  rememberMemory,
  rememberBatch,
  evolveMemory,
  type MemoryInput,
} from "@/lib/muninn";
import { getMeeting, updateMeeting } from "@/lib/store";
import type {
  Meeting,
  EmployeeSnapshot,
  Task,
  Participation,
  MuninnRefs,
} from "@/lib/types";

function formatSpeakerTranscript(
  utterances: { speaker: string; text: string }[],
  speakerMap: Record<string, string>
): string {
  return utterances
    .map((u) => `${resolveName(u.speaker, speakerMap)}: ${u.text}`)
    .join("\n");
}

function normalizeTaskAssignees(tasks: Task[], participantNames: string[]): Task[] {
  const byLowerName = new Map(
    participantNames.map((name) => [name.toLowerCase(), name])
  );

  return tasks.map((task) => {
    const assignee = byLowerName.get(task.assignee.toLowerCase());
    return assignee ? { ...task, assignee } : task;
  });
}

/** Group tasks under each participant to form per-employee snapshots. */
export function buildSnapshots(
  participation: Participation[],
  tasks: Task[],
): EmployeeSnapshot[] {
  return participation.map((p) => ({
    employeeName: p.employeeName,
    talkPct: p.talkPct,
    avgSentimentScore: p.avgSentimentScore,
    tasks: tasks.filter((t) => t.assignee === p.employeeName),
  }));
}

// ---------------------------------------------------------------------------
// Muninn memory builders — one atomic, entity-tagged memory per concept.
// ---------------------------------------------------------------------------

/** Entities common to a meeting: project/department if present. */
function meetingEntities(m: Meeting): { name: string; type: string }[] {
  return [
    ...(m.project ? [{ name: m.project, type: "project" }] : []),
    ...(m.department ? [{ name: m.department, type: "department" }] : []),
  ];
}

/** The meeting summary — the root memory that snapshots and tasks link to. */
function summaryMemory(m: Meeting): MemoryInput {
  const people = m.participation.map((p) => ({ name: p.employeeName, type: "person" }));
  return {
    content: `Meeting "${m.title}" (${m.type}) summary:\n${m.summary}`,
    type: "meeting_summary",
    // Muninn recall surfaces the `summary` field — put the substance there.
    summary: `Summary of "${m.title}" (${m.type}): ${m.summary
      .replace(/\s+/g, " ")
      .slice(0, 450)}`,
    entities: [{ name: m.title, type: "meeting" }, ...meetingEntities(m), ...people],
  };
}

/** A per-person participation snapshot, linked under the summary. */
function snapshotMemory(
  m: Meeting,
  s: EmployeeSnapshot,
  summaryId?: string
): MemoryInput {
  const taskLine = s.tasks.length
    ? ` Action items: ${s.tasks.map((t) => t.text).join("; ")}.`
    : "";
  const line = `In "${m.title}", ${s.employeeName} spoke ${s.talkPct}% of the time (sentiment score ${s.avgSentimentScore}).${taskLine}`;
  return {
    content: line,
    type: "participation_snapshot",
    summary: line,
    entities: [
      { name: s.employeeName, type: "person" },
      { name: m.title, type: "meeting" },
      ...meetingEntities(m),
    ],
    relationships: summaryId
      ? [{ target_id: summaryId, relation: "is_part_of" }]
      : undefined,
  };
}

/** A single action item as an atomic memory, linked under the summary. */
function taskMemory(m: Meeting, t: Task, summaryId?: string): MemoryInput {
  const due = t.dueDate ? ` (due ${t.dueDate})` : "";
  const line = `Action item from "${m.title}" for ${t.assignee}: ${t.text}${due}.`;
  return {
    content: line,
    type: "task",
    summary: line,
    entities: [
      { name: t.assignee, type: "person" },
      { name: m.title, type: "meeting" },
      ...meetingEntities(m),
    ],
    relationships: summaryId
      ? [{ target_id: summaryId, relation: "is_part_of" }]
      : undefined,
  };
}

export interface MemorySyncReport {
  created: number;
  updated: number;
  unchanged: number;
  failed: number;
  errors: string[];
}

/** Short content fingerprint, used to skip no-op evolves on re-sync. */
function fingerprint(content: string): string {
  return createHash("sha1").update(content).digest("hex").slice(0, 16);
}

/**
 * Sync a meeting's memories to Muninn idempotently.
 *
 * First run (no `muninnRefs`): `remember` the summary as a root, then one
 * `remember_batch` of all snapshots + tasks (each `is_part_of` the summary),
 * and persist the returned engram ids on the meeting.
 *
 * Later runs (reindex / speaker rename): `evolve` existing memories in place
 * (no duplicates) and batch-create any new speaker/task. `evolve` returns a new
 * version id, so refs are rewritten and re-persisted.
 *
 * Fail-soft per item, logged, counted. Whatever ids succeed are persisted.
 */
export async function syncMemories(m: Meeting): Promise<MemorySyncReport> {
  const report: MemorySyncReport = {
    created: 0,
    updated: 0,
    unchanged: 0,
    failed: 0,
    errors: [],
  };
  const refs: MuninnRefs = m.muninnRefs
    ? {
        summaryId: m.muninnRefs.summaryId,
        snapshotIds: { ...m.muninnRefs.snapshotIds },
        taskIds: { ...m.muninnRefs.taskIds },
        hashes: { ...(m.muninnRefs.hashes ?? {}) },
      }
    : { summaryId: "", snapshotIds: {}, taskIds: {}, hashes: {} };
  const hashes = refs.hashes!; // initialized above
  let changed = false;

  const fail = (label: string, e: unknown) => {
    report.failed++;
    const msg = `${label}: ${e instanceof Error ? e.message : String(e)}`;
    report.errors.push(msg);
    console.error("[muninn sync]", msg);
  };

  /** Evolve a known memory only if its content changed; returns the current id. */
  const syncExisting = async (
    label: string,
    id: string,
    input: MemoryInput
  ): Promise<string> => {
    const fp = fingerprint(input.content);
    if (hashes[label] === fp) {
      report.unchanged++;
      return id;
    }
    const newId = await evolveMemory(id, input.content, "re-synced from meeting edit");
    hashes[label] = fp;
    report.updated++;
    changed = true;
    return newId;
  };

  // 1. Summary (root) — evolve-if-changed when known, else create.
  const summary = summaryMemory(m);
  if (refs.summaryId) {
    try {
      refs.summaryId = await syncExisting("summary", refs.summaryId, summary);
    } catch (e) {
      fail("summary", e);
    }
  } else {
    try {
      refs.summaryId = await rememberMemory(summary);
      hashes["summary"] = fingerprint(summary.content);
      report.created++;
      changed = true;
    } catch (e) {
      fail("summary", e);
    }
  }
  const summaryId = refs.summaryId || undefined;

  // 2. Snapshots + tasks — evolve-if-changed existing; collect new for one batch.
  type Pending = { kind: "snapshot" | "task"; key: string; label: string; input: MemoryInput };
  const pending: Pending[] = [];

  for (const s of m.snapshots) {
    const input = snapshotMemory(m, s, summaryId);
    const label = `snapshot:${s.employeeName}`;
    const existing = refs.snapshotIds[s.employeeName];
    if (existing) {
      try {
        refs.snapshotIds[s.employeeName] = await syncExisting(label, existing, input);
      } catch (e) {
        fail(label, e);
      }
    } else {
      pending.push({ kind: "snapshot", key: s.employeeName, label, input });
    }
  }

  for (const t of m.tasks) {
    const input = taskMemory(m, t, summaryId);
    const label = `task:${t.id}`;
    const existing = refs.taskIds[t.id];
    if (existing) {
      try {
        refs.taskIds[t.id] = await syncExisting(label, existing, input);
      } catch (e) {
        fail(label, e);
      }
    } else {
      pending.push({ kind: "task", key: t.id, label, input });
    }
  }

  if (pending.length) {
    try {
      const ids = await rememberBatch(pending.map((p) => p.input));
      pending.forEach((p, i) => {
        const id = ids[i];
        if (id) {
          if (p.kind === "snapshot") refs.snapshotIds[p.key] = id;
          else refs.taskIds[p.key] = id;
          hashes[p.label] = fingerprint(p.input.content);
          report.created++;
          changed = true;
        } else {
          fail(p.label, new Error("batch returned no id"));
        }
      });
    } catch (e) {
      for (const p of pending) fail(p.label, e);
    }
  }

  // 3. Persist refs for whatever succeeded. Also maintain a flat `memoryIds`
  //    list (summary + snapshots + tasks) so the delete-cascade can forget them.
  if (changed) {
    const memoryIds = [
      refs.summaryId,
      ...Object.values(refs.snapshotIds),
      ...Object.values(refs.taskIds),
    ].filter(Boolean);
    try {
      await updateMeeting(m.id, { muninnRefs: refs, memoryIds });
    } catch (e) {
      fail("persist-refs", e);
    }
  }

  return report;
}

/** Full pipeline for a freshly uploaded meeting. Run fire-and-forget. */
export async function processMeeting(id: string, buffer: Buffer): Promise<void> {
  try {
    const initialMeeting = await getMeeting(id);
    if (!initialMeeting) return;

    const {
      transcriptText,
      utterances,
      speakerMap: identifiedSpeakerMap,
      durationSec,
      transcriptId,
    } = await transcribeAudio({
      buffer,
      expectedParticipants: initialMeeting.expectedParticipants,
    });

    // Recording is now transcribed — remove it from AssemblyAI so no audio is
    // retained on the third party. Fail-soft: never block the pipeline on this.
    deleteTranscript(transcriptId).catch((e) =>
      console.error(`[assemblyai] failed to delete transcript ${transcriptId}:`, e),
    );

    const meeting = await getMeeting(id);
    if (!meeting) return;

    const speakerMap = {
      ...identifiedSpeakerMap,
      ...(meeting.speakerMap ?? {}),
    };
    const participation = computeParticipation(
      utterances,
      speakerMap,
      meeting.excludedSpeakers,
    );
    const speakerNames = participation.map((p) => p.employeeName);
    const speakerTranscript = formatSpeakerTranscript(utterances, speakerMap);

    const [summary, extractedTasks] = await Promise.all([
      summarizeMeeting(speakerTranscript || transcriptText, meeting.type),
      generateTasks(speakerTranscript || transcriptText, speakerNames),
    ]);
    const tasks = normalizeTaskAssignees(extractedTasks, speakerNames);
    const snapshots = buildSnapshots(participation, tasks);

    const updated = await updateMeeting(id, {
      transcriptText,
      utterances,
      speakerMap,
      durationSec,
      participation,
      summary,
      tasks,
      snapshots,
      status: "ready",
    });

    if (updated) {
      const report = await syncMemories(updated);
      console.log(
        `[muninn] meeting ${id}: ${report.created} created, ${report.updated} updated, ${report.unchanged} unchanged, ${report.failed} failed`,
      );
    }
  } catch (e) {
    try {
      await updateMeeting(id, {
        status: "error",
        error: e instanceof Error ? e.message : String(e),
      });
    } catch (writeErr) {
      console.error(
        `[pipeline] Failed to write error status for meeting ${id}:`,
        writeErr
      );
    }
  }
}
