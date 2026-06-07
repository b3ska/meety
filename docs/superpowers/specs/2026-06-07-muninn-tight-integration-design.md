# Tight Muninn Integration — Design

**Date:** 2026-06-07
**Branch:** `feat/muninn-tight-integration`
**Goal:** Make the meeting-intelligence app tightly coupled to Muninn. On upload, *all* derived
info (summary, per-person snapshots, tasks) lands in Muninn automatically and durably. In chat,
context is fetched from Muninn automatically — broadly (Company) or focused on one meeting
(Meeting, with the full transcript loaded). Use Muninn best practices throughout.

## Current state (before)

- `lib/muninn.ts`: hand-rolled MCP client. Exposes `rememberMemory` (returns void) and
  `recallMemories` (returns `string[]`).
- `lib/pipeline.ts` `writeMemories`: writes summary + per-person snapshots **one-by-one** via
  `muninn_remember`. **Tasks are not stored.** Reindex re-runs it → **duplicate memories**.
- `app/api/chat/route.ts`: single `recallMemories([question])`; scope is `"company" | "project"`.
- `app/chat/page.tsx`: Company/Project toggle, sends `{ question, scope }`.

## Decisions

1. **Full best-practice write set**: batch writes, store tasks as atomic memories, link related
   memories, evolve-on-reindex (no duplicates), entity-tagged.
2. **Track Muninn IDs** on the meeting record → reindex/rename `evolve`s in place (no duplicates).
3. **Chat selector = Company / Meeting** (not Project).
   - Company: broad recall across all memories.
   - Meeting: pick one meeting → load its **full transcript** + focused deep recall.
4. **Transcript budget**: single meeting → full transcript; if it exceeds the token budget, fall
   back to that meeting's summary + a truncation note. Always also include recalled memories.
5. **Hierarchy via `remember_batch` + inline `is_part_of` relationships** to a root summary memory
   — NOT `muninn_remember_tree` (tree nodes can't carry `entities`/`summary`, which Muninn recall
   relies on).

## Architecture

### Data model — `lib/types.ts`
```ts
export interface MuninnRefs {
  summaryId: string;
  snapshotIds: Record<string, string>; // employeeName -> engram id
  taskIds: Record<string, string>;     // task.id -> engram id
}
// Meeting.muninnRefs?: MuninnRefs
```
`Scope` changes: `"company" | "project"` → `"company" | "meeting"`.

### Client layer — `lib/muninn.ts`
- `rememberMemory(args)` → returns the engram **id** (parse defensively from result text).
- `rememberBatch(memories[])` → returns `string[]` ids, in input order (≤50/call).
- `evolveMemory(id, newContent, reason)` → fail-soft.
- `recallStructured(context, opts)` → returns `RecalledMemory[]`
  (`{ id?, type?, summary?, content?, entities? }`), with `mode`/`profile`/`limit`/`threshold`.
- Add a shared id-extraction helper (handles `{id}`, `{engram_id}`, `{ids:[...]}`, arrays).

### Write/sync — `lib/pipeline.ts`
Replace `writeMemories` with **`syncMemories(meeting)`**:
- **Create path** (no `muninnRefs`):
  1. `rememberMemory` the summary as the **root** (full entities: meeting, project?, department?,
     people) → `summaryId`.
  2. One `rememberBatch`: per-person snapshot + per-task (`type:"task"`), each with `entities`
     (person/meeting/project) and `relationships:[{ target_id: summaryId, relation:"is_part_of" }]`.
  3. Map returned ids by index → `snapshotIds` / `taskIds`. Persist `muninnRefs` via `updateMeeting`.
- **Update path** (has `muninnRefs`):
  - `evolve` summary + each known snapshot/task in place.
  - `remember` any *new* speaker/task (post-rename) and add to the maps; persist.
- Returns `{ created, updated, failed, errors }`. Fail-soft per item; persist whatever succeeded.

### Wiring
- `processMeeting` → `syncMemories(updated)` (creates on first run). Upload = auto-store.
- `POST /api/meetings/[id]/reindex` → `syncMemories` (now evolves).
- `PATCH /api/meetings/[id]` (speaker rename / task edits) → `syncMemories` so edits flow to
  Muninn automatically (evolve in place; renamed speakers create fresh snapshot memories).

### Chat — `app/api/chat/route.ts`, `lib/llm.ts`, `app/chat/page.tsx`
- Request body: `{ question, scope, meetingId? }`.
- **Company**: `recallStructured([question], { mode:"balanced", limit:12 })`.
- **Meeting**: `getMeeting(meetingId)` → transcript (budgeted, else summary) +
  `recallStructured([question, meeting.title], { mode:"deep", profile:"structural", limit:8 })`.
- `chat()` accepts structured memories + optional transcript; prompt has a **Transcript** block and
  a **Memory** block (each memory rendered with `type` + `entities` + `summary`).
- UI: Company button + Meeting dropdown (populated from `GET /api/meetings`, ready meetings only).
  Token budget helper (`~4 chars/token`, cap ~12k tokens) in `lib/llm.ts`.

## Error handling
- Writes/evolves: fail-soft, logged, counted; `muninnRefs` saved for successes.
- Recall: fail-soft → `[]`.
- Transcript over budget → summary fallback + note.

## Hardening (MVP)
- **Content-fingerprint guard.** `MuninnRefs.hashes` stores a sha1 fingerprint per memory.
  Re-sync skips `evolve` when content is unchanged (report counts it `unchanged`), so a plain
  reindex causes zero version churn and leaves `is_part_of` edges intact. `evolve` (and its edge
  staleness) only happens on a genuine content change.

## Verification
1. Upload a meeting → vault has 1 summary + N snapshots + M tasks, snapshots/tasks `is_part_of`
   the summary; `meeting.muninnRefs` populated.
2. Reindex (or rename a speaker) → report shows `updated > 0`, `created 0`; **no new memories**.
3. Chat Company → grounded cross-meeting answer. Chat Meeting → answer cites that transcript.
4. `npm run build` clean; `npx tsc --noEmit` clean.

## Out of scope
- Per-project chat scoping / project picker (selector is Company/Meeting only).
- Removing memories for speakers deleted after a rename (left in place).
- Storing meeting `decisions` as a distinct type (could be a later enhancement).
