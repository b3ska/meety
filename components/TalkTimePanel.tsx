"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { Participation, SpeakerMap } from "@/lib/types";

const TalkTimeChart = dynamic(() => import("@/components/TalkTimeChart"), {
  ssr: false,
});

interface Props {
  participation: Participation[];
  labels: string[];
  speakerMap: SpeakerMap;
  onChangeName: (label: string, value: string) => void;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
  error: string | null;
}

// Merged talk-time chart + compact speaker-rename editor. The rename inputs are
// tucked behind a disclosure so they stay out of the way until needed.
export default function TalkTimePanel({
  participation,
  labels,
  speakerMap,
  onChangeName,
  onSave,
  saving,
  saved,
  error,
}: Props) {
  const [editing, setEditing] = useState(false);

  return (
    <section className="card p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="material-symbols-outlined"
            style={{ color: "var(--accent)", fontSize: 18 }}
          >
            record_voice_over
          </span>
          <h2 className="text-base font-semibold" style={{ color: "var(--text-1)" }}>
            Talk time
          </h2>
        </div>
        {labels.length > 0 && (
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="flex items-center gap-1 text-xs transition-colors"
            style={{ color: editing ? "var(--accent)" : "var(--text-3)" }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
              {editing ? "close" : "edit"}
            </span>
            {editing ? "Done" : "Rename"}
          </button>
        )}
      </div>

      <TalkTimeChart participation={participation} />

      {editing && labels.length > 0 && (
        <div
          className="space-y-2.5 pt-3"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <p className="text-xs" style={{ color: "var(--text-3)" }}>
            Map diarization labels to names — reflected in the chart and people board.
          </p>
          {labels.map((label) => (
            <div key={label} className="flex items-center gap-2">
              <span
                className="shrink-0 w-9 text-xs font-mono rounded-md px-1.5 py-1 text-center"
                style={{
                  background: "var(--bg-surface)",
                  color: "var(--accent)",
                  border: "1px solid var(--border)",
                }}
              >
                {label}
              </span>
              <input
                type="text"
                aria-label={`Name for speaker ${label}`}
                value={speakerMap[label] ?? ""}
                placeholder={`Speaker ${label}`}
                onChange={(e) => onChangeName(label, e.target.value)}
                className="input flex-1"
                style={{ padding: "0.35rem 0.6rem", fontSize: "0.8rem" }}
              />
            </div>
          ))}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={onSave}
              disabled={saving}
              className="btn-primary text-xs"
              style={{ padding: "0.4rem 0.9rem" }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
                save
              </span>
              {saving ? "Saving…" : "Save names"}
            </button>
            {saved && (
              <span
                className="flex items-center gap-1 text-xs"
                style={{ color: "var(--green)" }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                  check_circle
                </span>
                Saved
              </span>
            )}
            {error && (
              <span className="text-xs" style={{ color: "var(--red)" }}>
                {error}
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
