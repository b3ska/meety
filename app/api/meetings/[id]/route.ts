import { NextResponse } from "next/server";
import { getMeeting, updateMeeting, deleteMeeting } from "@/lib/store";
import { computeParticipation, resolveName } from "@/lib/metrics";
import { buildSnapshots, syncMemories } from "@/lib/pipeline";
import { forgetMemory, forgetMemoriesByEntity } from "@/lib/muninn";
import type { Meeting, MeetingType, SpeakerMap, Task } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const meeting = await getMeeting(id);
  if (!meeting) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(meeting);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const existing = await getMeeting(id);
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = (await req.json()) as {
      speakerMap?: SpeakerMap;
      tasks?: Task[];
      archived?: boolean;
      title?: string;
      type?: MeetingType;
      project?: string;
      department?: string;
      excludedSpeakers?: string[];
    };

    const patch: Partial<Meeting> = {};

    // Metadata edits — do not touch metrics.
    if (typeof body.archived === "boolean") patch.archived = body.archived;
    if (typeof body.title === "string") patch.title = body.title.trim();
    if (typeof body.type === "string") patch.type = body.type;
    if (typeof body.project === "string") patch.project = body.project.trim();
    if (typeof body.department === "string") patch.department = body.department.trim();

    if (Array.isArray(body.excludedSpeakers)) patch.excludedSpeakers = body.excludedSpeakers;

    // Renaming speakers or changing exclusions: recompute participation + snapshots.
    if (body.speakerMap || Array.isArray(body.excludedSpeakers)) {
      const speakerMap = body.speakerMap ?? existing.speakerMap;
      if (body.speakerMap) patch.speakerMap = body.speakerMap;
      const excluded = patch.excludedSpeakers ?? existing.excludedSpeakers;
      const participation = computeParticipation(
        existing.utterances,
        speakerMap,
        excluded,
      );
      patch.participation = participation;

      let tasks = body.tasks ?? existing.tasks;

      // Renaming a label changes the speaker's resolved name, but task.assignee
      // stores a name (not a label). Migrate assignees old-name → new-name so
      // tasks follow the rename instead of orphaning under the old label.
      if (body.speakerMap) {
        const labels = new Set<string>();
        for (const u of existing.utterances) labels.add(u.speaker);
        const renameMap = new Map<string, string>();
        for (const label of labels) {
          const oldName = resolveName(label, existing.speakerMap);
          const newName = resolveName(label, speakerMap);
          if (oldName !== newName) renameMap.set(oldName, newName);
        }
        if (renameMap.size > 0) {
          tasks = tasks.map((t) => {
            const mapped = renameMap.get(t.assignee);
            return mapped ? { ...t, assignee: mapped } : t;
          });
          patch.tasks = tasks;
        }
      }

      patch.snapshots = buildSnapshots(participation, tasks);
    }

    // Editing tasks only (no speaker change): persist + re-group snapshots.
    if (body.tasks && !body.speakerMap) {
      patch.tasks = body.tasks;
      const participation = patch.participation ?? existing.participation;
      patch.snapshots = buildSnapshots(participation, body.tasks);
    }

    const updated = await updateMeeting(id, patch);
    if (updated === null) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Keep Muninn in sync with the edit — evolves existing memories in place.
    // Renamed speakers create fresh snapshot memories (old name left as-is).
    const report = await syncMemories(updated);
    console.log(
      `[muninn] patch ${id}: ${report.created} created, ${report.updated} updated, ${report.unchanged} unchanged, ${report.failed} failed`,
    );

    return NextResponse.json(updated);
  } catch (e) {
    console.error("[PATCH /api/meetings/[id]]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Permanently delete a meeting and forget its Muninn memories.
 * Memory forget is fail-soft — record deletion proceeds regardless.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const existing = await getMeeting(id);
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Forget memories: prefer stored ids, fall back to entity (title) lookup.
    if (existing.memoryIds && existing.memoryIds.length > 0) {
      await Promise.all(existing.memoryIds.map((mid) => forgetMemory(mid)));
    } else {
      await forgetMemoriesByEntity(existing.title);
    }

    const removed = await deleteMeeting(id);
    if (!removed) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[DELETE /api/meetings/[id]]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 }
    );
  }
}
