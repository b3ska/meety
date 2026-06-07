"use client";

// Meeting-scoped Muninn Q&A. Functionally identical to the Knowledge Vault
// (/app/chat) in "Meeting" scope: it POSTs to /api/chat with scope:"meeting"
// and this meeting's id, so the answer is grounded in the meeting's full
// transcript plus a deep recall of related memories.

import { useState, useRef, useEffect, useCallback } from "react";
import Markdown from "@/components/Markdown";

type Msg = { id: string; role: "user" | "assistant" | "error"; content: string };

export default function AskAboutMeeting({
  meetingId,
  title,
}: {
  meetingId: string;
  title: string;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = useCallback(async () => {
    const question = input.trim();
    if (!question || loading) return;

    // Prior turns become conversation history so follow-ups have context.
    const history = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role, content: m.content }));

    setInput("");
    setMessages((p) => [...p, { id: crypto.randomUUID(), role: "user", content: question }]);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, scope: "meeting", meetingId, history }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      const { answer } = await res.json();
      if (mountedRef.current) {
        setMessages((p) => [
          ...p,
          { id: crypto.randomUUID(), role: "assistant", content: answer },
        ]);
      }
    } catch (err) {
      if (mountedRef.current) {
        setMessages((p) => [
          ...p,
          { id: crypto.randomUUID(), role: "error", content: (err as Error).message },
        ]);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [input, loading, meetingId, messages]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <section
      className="card p-6 space-y-4"
      style={{
        background:
          "linear-gradient(145deg, rgba(37,99,235,0.10) 0%, var(--bg-card) 60%)",
        borderColor: "rgba(37,99,235,0.35)",
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="material-symbols-outlined"
          style={{ color: "var(--accent)", fontSize: 20 }}
        >
          forum
        </span>
        <h2 className="text-base font-semibold" style={{ color: "var(--text-1)" }}>
          Ask about this meeting
        </h2>
      </div>

      <p className="text-xs" style={{ color: "var(--text-3)" }}>
        Powered by the Knowledge Vault — ask follow-ups, pull decisions, or
        check what was committed. Aware of this meeting&apos;s full context.
      </p>

      {messages.length > 0 && (
        <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
          {messages.map((m) => {
            if (m.role === "user") {
              return (
                <div key={m.id} className="flex justify-end">
                  <div
                    className="max-w-[85%] rounded-2xl rounded-tr-sm px-3 py-2 text-sm leading-relaxed"
                    style={{ background: "var(--accent-container)", color: "#fff" }}
                  >
                    {m.content}
                  </div>
                </div>
              );
            }
            if (m.role === "assistant") {
              return (
                <div
                  key={m.id}
                  className="rounded-2xl rounded-tl-sm px-3 py-2 text-sm leading-relaxed"
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    color: "var(--text-1)",
                  }}
                >
                  <Markdown text={m.content} />
                </div>
              );
            }
            return (
              <div
                key={m.id}
                className="rounded-2xl rounded-tl-sm px-3 py-2 text-sm leading-relaxed"
                style={{
                  background: "rgba(239,68,68,0.08)",
                  border: "1px solid rgba(239,68,68,0.25)",
                  color: "var(--red)",
                }}
              >
                {m.content}
              </div>
            );
          })}

          {loading && (
            <div
              className="rounded-2xl rounded-tl-sm px-4 py-3 flex gap-1.5 items-center w-fit"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
            >
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-2 w-2 rounded-full animate-bounce"
                  style={{ background: "var(--border-strong)", animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      )}

      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          placeholder={`e.g. "What did we decide in ${title || "this meeting"}?"`}
          className="input flex-1"
        />
        <button
          type="submit"
          disabled={!input.trim() || loading}
          className="btn-primary shrink-0"
          aria-label="Send"
          style={{
            opacity: !input.trim() || loading ? 0.5 : 1,
            cursor: !input.trim() || loading ? "not-allowed" : "pointer",
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
            send
          </span>
        </button>
      </form>
    </section>
  );
}
