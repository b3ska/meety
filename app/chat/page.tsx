"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { ChatMessage, Scope } from "@/lib/types";
import WinnrLogo from "@/components/WinnrLogo";
import Markdown from "@/components/Markdown";

const SCOPE_LABELS: Record<Scope, string> = {
  company: "Company-wide",
  meeting: "Meeting",
};

/** Minimal meeting shape needed for the picker. */
type MeetingOption = { id: string; title: string; status: string };

const SUGGESTED_PROMPTS: { icon: string; title: string; question: string }[] = [
  { icon: "record_voice_over", title: "Top talker",    question: "Who spoke the most last week?" },
  { icon: "task_alt",          title: "Action items",  question: "Summarise outstanding action items" },
  { icon: "summarize",         title: "Topics",        question: "What topics came up in planning sessions?" },
  { icon: "search_insights",   title: "Cross-check",   question: "Compare notes from last week's design review." },
];

/* ── Bubble components ─────────────────────────────────────── */

function UserBubble({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div
        className="max-w-[75%] rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-relaxed"
        style={{ background: "var(--accent-container)", color: "#fff" }}
      >
        {content}
      </div>
    </div>
  );
}

function AssistantBubble({ content }: { content: string }) {
  return (
    <div className="flex justify-start gap-3">
      <div
        className="h-8 w-8 rounded-full shrink-0 flex items-center justify-center mt-1"
        style={{
          background: "var(--bg-surface-high)",
          border:     "1px solid var(--border)",
        }}
      >
        <WinnrLogo size={16} />
      </div>
      <div
        className="flex-1 rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed max-w-[80%]"
        style={{
          background: "var(--bg-card)",
          border:     "1px solid var(--border)",
          color:      "var(--text-1)",
        }}
      >
        <Markdown text={content} />
      </div>
    </div>
  );
}

function ErrorBubble({ content }: { content: string }) {
  return (
    <div className="flex justify-start gap-3">
      <div
        className="h-8 w-8 rounded-full shrink-0 flex items-center justify-center mt-1"
        style={{
          background: "rgba(239,68,68,0.15)",
          border:     "1px solid rgba(239,68,68,0.3)",
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 16, color: "var(--red)" }}>
          error
        </span>
      </div>
      <div
        className="flex-1 rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed max-w-[80%]"
        style={{
          background: "rgba(239,68,68,0.08)",
          border:     "1px solid rgba(239,68,68,0.25)",
          color:      "var(--red)",
        }}
      >
        {content}
      </div>
    </div>
  );
}

function ThinkingBubble() {
  return (
    <div className="flex justify-start gap-3">
      <div
        className="h-8 w-8 rounded-full shrink-0 flex items-center justify-center"
        style={{
          background: "var(--bg-surface-high)",
          border:     "1px solid var(--border)",
        }}
      >
        <WinnrLogo size={16} />
      </div>
      <div
        className="rounded-2xl rounded-tl-sm px-5 py-4 flex gap-1.5 items-center"
        style={{
          background: "var(--bg-card)",
          border:     "1px solid var(--border)",
        }}
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-2 w-2 rounded-full animate-bounce"
            style={{
              background:      "var(--border-strong)",
              animationDelay:  `${i * 0.15}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

/* ── Chat messages type extended with error and stable id ── */
type ExtendedMessage = (ChatMessage | { role: "error"; content: string }) & { id: string };

/* ── Page ──────────────────────────────────────────────────── */

export default function ChatPage() {
  const [messages, setMessages] = useState<ExtendedMessage[]>([]);
  const [input, setInput] = useState("");
  const [scope, setScope] = useState<Scope>("company");
  const [meetings, setMeetings] = useState<MeetingOption[]>([]);
  const [meetingId, setMeetingId] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef  = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLTextAreaElement>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Load the meeting list for the Meeting-scope picker (ready meetings only).
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/meetings");
        if (!res.ok) return;
        const all = (await res.json()) as MeetingOption[];
        if (!mountedRef.current || !Array.isArray(all)) return;
        const ready = all.filter((m) => m.status === "ready");
        setMeetings(ready);
        if (ready.length > 0) setMeetingId((cur) => cur || ready[0].id);
      } catch {
        /* fail-soft: picker just stays empty */
      }
    })();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = useCallback(async () => {
    const question = input.trim();
    if (!question || loading) return;

    if (scope === "meeting" && !meetingId) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "error",
          content: "Select a meeting to ask about, or switch to Company-wide.",
        },
      ]);
      return;
    }

    // Prior turns become conversation history so follow-ups have context.
    const history = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role, content: m.content }));

    setInput("");
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", content: question }]);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ question, scope, history, ...(scope === "meeting" ? { meetingId } : {}) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      const { answer } = await res.json();
      if (mountedRef.current) {
        setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: answer }]);
      }
    } catch (err) {
      if (mountedRef.current) {
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: "error", content: (err as Error).message },
        ]);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        inputRef.current?.focus();
      }
    }
  }, [input, loading, scope, meetingId, messages]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  const isEmpty = messages.length === 0 && !loading;

  return (
    <div className="flex flex-col h-full max-w-3xl mx-auto">
      {/* ── Header ── */}
      <div
        className="flex items-center justify-between px-6 py-4 shrink-0"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-3">
          <span
            className="material-symbols-outlined"
            style={{ color: "var(--accent)", fontSize: 22 }}
          >
            psychology
          </span>
          <div>
            <h1 className="text-base font-bold" style={{ color: "var(--text-1)" }}>
              Knowledge Vault
            </h1>
            <p className="text-xs" style={{ color: "var(--text-3)" }}>
              Ask anything about your meetings and team.
            </p>
          </div>
        </div>

        {/* Scope toggle + meeting picker */}
        <div className="flex items-center gap-2">
          <div
            role="group"
            aria-label="Memory scope"
            className="flex rounded-lg overflow-hidden"
            style={{ border: "1px solid var(--border)" }}
          >
            {(Object.keys(SCOPE_LABELS) as Scope[]).map((s) => (
              <button
                key={s}
                onClick={() => setScope(s)}
                aria-pressed={scope === s}
                className="px-3 py-1.5 text-xs font-medium transition-colors duration-200"
                style={
                  scope === s
                    ? { background: "var(--accent-container)", color: "#fff" }
                    : { background: "transparent", color: "var(--text-2)" }
                }
              >
                {SCOPE_LABELS[s]}
              </button>
            ))}
          </div>

          {scope === "meeting" && (
            <select
              aria-label="Meeting"
              value={meetingId}
              onChange={(e) => setMeetingId(e.target.value)}
              className="rounded-lg px-2 py-1.5 text-xs font-medium max-w-[200px] outline-none"
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                color: "var(--text-1)",
              }}
            >
              {meetings.length === 0 && <option value="">No meetings yet</option>}
              {meetings.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
        {isEmpty && (
          <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
            {/* Avatar */}
            <div
              className="h-16 w-16 rounded-2xl flex items-center justify-center"
              style={{
                background: "var(--bg-surface-high)",
                border:     "1px solid var(--border)",
              }}
            >
              <WinnrLogo size={28} />
            </div>

            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>
                Knowledge Vault
              </p>
              <p className="text-xs mt-1 max-w-xs mx-auto leading-relaxed" style={{ color: "var(--text-3)" }}>
                I'm analyzing your transcripts, decisions, and action items. Ask me anything.
              </p>
            </div>

            {/* Suggested prompts grid */}
            <div className="grid grid-cols-2 gap-3 w-full max-w-lg">
              {SUGGESTED_PROMPTS.map((p) => (
                <button
                  key={p.question}
                  onClick={() => {
                    setInput(p.question);
                    inputRef.current?.focus();
                  }}
                  className="rounded-xl p-4 text-left transition-all duration-200 flex flex-col gap-1.5 card-hover"
                  style={{
                    background: "var(--bg-card)",
                    border:     "1px solid var(--border)",
                  }}
                >
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: 18, color: "var(--accent)" }}
                  >
                    {p.icon}
                  </span>
                  <span className="text-xs font-semibold" style={{ color: "var(--text-1)" }}>
                    {p.title}
                  </span>
                  <span
                    className="text-xs leading-snug line-clamp-2"
                    style={{ color: "var(--text-3)" }}
                  >
                    {p.question}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => {
          if (msg.role === "user")      return <UserBubble      key={msg.id} content={msg.content} />;
          if (msg.role === "assistant") return <AssistantBubble key={msg.id} content={msg.content} />;
          if (msg.role === "error")     return <ErrorBubble     key={msg.id} content={msg.content} />;
          return null;
        })}

        {loading && <ThinkingBubble />}

        <div ref={bottomRef} />
      </div>

      {/* ── Input ── */}
      <div
        className="px-6 pb-6 pt-3 shrink-0"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        <div
          className="flex items-end gap-2 rounded-xl p-3 transition-all duration-200 focus-within:ring-2"
          style={{
            background:  "var(--bg-card)",
            border:      "1px solid var(--border)",
            // ring color via outline fallback; focus-within handled inline
          }}
        >
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask the Knowledge Vault about meetings, teams, or action items… (Enter to send)"
            disabled={loading}
            className="flex-1 bg-transparent resize-none text-sm outline-none max-h-40 leading-relaxed"
            style={{ color: "var(--text-1)" }}
          />
          <button
            onClick={send}
            disabled={!input.trim() || loading}
            className="shrink-0 h-9 w-9 rounded-lg flex items-center justify-center transition-all duration-200"
            style={{
              background: "var(--accent-container)",
              opacity:    !input.trim() || loading ? 0.4 : 1,
              cursor:     !input.trim() || loading ? "not-allowed" : "pointer",
            }}
            aria-label="Send"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#fff" }}>
              send
            </span>
          </button>
        </div>
        <p
          className="mt-2 text-[10px] text-center"
          style={{ color: "var(--text-3)" }}
        >
          Scope: <strong style={{ color: "var(--text-2)" }}>
            {scope === "meeting"
              ? meetings.find((m) => m.id === meetingId)?.title ?? "Meeting"
              : SCOPE_LABELS[scope]}
          </strong>
          &nbsp;· Shift+Enter for new line · The Knowledge Vault can make mistakes — verify important info.
        </p>
      </div>
    </div>
  );
}
