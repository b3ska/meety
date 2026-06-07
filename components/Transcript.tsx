"use client";

import { useState, useMemo } from "react";
import type { Utterance, SpeakerMap } from "@/lib/types";

const SPEAKER_COLORS = [
  "#2563EB", "#b4c5ff", "#22C55E", "#F97316",
  "#38BDF8", "#C084FC", "#2DD4BF", "#FB923C",
];

function mmss(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

interface Props {
  utterances: Utterance[];
  transcriptText: string;
  speakerMap: SpeakerMap;
}

// Collapsible, speaker-labeled transcript. Collapsed by default so it never
// dominates the page. Each diarization label gets a stable accent color.
export default function Transcript({
  utterances,
  transcriptText,
  speakerMap,
}: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const colorFor = useMemo(() => {
    const order = Array.from(new Set(utterances.map((u) => u.speaker))).sort();
    const map: Record<string, string> = {};
    order.forEach((label, i) => {
      map[label] = SPEAKER_COLORS[i % SPEAKER_COLORS.length];
    });
    return map;
  }, [utterances]);

  const hasContent = utterances.length > 0 || transcriptText.trim().length > 0;

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(transcriptText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable — silently ignore */
    }
  }

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between p-5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2"
          aria-expanded={open}
        >
          <span
            className="material-symbols-outlined transition-transform"
            style={{
              color: "var(--text-3)",
              fontSize: 20,
              transform: open ? "rotate(90deg)" : "none",
            }}
          >
            chevron_right
          </span>
          <span
            className="material-symbols-outlined"
            style={{ color: "var(--accent)", fontSize: 18 }}
          >
            description
          </span>
          <h2 className="text-base font-semibold" style={{ color: "var(--text-1)" }}>
            Transcript
          </h2>
          {utterances.length > 0 && (
            <span className="text-xs" style={{ color: "var(--text-3)" }}>
              {utterances.length} turns
            </span>
          )}
        </button>

        {open && transcriptText.trim() && (
          <button
            type="button"
            onClick={copyAll}
            className="btn-ghost text-xs"
            style={{ padding: "0.3rem 0.7rem" }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
              {copied ? "check" : "content_copy"}
            </span>
            {copied ? "Copied" : "Copy"}
          </button>
        )}
      </div>

      {open && (
        <div
          className="px-5 pb-5 space-y-4 max-h-[32rem] overflow-y-auto"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          {!hasContent ? (
            <p className="text-sm py-6 text-center" style={{ color: "var(--text-3)" }}>
              No transcript available.
            </p>
          ) : utterances.length > 0 ? (
            <div className="space-y-3.5 pt-4">
              {utterances.map((u, i) => {
                const name = speakerMap[u.speaker]?.trim() || `Speaker ${u.speaker}`;
                const color = colorFor[u.speaker] ?? "var(--accent)";
                return (
                  <div key={i} className="flex gap-3">
                    <div className="shrink-0 w-24 text-right">
                      <div
                        className="text-xs font-semibold truncate"
                        style={{ color }}
                        title={name}
                      >
                        {name}
                      </div>
                      <div
                        className="text-[11px] font-mono"
                        style={{ color: "var(--text-3)" }}
                      >
                        {mmss(u.start)}
                      </div>
                    </div>
                    <p
                      className="text-sm leading-relaxed flex-1 min-w-0"
                      style={{ color: "var(--text-2)" }}
                    >
                      {u.text}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <p
              className="text-sm leading-relaxed pt-4 whitespace-pre-wrap"
              style={{ color: "var(--text-2)" }}
            >
              {transcriptText}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
