# Meeting Detail Dashboard Redesign — Design

**Date:** 2026-06-07
**Scope:** Meeting detail page (`/meetings/[id]`) layout + UX, shared markdown
rendering, and meetings-list (`/`) card polish. Laptop/PC-first.

## Goal

Make the meeting detail view use laptop width well, render richer AI markdown,
surface the transcript (currently never shown), turn per-person tasks into a
draggable reassignment board, and add a Muninn-tied "Ask about this meeting"
entry point (placeholder for now).

## Decisions (locked with user)

- **Layout:** two-column (`minmax(0,1fr)` main + `340px` sticky rail), collapses
  to single column under ~1024px. Detail container `max-w-4xl` → `max-w-7xl`.
- **Markdown:** adopt `react-markdown` + `remark-gfm`; keep the `<Markdown text />`
  API as a drop-in (Knowledge Vault chat benefits automatically). No raw HTML.
- **Transcript:** new, collapsible, collapsed by default.
- **Action items card:** REMOVED. Tasks are auto-split per speaker; task
  interaction moves into the people board.
- **People board:** full-width below the grid (supersedes the earlier
  "condensed tiles in rail" choice — DnD needs room). Tasks are draggable
  between people to reassign.
- **Talk time + Name speakers:** merged into one compact card in the rail, near
  the top. Name inputs stay small.
- **Ask about this meeting:** Muninn-tied placeholder card at top of main column.
  Non-functional UI only; wired up later.

## Layout

```
┌──────────────── Header (full width): back · title · type/status · date · duration · error ┐
├──────────────────────────────────────────────┬─────────────────────────────┐
│ MAIN (1fr)                                     │ STICKY RAIL (340px)         │
│  1. Ask about this meeting  (Muninn placeholder)│  1. Talk time + Name speakers│
│  2. Summary  (rich markdown)                    │     (merged, compact)        │
│  3. Transcript  (collapsible, collapsed)        │  2. Quick stats              │
├──────────────────────────────────────────────┴─────────────────────────────┤
│ PEOPLE & TASKS BOARD (full width) — draggable task chips, reassign by drop   │
└──────────────────────────────────────────────────────────────────────────────┘
```

Processing / error / loading states unchanged in behavior; restyled to fit.

## Components

### `components/Markdown.tsx` (rewrite)
- Internals → `react-markdown` + `remark-gfm`. Same `{ text: string }` prop.
- Element renderers mapped to a `.markdown-body` themed scope (headings,
  ul/ol/li incl. nesting, code/pre, table, blockquote, hr, strong/em, a).
- Links: `target="_blank" rel="noopener noreferrer"`.
- No `rehype-raw` — raw HTML stays inert (safe).

### `app/globals.css` (additions)
- `.markdown-body` element styles using NovaSpark tokens (color, spacing,
  table borders, code background `--bg-surface`, blockquote left border).
- Small stat-tile + (optional) drag-over highlight utility.

### `components/AskAboutMeeting.tsx` (new — placeholder)
- Card: heading ("Ask about this meeting"), short helper line, a text input +
  send button. Visually present, **inert** (disabled / "coming soon" affordance).
- No API call. Marked with a `TODO` for later Muninn wiring (meeting-scoped chat,
  analogous to `app/chat` but bound to this meeting id).

### `components/TalkTimePanel.tsx` (new — merge)
- Combines compact "Name speakers" inputs + the existing `TalkTimeChart`.
- Name inputs: small `label chip → input` rows (reuse current logic), compact
  enough for the 340px rail. Save button + inline saved/error state (existing
  `saveSpeakerMap` flow moves here or stays in the page and is passed down).
- Chart rendered below the inputs.

### `components/QuickStats.tsx` (new)
- Compact tiles derived from existing data — **no API change**:
  duration, participants count, tasks done/total, avg sentiment
  (`SentimentDot` + label, averaged from snapshots/participation).

### `components/Transcript.tsx` (new)
- Collapsible (collapsed by default). Renders `meeting.utterances` grouped into
  speaker turns; speaker name resolved via `speakerMap` (fallback `Speaker A`);
  timestamp from `start` (ms → mm:ss). "Copy transcript" button copies
  `transcriptText`. Empty state when no utterances.

### `components/PeopleBoard.tsx` (new — replaces Action items + snapshots)
- Full-width grid of **person columns**. Person set = union of snapshot
  `employeeName`s (+ an "Unassigned" column if any unassigned tasks exist).
- Each column header: name, talk %, `SentimentDot`, optional recommendation.
- Tasks rendered as **draggable chips** (native HTML5 DnD: `draggable`,
  `onDragStart` carries task id; columns are drop zones, `onDrop` reassigns).
- **Source of truth for grouping = `meeting.tasks` grouped by `assignee`** (not
  `snapshots[].tasks`), so reassignment reflects immediately. Snapshot data only
  supplies talk %/sentiment/recommendation.
- Reassign: set `task.assignee = targetName`, PATCH `{ tasks }`, update meeting
  from response. Keep done-toggle on each chip (PATCH `{ tasks }`). Drag-over
  column gets a highlight. Inline save error preserved.

### `app/meetings/[id]/page.tsx` (restructure)
- Wrap ready-state content in the two-column grid + full-width board.
- Header gets a back link to `/`.
- Wire the existing PATCH helpers (`saveSpeakerMap`, `saveTasks`) into the new
  components. `diarizationLabels` / `speakerMap` draft logic unchanged.

### Meetings list — `components/MeetingCard.tsx` + `app/page.tsx`
- `MeetingCard`: add a one-line summary preview (first sentence, markdown
  stripped) and a small footer — task count + `SentimentDot` — beside the
  existing top-talker. Preserve menu/archive/delete behavior.
- `app/page.tsx`: widen list `max-w-5xl` → `max-w-6xl`.

## Data flow

- Read-only: summary, utterances, participation, snapshots.
- Mutations (existing endpoints, no API changes):
  - Speaker rename → PATCH `{ speakerMap }`.
  - Task done-toggle / reassign → PATCH `{ tasks }` (full tasks array).
- Ask-about-meeting: **no data flow yet** (placeholder).

## Dependencies

- Add `react-markdown` (^9) + `remark-gfm` (^4). React 19 / Next 16 Turbopack
  compatible. Run `npm install` to update `package-lock.json` (deploy uses
  `npm ci`). Verify `npm run build` passes before claiming done.

## Out of scope / YAGNI

- Real Muninn wiring for "Ask about this meeting" (placeholder only).
- Task create/delete/edit-text and due dates (keep done-toggle + reassign).
- Light mode, transcript search, virtualization, calendar auto-mapping.

## Risks

- Non-standard Next 16.2.7 build (per `web/AGENTS.md`) — react-markdown is a
  pure client component; verify the Turbopack build before done.
- Tasks exist both flat (`meeting.tasks`) and in `snapshots[].tasks`. Board
  groups the flat list to avoid stale reassignments; confirm PATCH `{ tasks }`
  is the canonical write path.
- Native DnD has no touch support — acceptable (laptop/PC-first).

## Verification

- `npm run build` passes (Turbopack).
- Manual: detail page renders two-column on a laptop width; markdown shows
  headings/lists/tables/code/links; transcript expands/copies; dragging a task
  between people reassigns and persists across reload; rename speakers updates
  chart/board; list cards show preview + stats.
```
