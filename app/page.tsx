"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { Meeting, MeetingType } from "@/lib/types";
import MeetingCard from "@/components/MeetingCard";
import { ACCEPT_ATTR, ACCEPT_HINT, validateUploadFile } from "@/lib/constants";

const MEETING_TYPES: MeetingType[] = [
  "standup",
  "one_on_one",
  "planning",
  "retro",
  "review",
  "other",
];

const TYPE_LABELS: Record<MeetingType, string> = {
  standup:    "Standup",
  one_on_one: "1-on-1",
  planning:   "Planning",
  retro:      "Retro",
  review:     "Review",
  other:      "Other",
};

export default function MeetingsDashboard() {
  const router = useRouter();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // List view + per-meeting CRUD state
  const [showArchived, setShowArchived] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Meeting | null>(null);
  const [deleting, setDeleting] = useState<Meeting | null>(null);

  // Upload form state
  const [title, setTitle] = useState("");
  const [type, setType] = useState<MeetingType>("standup");
  const [participants, setParticipants] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchMeetings(showArchived);
  }, [showArchived]);

  async function fetchMeetings(archived: boolean) {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch(`/api/meetings${archived ? "?archived=1" : ""}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Meeting[] = await res.json();
      setMeetings(data);
    } catch (err) {
      setFetchError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function patchMeeting(id: string, body: Record<string, unknown>) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/meetings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e?.error ?? `HTTP ${res.status}`);
      }
      await fetchMeetings(showArchived);
    } catch (err) {
      setFetchError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function confirmDelete(m: Meeting) {
    setBusyId(m.id);
    try {
      const res = await fetch(`/api/meetings/${m.id}`, { method: "DELETE" });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e?.error ?? `HTTP ${res.status}`);
      }
      setDeleting(null);
      await fetchMeetings(showArchived);
    } catch (err) {
      setFetchError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null;
    setFile(selected);
    if (selected) {
      const err = validateUploadFile(selected.name, selected.size);
      setUploadError(err);
    } else {
      setUploadError(null);
    }
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !title.trim()) return;

    // Re-validate on submit
    const validationErr = validateUploadFile(file.name, file.size);
    if (validationErr) {
      setUploadError(validationErr);
      return;
    }

    setUploading(true);
    setUploadError(null);

    const form = new FormData();
    form.append("file", file);
    form.append("title", title.trim());
    form.append("type", type);
    form.append("participants", participants.trim());

    try {
      const res = await fetch("/api/ingest", { method: "POST", body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      const { id } = await res.json();
      router.push(`/meetings/${id}`);
    } catch (err) {
      setUploadError((err as Error).message);
      setUploading(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-10">
      {/* ── Page header ── */}
      <div>
        <h1
          className="text-2xl font-bold tracking-tight"
          style={{ color: "var(--text-1)" }}
        >
          Dashboard
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-2)" }}>
          Upload a recording to get AI-powered meeting insights.
        </p>
      </div>

      {/* ── Upload card ── */}
      <section className="glass-card p-6">
        <div className="flex items-center gap-2 mb-5">
          <span
            className="material-symbols-outlined"
            style={{ color: "var(--accent)", fontSize: 20 }}
          >
            upload_file
          </span>
          <h2 className="text-base font-semibold" style={{ color: "var(--text-1)" }}>
            Upload a recording
          </h2>
        </div>

        <form onSubmit={handleUpload} className="flex flex-col gap-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {/* Title */}
            <div className="sm:col-span-2 space-y-1.5">
              <label className="text-xs font-medium" style={{ color: "var(--text-2)" }}>
                Meeting title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Weekly team standup"
                className="input"
                required
              />
            </div>

            {/* Type */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium" style={{ color: "var(--text-2)" }}>
                Type
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as MeetingType)}
                className="input"
              >
                {MEETING_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium" style={{ color: "var(--text-2)" }}>
              Expected participants
            </label>
            <textarea
              value={participants}
              onChange={(e) => setParticipants(e.target.value)}
              placeholder="Alice Johnson, Bob Smith, Yani Petrova"
              className="input min-h-20 resize-y"
            />
            <p className="text-xs" style={{ color: "var(--text-3)" }}>
              Optional. Add names separated by commas or new lines to improve automatic speaker and task assignment.
            </p>
          </div>

          {/* File drop zone */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium" style={{ color: "var(--text-2)" }}>
              Audio / video file
            </label>
            <div
              className="flex items-center gap-3 rounded-xl p-5 cursor-pointer transition-all duration-200"
              style={{
                border:     `2px dashed ${uploadError ? "var(--red)" : "var(--border)"}`,
                background: "var(--bg-surface)",
              }}
              role="button"
              tabIndex={0}
              onClick={() => fileRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileRef.current?.click();
                }
              }}
            >
              <span
                className="material-symbols-outlined shrink-0"
                style={{
                  fontSize: 24,
                  color: file ? "var(--accent)" : "var(--text-3)",
                }}
              >
                {file ? "audio_file" : "cloud_upload"}
              </span>
              <div className="flex-1 min-w-0">
                <span
                  className="text-sm block truncate"
                  style={{ color: file ? "var(--text-1)" : "var(--text-3)" }}
                >
                  {file ? file.name : "Click to select a file…"}
                </span>
                <span className="text-xs mt-0.5 block" style={{ color: "var(--text-3)" }}>
                  Supported: {ACCEPT_HINT}
                </span>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPT_ATTR}
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
          </div>

          {/* Inline error */}
          {uploadError && (
            <div
              className="flex items-start gap-2 rounded-xl px-4 py-3 text-sm"
              style={{
                background: "rgba(239,68,68,0.1)",
                border:     "1px solid rgba(239,68,68,0.25)",
                color:      "var(--red)",
              }}
            >
              <span className="material-symbols-outlined shrink-0" style={{ fontSize: 18 }}>
                error
              </span>
              {uploadError}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={uploading || !file || !title.trim() || !!uploadError}
              className="btn-primary"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                {uploading ? "hourglass_top" : "analytics"}
              </span>
              {uploading ? "Uploading…" : "Upload & analyse"}
            </button>
          </div>
        </form>
      </section>

      {/* ── Meeting list ── */}
      <section>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-1">
            <TabButton active={!showArchived} onClick={() => setShowArchived(false)}>
              All meetings
            </TabButton>
            <TabButton active={showArchived} onClick={() => setShowArchived(true)}>
              Archived
            </TabButton>
          </div>
          {meetings.length > 0 && (
            <span className="badge" style={{ background: "var(--bg-surface-high)", color: "var(--text-2)" }}>
              {meetings.length}
            </span>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="card p-5 h-36 animate-pulse"
                style={{ background: "var(--bg-card)" }}
              />
            ))}
          </div>
        ) : fetchError ? (
          <div
            className="card p-8 text-center"
            style={{ color: "var(--text-2)" }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 36, color: "var(--text-3)", display: "block", marginBottom: 8 }}
            >
              cloud_off
            </span>
            <p className="text-sm">Failed to load meetings: {fetchError}</p>
            <button onClick={() => fetchMeetings(showArchived)} className="btn-ghost mt-4 text-xs">
              <span className="material-symbols-outlined" style={{ fontSize: 15 }}>refresh</span>
              Retry
            </button>
          </div>
        ) : meetings.length === 0 ? (
          <div className="card p-14 text-center">
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 44, color: "var(--text-3)", display: "block", marginBottom: 12 }}
            >
              {showArchived ? "inventory_2" : "calendar_today"}
            </span>
            <p className="text-sm font-medium" style={{ color: "var(--text-2)" }}>
              {showArchived
                ? "No archived meetings."
                : "No meetings yet — upload one above."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {meetings.map((m) => (
              <MeetingCard
                key={m.id}
                meeting={m}
                archivedView={showArchived}
                busy={busyId === m.id}
                onEdit={setEditing}
                onArchive={(meeting, archived) => patchMeeting(meeting.id, { archived })}
                onDelete={setDeleting}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Edit metadata modal ── */}
      {editing && (
        <EditMeetingModal
          meeting={editing}
          busy={busyId === editing.id}
          onClose={() => setEditing(null)}
          onSave={async (fields) => {
            await patchMeeting(editing.id, fields);
            setEditing(null);
          }}
        />
      )}

      {/* ── Delete confirm modal ── */}
      {deleting && (
        <ConfirmDeleteModal
          meeting={deleting}
          busy={busyId === deleting.id}
          onCancel={() => setDeleting(null)}
          onConfirm={() => confirmDelete(deleting)}
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-base font-semibold px-1 pb-1 transition-colors"
      style={{
        color: active ? "var(--text-1)" : "var(--text-3)",
        borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
      }}
    >
      {children}
    </button>
  );
}

function ModalShell({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.55)" }}
      onClick={onClose}
    >
      <div
        className="glass-card p-6 w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function EditMeetingModal({
  meeting,
  busy,
  onClose,
  onSave,
}: {
  meeting: Meeting;
  busy: boolean;
  onClose: () => void;
  onSave: (fields: {
    title: string;
    type: MeetingType;
    project: string;
    department: string;
  }) => void;
}) {
  const [title, setTitle] = useState(meeting.title);
  const [type, setType] = useState<MeetingType>(meeting.type);
  const [project, setProject] = useState(meeting.project ?? "");
  const [department, setDepartment] = useState(meeting.department ?? "");

  return (
    <ModalShell onClose={onClose}>
      <h2 className="text-base font-semibold mb-4" style={{ color: "var(--text-1)" }}>
        Edit meeting details
      </h2>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          onSave({ title: title.trim(), type, project, department });
        }}
      >
        <div className="space-y-1.5">
          <label className="text-xs font-medium" style={{ color: "var(--text-2)" }}>Title</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium" style={{ color: "var(--text-2)" }}>Type</label>
          <select className="input" value={type} onChange={(e) => setType(e.target.value as MeetingType)}>
            {MEETING_TYPES.map((t) => (
              <option key={t} value={t}>{TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium" style={{ color: "var(--text-2)" }}>Project</label>
            <input className="input" value={project} onChange={(e) => setProject(e.target.value)} placeholder="Optional" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium" style={{ color: "var(--text-2)" }}>Department</label>
            <input className="input" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Optional" />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy || !title.trim()}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function ConfirmDeleteModal({
  meeting,
  busy,
  onCancel,
  onConfirm,
}: {
  meeting: Meeting;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <ModalShell onClose={onCancel}>
      <div className="flex items-center gap-2 mb-3">
        <span className="material-symbols-outlined" style={{ color: "var(--red)", fontSize: 22 }}>
          warning
        </span>
        <h2 className="text-base font-semibold" style={{ color: "var(--text-1)" }}>
          Delete meeting?
        </h2>
      </div>
      <p className="text-sm leading-relaxed mb-5" style={{ color: "var(--text-2)" }}>
        Permanently delete <strong style={{ color: "var(--text-1)" }}>{meeting.title}</strong> and
        remove it from the Knowledge Vault memory. This can&apos;t be undone.
      </p>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onCancel} disabled={busy}>Cancel</button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="btn-primary"
          style={{ background: "var(--red)", borderColor: "var(--red)" }}
        >
          {busy ? "Deleting…" : "Delete"}
        </button>
      </div>
    </ModalShell>
  );
}
