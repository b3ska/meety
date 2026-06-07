"use client";

import type { Meeting } from "@/lib/types";
import { SentimentDot } from "@/components/Badge";
import { formatDuration } from "@/lib/utils";

// At-a-glance tiles derived entirely from existing meeting data — no API calls.
export default function QuickStats({ meeting }: { meeting: Meeting }) {
  const participants =
    meeting.participation.length || meeting.snapshots.length || 0;
  const totalTasks = meeting.tasks.length;
  const doneTasks = meeting.tasks.filter((t) => t.done).length;

  const scores = meeting.participation
    .map((p) => p.avgSentimentScore)
    .filter((s) => typeof s === "number");
  const avgSentiment =
    scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

  return (
    <section className="card p-5 space-y-3">
      <div className="flex items-center gap-2">
        <span
          className="material-symbols-outlined"
          style={{ color: "var(--accent)", fontSize: 18 }}
        >
          insights
        </span>
        <h2 className="text-base font-semibold" style={{ color: "var(--text-1)" }}>
          At a glance
        </h2>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <Tile
          icon="schedule"
          label="Duration"
          value={meeting.durationSec > 0 ? formatDuration(meeting.durationSec) : "—"}
        />
        <Tile icon="group" label="People" value={String(participants)} />
        <Tile
          icon="task_alt"
          label="Tasks done"
          value={totalTasks > 0 ? `${doneTasks}/${totalTasks}` : "0"}
        />
        <div className="stat-tile">
          <div className="flex items-center gap-1.5 mb-1">
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 14, color: "var(--text-3)" }}
            >
              sentiment_satisfied
            </span>
            <span className="text-xs" style={{ color: "var(--text-3)" }}>
              Sentiment
            </span>
          </div>
          {participants > 0 ? (
            <SentimentDot score={avgSentiment} />
          ) : (
            <span className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>
              —
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

function Tile({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <div className="stat-tile">
      <div className="flex items-center gap-1.5 mb-1">
        <span
          className="material-symbols-outlined"
          style={{ fontSize: 14, color: "var(--text-3)" }}
        >
          {icon}
        </span>
        <span className="text-xs" style={{ color: "var(--text-3)" }}>
          {label}
        </span>
      </div>
      <span className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>
        {value}
      </span>
    </div>
  );
}
