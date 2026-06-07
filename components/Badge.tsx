import type { MeetingType } from "@/lib/types";

type Status = "processing" | "ready" | "error";

const statusConfig: Record<Status, { bg: string; text: string; border: string; label: string }> = {
  processing: {
    bg:     "rgba(249,115,22,0.12)",
    text:   "#F97316",
    border: "rgba(249,115,22,0.3)",
    label:  "Processing",
  },
  ready: {
    bg:     "rgba(34,197,94,0.12)",
    text:   "#22C55E",
    border: "rgba(34,197,94,0.3)",
    label:  "Ready",
  },
  error: {
    bg:     "rgba(239,68,68,0.12)",
    text:   "#EF4444",
    border: "rgba(239,68,68,0.3)",
    label:  "Error",
  },
};

export function StatusBadge({ status }: { status: Status }) {
  const cfg = statusConfig[status];
  return (
    <span
      className="badge"
      style={{
        background: cfg.bg,
        color:      cfg.text,
        border:     `1px solid ${cfg.border}`,
      }}
    >
      {status === "processing" && (
        <span
          className="inline-block h-1.5 w-1.5 rounded-full animate-pulse"
          style={{ background: cfg.text }}
        />
      )}
      {cfg.label}
    </span>
  );
}

const typeConfig: Record<MeetingType, { bg: string; text: string; border: string; label: string }> = {
  standup:   { bg: "rgba(14,165,233,0.12)",  text: "#38BDF8", border: "rgba(14,165,233,0.25)", label: "Standup" },
  one_on_one:{ bg: "rgba(168,85,247,0.12)",  text: "#C084FC", border: "rgba(168,85,247,0.25)", label: "1-on-1" },
  planning:  { bg: "rgba(99,102,241,0.12)",  text: "#818CF8", border: "rgba(99,102,241,0.25)", label: "Planning" },
  retro:     { bg: "rgba(249,115,22,0.12)",  text: "#FB923C", border: "rgba(249,115,22,0.25)", label: "Retro" },
  review:    { bg: "rgba(20,184,166,0.12)",  text: "#2DD4BF", border: "rgba(20,184,166,0.25)", label: "Review" },
  other:     { bg: "rgba(141,144,160,0.12)", text: "#8d90a0", border: "rgba(141,144,160,0.25)", label: "Other" },
};

export function TypeBadge({ type }: { type: MeetingType }) {
  const cfg = typeConfig[type];
  return (
    <span
      className="badge"
      style={{
        background:   cfg.bg,
        color:        cfg.text,
        border:       `1px solid ${cfg.border}`,
        borderRadius: "0.375rem",
      }}
    >
      {cfg.label}
    </span>
  );
}

export function SentimentDot({ score }: { score: number }) {
  const color =
    score >= 0.2
      ? "#22C55E"
      : score <= -0.2
        ? "#EF4444"
        : "#F97316";
  const label =
    score >= 0.2 ? "Positive" : score <= -0.2 ? "Negative" : "Neutral";
  return (
    <span
      className="inline-flex items-center gap-1 text-xs"
      style={{ color: "var(--text-2)" }}
    >
      <span
        className="h-2 w-2 rounded-full shrink-0"
        style={{ background: color }}
      />
      {label}
    </span>
  );
}
