import OpenAI from "openai";
import type { MeetingType, Task, Scope, RecalledMemory, ChatMessage } from "@/lib/types";

const MODEL = process.env.OPENROUTER_MODEL ?? "google/gemini-2.5-flash";

// Lazy client: do not construct at module load (env may be absent at build time).
let _client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error(
      "OPENROUTER_API_KEY is not set. Add it to your environment variables."
    );
  }
  if (!_client) {
    _client = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY,
    });
  }
  return _client;
}

const MEETING_TYPE_FOCUS: Record<MeetingType, string> = {
  standup:
    "Focus on: individual progress since last standup, blockers and impediments, and what each person will work on next.",
  one_on_one:
    "Focus on: career growth and development topics, personal concerns or feedback, and concrete action items committed to by either party.",
  planning:
    "Focus on: scope decisions and what is in/out, key risks and unknowns identified, and decisions made about priorities or approach.",
  retro:
    "Focus on: what went well that should be continued, what went poorly that should be addressed, and specific improvement actions the team committed to.",
  review:
    "Focus on: outcomes and whether goals were met, feedback received on the work, and decisions made about next steps or acceptance.",
  other:
    "Provide a general summary capturing the key discussion points, decisions made, and any follow-up items mentioned.",
};

export async function summarizeMeeting(
  transcriptText: string,
  type: MeetingType
): Promise<string> {
  const systemPrompt = `You are a meeting summarizer. ${MEETING_TYPE_FOCUS[type]}

Return a concise markdown summary of 120-200 words structured as:
- A single bold TL;DR line at the top
- 3 to 6 bullet points covering the key points

Be direct and specific. No filler phrases.`;

  try {
    const response = await getClient().chat.completions.create({
      model: MODEL,
      temperature: 0.3,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Transcript:\n\n${transcriptText}`,
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Model returned an empty response for summarizeMeeting.");
    }
    return content.trim();
  } catch (err) {
    if (err instanceof Error) throw err;
    throw new Error(`summarizeMeeting failed: ${String(err)}`);
  }
}

export async function generateTasks(
  transcriptText: string,
  speakerNames: string[]
): Promise<Task[]> {
  const speakerList =
    speakerNames.length > 0 ? speakerNames.join(", ") : "unknown";

  const systemPrompt = `You are a task extractor. Extract every concrete action item or commitment mentioned in the meeting transcript.

Known participants: ${speakerList}

Return ONLY valid JSON in this exact shape:
{ "tasks": [ { "assignee": string, "text": string, "dueDate": string, "priority": "high" | "medium" | "low" } ] }

Rules:
- "assignee" must be one of the known participants when clearly attributable, otherwise "Unassigned".
- "text" is a short, imperative description of the action (e.g. "Send the proposal to the client").
- "dueDate" is an ISO date string (YYYY-MM-DD) only if explicitly mentioned; omit the field otherwise.
- "priority" reflects urgency — "high" for explicit deadlines/blockers/critical items, "low" for nice-to-haves, otherwise "medium". Always set it.
- If there are no action items, return { "tasks": [] }.
- Do not include any text outside the JSON object.`;

  try {
    const response = await getClient().chat.completions.create({
      model: MODEL,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Transcript:\n\n${transcriptText}`,
        },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? "{}";

    let parsed: { tasks?: unknown[] };
    try {
      parsed = JSON.parse(raw) as { tasks?: unknown[] };
    } catch {
      return [];
    }

    const items = Array.isArray(parsed?.tasks) ? parsed.tasks : [];

    return items
      .filter(
        (item): item is { assignee: string; text: string; dueDate?: string; priority?: string } =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as Record<string, unknown>).text === "string"
      )
      .map((item) => ({
        id: crypto.randomUUID(),
        assignee:
          typeof item.assignee === "string" && item.assignee.trim()
            ? item.assignee.trim()
            : "Unassigned",
        text: item.text.trim(),
        done: false,
        ...(typeof item.dueDate === "string" && item.dueDate
          ? { dueDate: item.dueDate }
          : {}),
        priority: (item.priority === "high" || item.priority === "medium" || item.priority === "low")
          ? item.priority
          : "medium" as const,
      }));
  } catch (err) {
    if (err instanceof Error) throw err;
    throw new Error(`generateTasks failed: ${String(err)}`);
  }
}

/** Rough token estimate. ~4 chars/token is a safe over-approximation for English. */
const CHARS_PER_TOKEN = 4;

/**
 * Fit a meeting transcript into a token budget. If it fits, return it in full;
 * otherwise fall back to the meeting summary (flagged truncated) so the chat
 * call never blows the model's context window.
 */
export function fitTranscript(
  transcript: string,
  summary: string,
  maxTokens = 12_000
): { text: string; truncated: boolean } {
  if (transcript.length <= maxTokens * CHARS_PER_TOKEN) {
    return { text: transcript, truncated: false };
  }
  return { text: summary, truncated: true };
}

function renderMemories(memories: RecalledMemory[]): string {
  if (memories.length === 0) return "(No memory context available.)";
  return memories
    .map((m) => {
      const label = m.type ? `[${m.type}] ` : "";
      return `- ${label}${m.summary || m.content || ""}`;
    })
    .join("\n");
}

/** Keep the most recent turns so multi-turn context stays bounded. */
const MAX_HISTORY_TURNS = 12;

export async function chat(
  question: string,
  opts: {
    memories: RecalledMemory[];
    scope: Scope;
    transcript?: string;
    transcriptTruncated?: boolean;
    history?: ChatMessage[];
  }
): Promise<string> {
  const memoryBlock = renderMemories(opts.memories);
  const transcriptBlock = opts.transcript
    ? `\n\nFull meeting transcript${
        opts.transcriptTruncated
          ? " (too long to include in full — meeting summary shown instead)"
          : ""
      }:\n${opts.transcript}`
    : "";

  const systemPrompt = `You are the company's meeting-intelligence assistant. This is an ongoing conversation — use the earlier messages to resolve follow-up questions (e.g. "more detail", "what about her?"). Answer using ONLY the provided context (the transcript and/or memory below) plus what was already said in this conversation. If the answer isn't in context, say you don't have that information. Scope: ${opts.scope}.

Memory context:
${memoryBlock}${transcriptBlock}`;

  const history = (opts.history ?? [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && m.content?.trim())
    .slice(-MAX_HISTORY_TURNS)
    .map((m) => ({ role: m.role, content: m.content }));

  try {
    const response = await getClient().chat.completions.create({
      model: MODEL,
      temperature: 0.4,
      messages: [
        { role: "system", content: systemPrompt },
        ...history,
        { role: "user", content: question },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Model returned an empty response for chat.");
    }
    return content.trim();
  } catch (err) {
    if (err instanceof Error) throw err;
    throw new Error(`chat failed: ${String(err)}`);
  }
}
