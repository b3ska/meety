"use client";

import { useState } from "react";
import type { EmployeeSnapshot, Task } from "@/lib/types";
import { SentimentDot } from "@/components/Badge";

const UNASSIGNED = "Unassigned";

function effectiveAssignee(t: Task): string {
  return t.assignee?.trim() || UNASSIGNED;
}

interface Props {
  snapshots: EmployeeSnapshot[];
  tasks: Task[];
  onSave: (tasks: Task[]) => Promise<void>;
  saving: boolean;
  error: string | null;
  jiraEnabled?: boolean;
  onPushToJira?: (taskIds: string[]) => Promise<void>;
}

// Full-width board: one column per person. Tasks are draggable chips — drop a
// task on another person to reassign it. Grouping is driven by the flat
// `tasks` list (the canonical write path) so reassignment reflects instantly;
// snapshots only supply talk %, sentiment, and the coaching note.
export default function PeopleBoard({
  snapshots,
  tasks,
  onSave,
  saving,
  error,
  jiraEnabled,
  onPushToJira,
}: Props) {
  const [local, setLocal] = useState<Task[]>(tasks);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [pushing, setPushing] = useState<Set<string>>(new Set());
  const [jiraError, setJiraError] = useState<string | null>(null);

  async function pushJira(ids: string[]) {
    if (!onPushToJira || ids.length === 0) return;
    setJiraError(null);
    setPushing((p) => new Set([...p, ...ids]));
    try {
      await onPushToJira(ids);
    } catch (e) {
      setJiraError(e instanceof Error ? e.message : String(e));
    } finally {
      setPushing((p) => {
        const next = new Set(p);
        ids.forEach((i) => next.delete(i));
        return next;
      });
    }
  }

  // Re-sync from the server copy when a poll/save returns a new tasks array.
  // Render-time adjustment (React's recommended alternative to a sync effect).
  const [prevTasks, setPrevTasks] = useState(tasks);
  if (tasks !== prevTasks) {
    setPrevTasks(tasks);
    setLocal(tasks);
  }

  // Column order: snapshot people first, then any extra task assignees, then
  // Unassigned (only when it actually holds tasks).
  const snapByName = new Map(snapshots.map((s) => [s.employeeName, s]));
  const order: string[] = [];
  const seen = new Set<string>();
  for (const s of snapshots) {
    order.push(s.employeeName);
    seen.add(s.employeeName);
  }
  for (const t of local) {
    const a = effectiveAssignee(t);
    if (a !== UNASSIGNED && !seen.has(a)) {
      order.push(a);
      seen.add(a);
    }
  }
  const hasUnassigned = local.some((t) => effectiveAssignee(t) === UNASSIGNED);
  if (hasUnassigned) order.push(UNASSIGNED);

  function commit(next: Task[]) {
    setLocal(next);
    onSave(next).catch(() => {
      /* error surfaced via the `error` prop from the parent */
    });
  }

  function reassign(taskId: string, toName: string) {
    const task = local.find((t) => t.id === taskId);
    if (!task || effectiveAssignee(task) === toName) return;
    commit(
      local.map((t) => (t.id === taskId ? { ...t, assignee: toName } : t))
    );
  }

  function toggle(taskId: string) {
    commit(
      local.map((t) => (t.id === taskId ? { ...t, done: !t.done } : t))
    );
  }

  if (order.length === 0) {
    return (
      <section className="card p-6">
        <SectionHeader saving={saving} />
        <p className="text-sm py-8 text-center" style={{ color: "var(--text-3)" }}>
          No participants or tasks for this meeting yet.
        </p>
      </section>
    );
  }

  const unpushedIds = local.filter((t) => !t.jiraKey).map((t) => t.id);
  const pushingAll = unpushedIds.length > 0 && unpushedIds.every((i) => pushing.has(i));

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <SectionHeader saving={saving} error={error} />
        {jiraEnabled && onPushToJira && unpushedIds.length > 0 && (
          <button
            type="button"
            onClick={() => pushJira(unpushedIds)}
            disabled={pushingAll}
            className="btn-ghost text-xs"
            title="Create Jira issues for all action items"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
              {pushingAll ? "hourglass_top" : "sync"}
            </span>
            {pushingAll ? "Syncing…" : "Push to Jira"}
          </button>
        )}
      </div>
      {jiraError && (
        <p className="text-xs" style={{ color: "var(--red)" }}>
          Jira: {jiraError}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {order.map((name) => {
          const snap = snapByName.get(name);
          const colTasks = local.filter((t) => effectiveAssignee(t) === name);
          const isOver = dragOver === name;
          return (
            <div
              key={name}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragOver !== name) setDragOver(name);
              }}
              onDragLeave={(e) => {
                // only clear when actually leaving the column subtree
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setDragOver((c) => (c === name ? null : c));
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain");
                if (id) reassign(id, name);
                setDragOver(null);
              }}
              className={`card p-4 space-y-3 transition-colors ${isOver ? "drop-active" : ""}`}
            >
              {/* Column header */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="material-symbols-outlined shrink-0"
                    style={{
                      fontSize: 18,
                      color: name === UNASSIGNED ? "var(--text-3)" : "var(--accent)",
                    }}
                  >
                    {name === UNASSIGNED ? "inbox" : "account_circle"}
                  </span>
                  <span
                    className="text-sm font-semibold truncate"
                    style={{ color: "var(--text-1)" }}
                    title={name}
                  >
                    {name}
                  </span>
                </div>
                {snap && <SentimentDot score={snap.avgSentimentScore} />}
              </div>

              {snap && (
                <div className="flex items-center gap-4 text-xs">
                  <span style={{ color: "var(--text-3)" }}>
                    Talk:&nbsp;
                    <span style={{ color: "var(--text-2)" }}>
                      {Math.round(snap.talkPct)}%
                    </span>
                  </span>
                  <span style={{ color: "var(--text-3)" }}>
                    Tasks:&nbsp;
                    <span style={{ color: "var(--text-2)" }}>{colTasks.length}</span>
                  </span>
                </div>
              )}

              {/* Task chips */}
              <div className="space-y-2 min-h-[2.5rem]">
                {colTasks.length === 0 ? (
                  <p
                    className="text-xs italic py-3 text-center rounded-lg"
                    style={{
                      color: "var(--text-3)",
                      border: "1px dashed var(--border)",
                    }}
                  >
                    Drop a task here
                  </p>
                ) : (
                  colTasks.map((task) => (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", task.id);
                        e.dataTransfer.effectAllowed = "move";
                        setDraggingId(task.id);
                      }}
                      onDragEnd={() => setDraggingId(null)}
                      className="flex items-start gap-2.5 rounded-lg px-3 py-2.5 cursor-grab active:cursor-grabbing transition-opacity"
                      style={{
                        background: "var(--bg-surface)",
                        border: "1px solid var(--border)",
                        opacity: draggingId === task.id ? 0.4 : 1,
                      }}
                    >
                      <span
                        className="material-symbols-outlined shrink-0 mt-0.5"
                        style={{ fontSize: 15, color: "var(--text-3)" }}
                      >
                        drag_indicator
                      </span>
                      <input
                        type="checkbox"
                        checked={task.done}
                        onChange={() => toggle(task.id)}
                        className="task-check mt-px"
                        aria-label="Mark task done"
                      />
                      <span
                        className="text-xs leading-relaxed flex-1 min-w-0"
                        style={{
                          color: task.done ? "var(--text-3)" : "var(--text-1)",
                          textDecoration: task.done ? "line-through" : "none",
                        }}
                      >
                        {task.text}
                      </span>

                      {/* Jira: link if pushed, send button otherwise */}
                      {task.jiraKey ? (
                        <a
                          href={task.jiraUrl}
                          target="_blank"
                          rel="noreferrer"
                          draggable={false}
                          onClick={(e) => e.stopPropagation()}
                          className="shrink-0 badge"
                          style={{
                            background: "rgba(37,99,235,0.14)",
                            color: "#7aa2ff",
                            border: "1px solid rgba(37,99,235,0.3)",
                            fontSize: "10px",
                          }}
                          title={`View ${task.jiraKey} in Jira`}
                        >
                          {task.jiraKey}
                        </a>
                      ) : jiraEnabled && onPushToJira ? (
                        <button
                          type="button"
                          draggable={false}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            pushJira([task.id]);
                          }}
                          disabled={pushing.has(task.id)}
                          aria-label="Send task to Jira"
                          title="Send to Jira"
                          className="shrink-0 flex items-center justify-center rounded-md transition-colors"
                          style={{
                            width: 24,
                            height: 24,
                            color: "var(--text-3)",
                            border: "1px solid var(--border)",
                          }}
                        >
                          <span
                            className="material-symbols-outlined"
                            style={{ fontSize: 14 }}
                          >
                            {pushing.has(task.id) ? "hourglass_top" : "sync"}
                          </span>
                        </button>
                      ) : null}
                    </div>
                  ))
                )}
              </div>

              {snap?.recommendation && (
                <p
                  className="text-xs italic pt-2.5 leading-relaxed"
                  style={{
                    color: "var(--text-3)",
                    borderTop: "1px solid var(--border)",
                  }}
                >
                  {snap.recommendation}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SectionHeader({
  saving,
  error,
}: {
  saving?: boolean;
  error?: string | null;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="material-symbols-outlined"
        style={{ color: "var(--accent)", fontSize: 18 }}
      >
        groups
      </span>
      <h2 className="text-base font-semibold" style={{ color: "var(--text-1)" }}>
        People &amp; tasks
      </h2>
      <span className="text-xs" style={{ color: "var(--text-3)" }}>
        — drag a task to reassign
      </span>
      {saving && (
        <span className="text-xs ml-1" style={{ color: "var(--text-3)" }}>
          Saving…
        </span>
      )}
      {error && (
        <span className="text-xs ml-1" style={{ color: "var(--red)" }}>
          {error}
        </span>
      )}
    </div>
  );
}
