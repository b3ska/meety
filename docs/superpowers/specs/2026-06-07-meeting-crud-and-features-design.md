# Meeting CRUD + Feature Roadmap — Design

**Date:** 2026-06-07
**Project:** WINNR Digithon — AI Meeting Intelligence MVP
**Scope:** Complete meeting CRUD (build now) + design specs for the three "Soon" sidebar features (Insights, Task Tracker, Recordings).

## Context

Current CRUD state:

| Op | Status |
|----|--------|
| Create | `POST /api/ingest` (upload) |
| Read | `GET /api/meetings` (list), `GET /api/meetings/[id]` (detail) |
| Update | Partial — `PATCH /api/meetings/[id]` handles speaker-rename + task edits only |
| Delete | None — no endpoint, no `store.deleteMeeting`, no Muninn cleanup, no UI |

The sidebar shows three disabled "Soon" items: Insights, Task Tracker, Recordings.

Decisions made during brainstorming:
- Build full meeting CRUD now; spec the three features for later.
- Delete is a user choice at delete-time: **Archive** (soft, FE filter) or **Delete + forget memories** (hard).
- Recordings = transcript archive, no audio (audio deletion privacy decision stays).
- Insights covers all four facets: per-employee, per-project/department, company overview, AI narrative.
- Hard-delete forgets memories by **stored memory IDs** captured at write time; legacy meetings (no stored IDs) fall back to entity-based forget.

---

## Section 1 — Meeting CRUD (BUILD NOW)

### Type changes (`lib/types.ts`)
- `Meeting.archived?: boolean` — soft-delete flag. Separate from `status` (which stays `processing` | `ready` | `error`).
- `Meeting.memoryIds?: string[]` — IDs of Muninn memories this meeting wrote, for forget-on-delete.

### Store (`lib/store.ts`)
- `deleteMeeting(id: string): Promise<boolean>` — hard remove from array, mutex-serialized. Returns whether a record was removed.
- `listMeetings(opts?: { includeArchived?: boolean })` — default excludes archived.

### Muninn (`lib/muninn.ts`)
- `rememberMemory` returns the created memory **id** (parse from the `muninn_remember` response payload). Return type changes from `Promise<void>` to `Promise<string | null>` (null if id not parseable — non-fatal).
- New `forgetMemory(id: string): Promise<void>` → `callMuninnTool("muninn_forget", { vault, id })`. Fail-soft.
- New `forgetMemoriesByEntity(entityName: string): Promise<void>` — fallback for legacy meetings: `muninn_find_by_entity` → forget each id. Fail-soft.

### Pipeline (`lib/pipeline.ts`)
- `writeMemories` collects each returned id into the report (`MemoryWriteReport.ids: string[]`).
- After a successful run, `processMeeting` persists `memoryIds` onto the meeting via `updateMeeting`.
- `reindex` endpoint likewise refreshes `memoryIds`.

### API (`app/api/meetings/[id]/route.ts`)
- `PATCH` — extend the accepted body to also include `archived?: boolean` and metadata (`title?`, `type?`, `project?`, `department?`). Metadata edits do **not** recompute metrics. Existing speakerMap/tasks behavior unchanged.
- `DELETE` — hard delete: forget memories (by `memoryIds`; fallback to entity-based forget by title if absent) → `deleteMeeting(id)`. Fail-soft on the forget step (never block record deletion on a memory error). Returns 404 if not found, 200 on success.
- `GET /api/meetings?archived=1` (in `app/api/meetings/route.ts`) — returns archived meetings for the restore view.

### UI
- **Dashboard meeting cards**: overflow (⋮) menu → Edit / Archive / Delete.
- **Edit**: modal with title, type (select), project, department. Saves via `PATCH`.
- **Archive**: instant toggle (`PATCH { archived: true }`); card leaves the active list. An "Archived" filter view lists archived meetings with a **Restore** action (`PATCH { archived: false }`).
- **Delete**: confirm modal — "Permanently delete this meeting and remove it from the Knowledge Vault memory. This can't be undone." On confirm → `DELETE`.

### Error handling
- Delete forget step is fail-soft and logged; record deletion proceeds regardless.
- 404 on missing meeting for PATCH/DELETE.
- UI surfaces API errors inline (existing pattern).

### Verification
- Create → archive → confirm hidden from default list, visible in archived view → restore → reappears.
- Edit metadata → persists, metrics unchanged.
- Hard delete → record gone from store; corresponding memories forgotten in vault (verify via recall returning nothing for that meeting).
- Legacy meeting (no `memoryIds`) hard delete → entity-fallback forget runs.

---

## Section 2 — Task Tracker (`/tasks`) — BUILD (design: `winnr_task_tracker_refined`)

Aggregated task command center. Tasks come from meetings; standalone "manual" tasks are also supported.

Decisions (locked): LLM-assigned **priority**, **Add Manual Task**, **Sync with Jira** as a disabled "Soon" button, **due-date editing**.

- **Data model**
  - `Task` gains `priority?: "high" | "medium" | "low"`.
  - Standalone tasks (no meeting): stored in `data/standalone-tasks.json` as `Task & { createdAt: string }`. New `lib/standaloneTasks.ts` mirrors `store.ts` (mutex chain, JSON file): list / add / update / delete.
  - Tracker row shape: `TrackerTask = Task & { meetingId: string | null; meetingTitle: string | null; meetingType?: MeetingType }`. `meetingId === null` ⇒ manual task.
- **LLM**: `generateTasks` also returns `priority` per task (prompt + parsing). Existing meetings' tasks without priority render as unset.
- **API**
  - `GET /api/tasks` → aggregated `TrackerTask[]` from all non-archived meetings + standalone store; open-first, then by dueDate/createdAt.
  - `POST /api/tasks` → create a standalone task `{ text, assignee?, priority?, dueDate? }`.
  - `PATCH /api/tasks/[id]` → body carries `meetingId: string | null`; routes to the owning meeting's task array (recompute snapshots) or the standalone store. Fields: done / text / assignee / priority / dueDate.
  - `DELETE /api/tasks/[id]?meetingId=` → standalone removes from store; meeting task removes from its array (recompute snapshots).
- **UI** (`/tasks`, adapt design layout to our theme): header "Execution Command Center"; **Filter** (status / assignee / priority) and disabled **Sync with Jira**; "Extracted Action Items" card with rows = checkbox, editable text (strike when done), priority badge (High/Med/Low → red/amber/neutral), due date, assignee; **Add Manual Task** inline/modal. Optimistic done toggle.
- **Sidebar**: enable the "Task Tracker" nav item → `/tasks`.

---

## Section 3 — Insights (`/insights`) — SPEC ONLY

All four facets. **Metric honesty (locked): show only genuinely-computed or transparently-derived metrics** — talk%, sentiment + trend, turns, words, **words-per-minute pacing** (`words / talkTimeSec × 60`), task counts, and a clearly-defined **balance index** (evenness of talk-time distribution). No fabricated composite scores (the design's "Participation Quality 86" / "Team Avg Diff" are not reproduced as-is). AI Coach narrative grounded in these real aggregates. Design ref: `winnr_insights_performance`.

- **Lib** `lib/insights.ts` (pure, unit-testable): folds over all meetings →
  - **Per-employee**: time series of talkPct, avg sentiment, task count across meetings (sorted by `createdAt`).
  - **Per-project / department**: rollups — avg participation, avg sentiment, open-task count.
  - **Company overview**: meeting count, total/open tasks, sentiment distribution, most/least active people.
- **AI narrative**: feed aggregates to `lib/llm.ts` → short "what's trending" brief; optionally ground with a `recallMemories` call.
- **API**: `GET /api/insights` → `{ perEmployee, perProject, company }`. Narrative either in the same call or `POST /api/insights/narrative`.
- **UI**: stat cards (company), Recharts line/area (per-employee trends — Recharts already a dep), bar charts (rollups), narrative card. Scope switch (employee / project / company).

---

## Section 4 — Recordings (`/recordings`) — SPEC ONLY

Transcript archive, no audio. Audio stays deleted post-processing. Design ref: `winnr_recordings_summaries` — but the design's **play button is dropped** (no audio retained); cards open the transcript instead.

- **Data**: reuse meetings; no new store.
- **Search**: **server-side** `GET /api/recordings?q=` greps `transcriptText` + speaker names + title and returns matches *without* shipping full transcripts to the client (transcripts are large).
- **UI**: search bar + Filter/Sort + card grid (title, summary snippet, date · duration, status badge, insight/task count). Card → meeting detail (transcript lives there). A "view transcript" affordance replaces the play button.
- **Overlap note**: differentiator vs Dashboard = transcript full-text search + no upload form.

---

## Build order

1. Section 1 (Meeting CRUD) — now.
2. Section 2 (Task Tracker) — next, cheapest.
3. Section 3 (Insights).
4. Section 4 (Recordings).
