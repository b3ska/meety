// Shared domain types for the Meety meeting-intelligence MVP.
// All modules build against these. Do not change shapes without coordinating.

export type MeetingType =
  | "standup"
  | "one_on_one"
  | "planning"
  | "retro"
  | "review"
  | "other";

export type Sentiment = "POSITIVE" | "NEUTRAL" | "NEGATIVE";

/** One contiguous speaker turn from AssemblyAI diarization. */
export interface Utterance {
  speaker: string; // diarization label: "A", "B", ...
  text: string;
  start: number; // ms
  end: number; // ms
  confidence?: number;
  sentiment?: Sentiment;
}

/** Maps a diarization label ("A") to a human name ("Yani"). User-edited in UI. */
export type SpeakerMap = Record<string, string>;

/** Names expected to appear in a meeting, provided before transcription. */
export type ExpectedParticipant = string;

/** Per-speaker participation metrics, computed from utterances. */
export interface Participation {
  speaker: string; // diarization label
  employeeName: string; // resolved via SpeakerMap, falls back to "Speaker A"
  talkTimeSec: number;
  talkPct: number; // 0..100, share of total speaking time
  turns: number;
  words: number;
  avgSentimentScore: number; // -1..1 (POSITIVE=1, NEUTRAL=0, NEGATIVE=-1 averaged)
}

export interface Task {
  id: string;
  assignee: string; // employee name or "Unassigned"
  text: string;
  done: boolean;
  dueDate?: string; // ISO date, optional
  priority?: "high" | "medium" | "low";
  jiraKey?: string; // e.g. "WINNR-123" once pushed to Jira
  jiraUrl?: string; // browse URL for the issue
}

/** Per-employee snapshot for one meeting. */
export interface EmployeeSnapshot {
  employeeName: string;
  talkPct: number;
  avgSentimentScore: number;
  tasks: Task[];
  recommendation?: string; // optional one-line coaching note
}

/**
 * Stable Muninn engram IDs for a meeting's memories, so re-syncs (reindex /
 * speaker rename) `evolve` existing memories in place instead of creating
 * duplicates. Populated on first successful sync. Note: `evolve` returns a new
 * version ID each time, so these are rewritten on every update.
 */
export interface MuninnRefs {
  summaryId: string;
  snapshotIds: Record<string, string>; // employeeName -> engram id
  taskIds: Record<string, string>; // task.id -> engram id
  /**
   * Content fingerprints keyed by logical id ("summary" | `snapshot:<name>` |
   * `task:<id>`). Lets re-sync skip `evolve` when content is unchanged, which
   * avoids needless version churn and keeps `is_part_of` edges intact.
   */
  hashes?: Record<string, string>;
}

/** The full structured meeting object — UI source of truth, persisted via store.ts. */
export interface Meeting {
  id: string;
  title: string;
  type: MeetingType;
  createdAt: string; // ISO
  durationSec: number;
  project?: string;
  department?: string;
  expectedParticipants?: ExpectedParticipant[];
  transcriptText: string;
  utterances: Utterance[];
  speakerMap: SpeakerMap;
  summary: string;
  tasks: Task[];
  participation: Participation[];
  snapshots: EmployeeSnapshot[];
  status: "processing" | "ready" | "error";
  error?: string;
  archived?: boolean; // soft-delete: hidden from default list, recoverable
  memoryIds?: string[]; // flat list of current Muninn ids (for forget-on-delete)
  muninnRefs?: MuninnRefs; // structured ids + fingerprints for idempotent re-sync
  excludedSpeakers?: string[]; // diarization labels marked as bot / non-participant — dropped from metrics
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Chat memory scope.
 * - company: broad recall across all meeting memories.
 * - meeting: focused on one meeting — its full transcript is loaded (budget
 *   permitting) plus a deep recall for cross-meeting context.
 */
export type Scope = "company" | "meeting";

/** A memory returned by Muninn recall, with the fields the chat layer renders. */
export interface RecalledMemory {
  id?: string;
  type?: string;
  summary?: string;
  content?: string;
  concept?: string;
  score?: number;
}

/** Lightweight meeting card for the Recordings library (no transcript shipped to client). */
export interface RecordingCard {
  id: string;
  title: string;
  type: MeetingType;
  status: "processing" | "ready" | "error";
  createdAt: string;
  durationSec: number;
  project?: string;
  summarySnippet: string;
  taskCount: number;
  participantCount: number;
}
