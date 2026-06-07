"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import type { RecordingCard } from "@/lib/types";
import type { MeetingType } from "@/lib/types";
import { StatusBadge, TypeBadge } from "@/components/Badge";
import { formatDate, formatDuration } from "@/lib/utils";

// ── Constants ────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<MeetingType, string> = {
  standup:    "Standup",
  one_on_one: "1-on-1",
  planning:   "Planning",
  retro:      "Retro",
  review:     "Review",
  other:      "Other",
};

type SortKey = "newest" | "oldest" | "longest";

const SORT_LABELS: Record<SortKey, string> = {
  newest:  "Newest",
  oldest:  "Oldest",
  longest: "Longest",
};

// ── Skeleton card ─────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div
      className="card animate-pulse overflow-hidden flex flex-col"
      style={{ background: "var(--bg-card)" }}
    >
      {/* Thumbnail band */}
      <div className="h-28" style={{ background: "var(--bg-surface)" }} />
      {/* Body */}
      <div className="p-4 flex flex-col gap-3 flex-1">
        <div className="flex gap-2">
          <div
            className="h-5 w-16 rounded-full"
            style={{ background: "var(--bg-surface-high)" }}
          />
          <div
            className="h-5 w-14 rounded-full"
            style={{ background: "var(--bg-surface-high)" }}
          />
        </div>
        <div
          className="h-4 rounded"
          style={{ background: "var(--bg-surface-high)" }}
        />
        <div
          className="h-3 w-4/5 rounded"
          style={{ background: "var(--bg-surface-high)" }}
        />
        <div
          className="mt-auto pt-3 flex justify-between"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <div
            className="h-3 w-28 rounded"
            style={{ background: "var(--bg-surface-high)" }}
          />
          <div
            className="h-3 w-16 rounded"
            style={{ background: "var(--bg-surface-high)" }}
          />
        </div>
      </div>
    </div>
  );
}

// ── Recording card item ──────────────────────────────────────────────────────

function RecordingCardItem({ c }: { c: RecordingCard }) {
  const dateStr = formatDate(c.createdAt);
  const durStr = c.durationSec > 0 ? ` · ${formatDuration(c.durationSec)}` : "";
  const taskLabel = c.taskCount === 1 ? "task" : "tasks";

  return (
    <Link
      href={`/meetings/${c.id}`}
      className="card card-hover overflow-hidden flex flex-col group"
    >
      {/* Thumbnail band */}
      <div
        className="relative h-28 flex items-center justify-center shrink-0"
        style={{
          background: "linear-gradient(135deg, var(--accent-container), transparent)",
        }}
      >
        {/* Transcript/document icon — replaces play button; no audio retained */}
        <span
          className="material-symbols-outlined transition-colors duration-200"
          style={{ fontSize: 40, color: "var(--text-3)" }}
          aria-hidden="true"
        >
          description
        </span>

        {/* Status badge — top-right */}
        <div className="absolute top-2 right-2">
          <StatusBadge status={c.status} />
        </div>
      </div>

      {/* Body */}
      <div className="p-4 flex flex-col flex-1 gap-2">
        {/* Type row */}
        <div className="flex items-center gap-2 flex-wrap">
          <TypeBadge type={c.type} />
          {c.project && (
            <span className="text-xs truncate" style={{ color: "var(--text-3)" }}>
              {c.project}
            </span>
          )}
        </div>

        {/* Title */}
        <h3
          className="text-sm font-semibold leading-snug line-clamp-2 transition-colors duration-200 group-hover:text-[var(--accent)]"
          style={{ color: "var(--text-1)" }}
        >
          {c.title}
        </h3>

        {/* Summary snippet */}
        {c.summarySnippet ? (
          <p
            className="text-xs leading-relaxed line-clamp-2"
            style={{ color: "var(--text-2)" }}
          >
            {c.summarySnippet}
          </p>
        ) : (
          <p className="text-xs italic" style={{ color: "var(--text-3)" }}>
            No summary yet.
          </p>
        )}

        {/* Footer */}
        <div
          className="mt-auto pt-3 flex items-center justify-between gap-2 text-xs"
          style={{
            borderTop: "1px solid var(--border)",
            color: "var(--text-3)",
          }}
        >
          {/* Left: date + duration */}
          <span className="flex items-center gap-1 min-w-0">
            <span
              className="material-symbols-outlined shrink-0"
              style={{ fontSize: 13 }}
              aria-hidden="true"
            >
              calendar_today
            </span>
            <span className="truncate">
              {dateStr}
              {durStr}
            </span>
          </span>

          {/* Right: task count */}
          <span className="flex items-center gap-1 shrink-0">
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 13 }}
              aria-hidden="true"
            >
              task_alt
            </span>
            {c.taskCount} {taskLabel}
          </span>
        </div>
      </div>
    </Link>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function RecordingsPage() {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [typeFilter, setTypeFilter] = useState<"all" | MeetingType>("all");

  const [recordings, setRecordings] = useState<RecordingCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Active query that was actually fetched (used in empty-state message)
  const [fetchedQuery, setFetchedQuery] = useState("");

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const reqSeq = useRef(0); // ignore stale responses when a newer query is in flight

  const fetchRecordings = useCallback(async (q: string) => {
    const seq = ++reqSeq.current;
    setLoading(true);
    setFetchError(null);
    try {
      const url = q
        ? `/api/recordings?q=${encodeURIComponent(q)}`
        : "/api/recordings";
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: RecordingCard[] = await res.json();
      if (!mountedRef.current || seq !== reqSeq.current) return; // unmounted or superseded
      setRecordings(data);
      setFetchedQuery(q);
    } catch (err) {
      if (!mountedRef.current || seq !== reqSeq.current) return;
      setFetchError(err instanceof Error ? err.message : String(err));
    } finally {
      if (mountedRef.current && seq === reqSeq.current) setLoading(false);
    }
  }, []);

  // Initial load + unmount cleanup
  useEffect(() => {
    mountedRef.current = true;
    fetchRecordings("");
    return () => {
      mountedRef.current = false;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [fetchRecordings]);

  // Debounced search
  function handleQueryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchRecordings(val.trim());
    }, 300);
  }

  // Client-side sort + type filter applied to the server-returned list
  const displayed = recordings
    .filter((c) => typeFilter === "all" || c.type === typeFilter)
    .sort((a, b) => {
      if (sort === "newest") return b.createdAt.localeCompare(a.createdAt);
      if (sort === "oldest") return a.createdAt.localeCompare(b.createdAt);
      // longest
      return (b.durationSec ?? 0) - (a.durationSec ?? 0);
    });

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-8">
      {/* ── Page header ── */}
      <div>
        <h1
          className="text-2xl font-bold tracking-tight"
          style={{ color: "var(--text-1)" }}
        >
          Meeting Recordings
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-2)" }}>
          Search transcripts, summaries, and participants. Audio is not stored.
        </p>
      </div>

      {/* ── Search bar ── */}
      <div className="relative">
        <span
          className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ fontSize: 20, color: "var(--text-3)" }}
          aria-hidden="true"
        >
          search
        </span>
        <input
          type="search"
          className="input w-full"
          style={{ paddingLeft: "2.5rem" }}
          placeholder="Search by title, transcript, or participant…"
          value={query}
          onChange={handleQueryChange}
          aria-label="Search recordings"
        />
      </div>

      {/* ── Controls row ── */}
      <div className="flex flex-wrap gap-3 items-center">
        <span className="text-xs font-medium shrink-0" style={{ color: "var(--text-3)" }}>
          Sort:
        </span>
        <select
          className="input"
          style={{ width: "auto", minWidth: 120 }}
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          aria-label="Sort recordings"
        >
          {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
            <option key={k} value={k}>
              {SORT_LABELS[k]}
            </option>
          ))}
        </select>

        <span className="text-xs font-medium shrink-0" style={{ color: "var(--text-3)" }}>
          Type:
        </span>
        <select
          className="input"
          style={{ width: "auto", minWidth: 130 }}
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
          aria-label="Filter by meeting type"
        >
          <option value="all">All types</option>
          {(Object.keys(TYPE_LABELS) as MeetingType[]).map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </select>

        {/* Result count chip */}
        {!loading && !fetchError && (
          <span
            className="badge ml-auto"
            style={{ background: "var(--bg-surface-high)", color: "var(--text-2)" }}
          >
            {displayed.length} {displayed.length === 1 ? "recording" : "recordings"}
          </span>
        )}
      </div>

      {/* ── Content states ── */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : fetchError ? (
        <div className="card p-10 text-center">
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 40, color: "var(--text-3)", display: "block", marginBottom: 10 }}
            aria-hidden="true"
          >
            cloud_off
          </span>
          <p className="text-sm" style={{ color: "var(--text-2)" }}>
            Failed to load recordings: {fetchError}
          </p>
          <button
            className="btn-ghost mt-4 text-xs"
            onClick={() => fetchRecordings(fetchedQuery)}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 15 }} aria-hidden="true">
              refresh
            </span>
            Retry
          </button>
        </div>
      ) : displayed.length === 0 ? (
        <div className="card p-14 text-center">
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 48, color: "var(--text-3)", display: "block", marginBottom: 14 }}
            aria-hidden="true"
          >
            {fetchedQuery ? "search_off" : "video_library"}
          </span>
          <p className="text-sm font-medium" style={{ color: "var(--text-2)" }}>
            {fetchedQuery
              ? `No recordings match "${fetchedQuery}".`
              : "No recordings yet — upload one from the Dashboard."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {displayed.map((c) => (
            <RecordingCardItem key={c.id} c={c} />
          ))}
        </div>
      )}
    </div>
  );
}
