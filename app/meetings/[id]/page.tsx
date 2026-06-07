"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { Task, SpeakerMap } from "@/lib/types";
import { StatusBadge, TypeBadge } from "@/components/Badge";
import Markdown from "@/components/Markdown";
import AskAboutMeeting from "@/components/AskAboutMeeting";
import TalkTimePanel from "@/components/TalkTimePanel";
import QuickStats from "@/components/QuickStats";
import Transcript from "@/components/Transcript";
import PeopleBoard from "@/components/PeopleBoard";
import { useMeeting } from "@/hooks/useMeeting";
import { formatDuration, formatDate } from "@/lib/utils";

function SectionCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-6 space-y-5">
      <div className="flex items-center gap-2">
        {icon && (
          <span
            className="material-symbols-outlined"
            style={{ color: "var(--accent)", fontSize: 18 }}
          >
            {icon}
          </span>
        )}
        <h2 className="text-base font-semibold" style={{ color: "var(--text-1)" }}>
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

export default function MeetingDetail() {
  const { id } = useParams<{ id: string }>();
  const { meeting, loading, error: fetchError, setMeeting } = useMeeting(id);

  // ── Speaker map draft (B2 fix) ─────────────────────────────────────────────
  // Initialised once from the first "ready" meeting; never overwritten by polls.
  const [speakerMap, setSpeakerMap] = useState<SpeakerMap>({});
  const [excludedSpeakers, setExcludedSpeakers] = useState<string[]>([]);
  const speakerMapInitialisedRef = useRef(false);

  useEffect(() => {
    if (
      !speakerMapInitialisedRef.current &&
      meeting !== null &&
      meeting.status !== "processing"
    ) {
      speakerMapInitialisedRef.current = true;
      setSpeakerMap(meeting.speakerMap ?? {});
      setExcludedSpeakers(meeting.excludedSpeakers ?? []);
    }
  }, [meeting]);

  function toggleExcluded(label: string) {
    setExcludedSpeakers((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label],
    );
  }

  // ── Speaker-map save state ─────────────────────────────────────────────────
  const [savingMap, setSavingMap] = useState(false);
  const [mapSaved, setMapSaved] = useState(false);
  const [mapSaveError, setMapSaveError] = useState<string | null>(null);

  // ── Tasks save state ───────────────────────────────────────────────────────
  const [savingTasks, setSavingTasks] = useState(false);
  const [taskSaveError, setTaskSaveError] = useState<string | null>(null);

  // ── Jira integration ───────────────────────────────────────────────────────
  const [jiraEnabled, setJiraEnabled] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`/api/meetings/${id}/jira`)
      .then((r) => (r.ok ? r.json() : { configured: false }))
      .then((d) => {
        if (active) setJiraEnabled(Boolean(d.configured));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [id]);

  // ── Deduplicated diarization labels (B3/perf fix) ──────────────────────────
  const diarizationLabels = useMemo(() => {
    if (!meeting) return [];
    const seen = new Set<string>();
    for (const u of meeting.utterances) seen.add(u.speaker);
    return Array.from(seen).sort();
  }, [meeting]);

  // ── PATCH helper ──────────────────────────────────────────────────────────
  const handlePatch = useCallback(
    async (body: {
      speakerMap?: SpeakerMap;
      tasks?: Task[];
      excludedSpeakers?: string[];
    }) => {
      const res = await fetch(`/api/meetings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`PATCH failed: HTTP ${res.status}`);
      return res.json();
    },
    [id]
  );

  // ── Save speaker map ───────────────────────────────────────────────────────
  async function saveSpeakerMap() {
    setSavingMap(true);
    setMapSaveError(null);
    try {
      const updated = await handlePatch({ speakerMap, excludedSpeakers });
      setMeeting(updated);
      setMapSaved(true);
      setTimeout(() => setMapSaved(false), 2000);
    } catch (err) {
      setMapSaveError((err as Error).message);
    } finally {
      setSavingMap(false);
    }
  }

  // ── Save tasks (reassign / done-toggle) ────────────────────────────────────
  async function saveTasks(tasks: Task[]) {
    setSavingTasks(true);
    setTaskSaveError(null);
    try {
      const updated = await handlePatch({ tasks });
      setMeeting(updated);
    } catch (err) {
      setTaskSaveError((err as Error).message);
    } finally {
      setSavingTasks(false);
    }
  }

  // ── Push action items to Jira (one-way) ────────────────────────────────────
  // Throws on hard failure so PeopleBoard can surface it inline.
  async function pushToJira(taskIds: string[]) {
    const res = await fetch(`/api/meetings/${id}/jira`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskIds }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
    if (data.meeting) setMeeting(data.meeting);
    if (data.failed > 0) {
      const firstErr = data.results?.find((r: { error?: string }) => r.error)?.error;
      throw new Error(firstErr ?? `${data.failed} task(s) failed to sync`);
    }
  }

  /* ── Loading state ── */
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  /* ── Fetch error state ── */
  if (fetchError || !meeting) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-20 text-center space-y-4">
        <span
          className="material-symbols-outlined"
          style={{ fontSize: 48, color: "var(--text-3)", display: "block" }}
        >
          error_outline
        </span>
        <p className="text-sm" style={{ color: "var(--text-2)" }}>
          {fetchError ?? "Meeting not found."}
        </p>
      </div>
    );
  }

  const isReady = meeting.status !== "processing" && meeting.status !== "error";

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-5">
      {/* ── Back link ── */}
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm transition-colors hover:text-[var(--text-1)]"
        style={{ color: "var(--text-3)" }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
          arrow_back
        </span>
        All meetings
      </Link>

      {/* ── (a) Header ── */}
      <div className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2 flex-1 min-w-0">
            <h1
              className="text-2xl font-bold leading-snug"
              style={{ color: "var(--text-1)" }}
            >
              {meeting.title}
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <TypeBadge type={meeting.type} />
              <StatusBadge status={meeting.status} />
              {meeting.project && (
                <span className="text-xs" style={{ color: "var(--text-3)" }}>
                  · {meeting.project}
                </span>
              )}
            </div>
          </div>
          <div className="text-right space-y-1 shrink-0">
            <p className="text-sm" style={{ color: "var(--text-2)" }}>
              {formatDate(meeting.createdAt)}
            </p>
            {meeting.durationSec > 0 && (
              <p className="text-sm" style={{ color: "var(--text-3)" }}>
                {formatDuration(meeting.durationSec)}
              </p>
            )}
          </div>
        </div>

        {/* ── Error banner (processing failed) ── */}
        {meeting.status === "error" && (
          <div
            className="mt-5 flex items-start gap-3 rounded-xl px-4 py-4"
            style={{
              background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.3)",
            }}
          >
            <span
              className="material-symbols-outlined shrink-0 mt-0.5"
              style={{ color: "var(--red)", fontSize: 20 }}
            >
              error
            </span>
            <div className="space-y-1">
              <p className="text-sm font-semibold" style={{ color: "var(--red)" }}>
                Processing failed
              </p>
              {meeting.error && (
                <p className="text-xs leading-relaxed" style={{ color: "#fca5a5" }}>
                  {meeting.error}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Processing placeholder (sole processing indicator) ── */}
      {meeting.status === "processing" && (
        <div className="card p-12 text-center space-y-4">
          <Spinner />
          <p className="text-sm" style={{ color: "var(--text-2)" }}>
            Analysis in progress — this usually takes 1–2 minutes.
          </p>
          <p className="text-xs" style={{ color: "var(--text-3)" }}>
            This page refreshes automatically.
          </p>
        </div>
      )}

      {/* ── Ready: two-column workspace + full-width people board ── */}
      {isReady && (
        <>
          <div className="grid gap-5 items-start lg:grid-cols-[minmax(0,1fr)_340px]">
            {/* Main column */}
            <div className="space-y-5 min-w-0">
              <AskAboutMeeting meetingId={meeting.id} title={meeting.title} />

              {meeting.summary && (
                <SectionCard title="Summary" icon="summarize">
                  <Markdown text={meeting.summary} />
                </SectionCard>
              )}

              <Transcript
                utterances={meeting.utterances}
                transcriptText={meeting.transcriptText}
                speakerMap={speakerMap}
              />
            </div>

            {/* Sticky rail */}
            <div className="space-y-5 lg:sticky lg:top-6 self-start">
              <TalkTimePanel
                participation={meeting.participation}
                labels={diarizationLabels}
                speakerMap={speakerMap}
                excludedSpeakers={excludedSpeakers}
                onChangeName={(label, value) =>
                  setSpeakerMap((prev) => ({ ...prev, [label]: value }))
                }
                onToggleExclude={toggleExcluded}
                onSave={saveSpeakerMap}
                saving={savingMap}
                saved={mapSaved}
                error={mapSaveError}
              />
              <QuickStats meeting={meeting} />
            </div>
          </div>

          <PeopleBoard
            snapshots={meeting.snapshots}
            tasks={meeting.tasks}
            onSave={saveTasks}
            saving={savingTasks}
            error={taskSaveError}
            jiraEnabled={jiraEnabled}
            onPushToJira={pushToJira}
          />
        </>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <div
      className="h-8 w-8 border-2 rounded-full animate-spin inline-block"
      style={{
        borderColor: "var(--accent-container)",
        borderTopColor: "transparent",
      }}
    />
  );
}
