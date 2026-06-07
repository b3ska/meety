import fs from "fs/promises";
import path from "path";
import type { Meeting } from "@/lib/types";

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "meetings.json");

// Async write mutex — serializes all write operations (read-modify-write is atomic).
let chain: Promise<unknown> = Promise.resolve();

async function readAll(): Promise<Meeting[]> {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf-8");
    const trimmed = raw.trim();
    if (!trimmed) return [];
    return JSON.parse(trimmed) as Meeting[];
  } catch (err) {
    // File or directory missing — treat as empty store.
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

async function writeAll(meetings: Meeting[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(meetings, null, 2), "utf-8");
}

/**
 * Return meetings, newest first by createdAt.
 * Excludes archived meetings unless `includeArchived` is set; pass
 * `onlyArchived` to return just the archived ones (restore view).
 */
export async function listMeetings(opts?: {
  includeArchived?: boolean;
  onlyArchived?: boolean;
}): Promise<Meeting[]> {
  const all = await readAll();
  const filtered = all.filter((m) => {
    if (opts?.onlyArchived) return m.archived === true;
    if (opts?.includeArchived) return true;
    return m.archived !== true;
  });
  return filtered.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/** Return a single meeting by id, or null if not found. */
export async function getMeeting(id: string): Promise<Meeting | null> {
  const all = await readAll();
  return all.find((m) => m.id === id) ?? null;
}

/** Upsert a meeting by id (replace if exists, append if new). Serialized via mutex. */
export function saveMeeting(m: Meeting): Promise<void> {
  chain = chain.then(async () => {
    const all = await readAll();
    const idx = all.findIndex((existing) => existing.id === m.id);
    if (idx !== -1) {
      all[idx] = m;
    } else {
      all.push(m);
    }
    await writeAll(all);
  });
  return chain as Promise<void>;
}

/**
 * Shallow-merge patch into the meeting with the given id.
 * Returns the updated meeting, or null if not found. Serialized via mutex.
 */
export function updateMeeting(
  id: string,
  patch: Partial<Meeting>
): Promise<Meeting | null> {
  const result = chain.then(async () => {
    const all = await readAll();
    const idx = all.findIndex((m) => m.id === id);
    if (idx === -1) return null;
    const updated: Meeting = { ...all[idx], ...patch, id }; // id cannot be overwritten
    all[idx] = updated;
    await writeAll(all);
    return updated;
  });
  chain = result.catch(() => undefined);
  return result;
}

/**
 * Mark meetings orphaned in "processing" as "error". Pure + injectable so it can
 * be unit-tested without touching disk.
 *
 * A transcription job lives only in the worker process; if that process is
 * reloaded (e.g. a deploy) mid-job, the meeting's status stays persisted as
 * "processing" with no job left to advance it — stuck forever. The audio buffer
 * is gone, so we can't resume; we surface a clear error and let the user re-upload.
 *
 * Staleness guard: only touch meetings older than `maxAgeMs`, so a job still
 * legitimately in flight in another cluster worker is never killed.
 */
export function reconcileStalledMeetings(
  meetings: Meeting[],
  nowMs: number,
  maxAgeMs: number
): { meetings: Meeting[]; recovered: number } {
  let recovered = 0;
  const next = meetings.map((m) => {
    if (
      m.status === "processing" &&
      nowMs - new Date(m.createdAt).getTime() > maxAgeMs
    ) {
      recovered++;
      return {
        ...m,
        status: "error" as const,
        error:
          "Processing was interrupted by a server restart. Please re-upload the recording.",
      };
    }
    return m;
  });
  return { meetings: next, recovered };
}

/**
 * Sweep orphaned "processing" meetings to "error". Call once on server startup.
 * Default staleness threshold (10 min) sits above the transcription polling
 * timeout (7 min) and the ingest route's maxDuration (5 min), so only truly
 * orphaned jobs are swept — never a healthy in-flight one. Serialized via mutex.
 */
export function recoverInterruptedMeetings(
  maxAgeMs = 10 * 60 * 1000
): Promise<number> {
  const result = chain.then(async () => {
    const all = await readAll();
    const { meetings, recovered } = reconcileStalledMeetings(
      all,
      Date.now(),
      maxAgeMs
    );
    if (recovered > 0) await writeAll(meetings);
    return recovered;
  });
  chain = result.catch(() => undefined);
  return result;
}

/**
 * Permanently remove a meeting by id. Serialized via mutex.
 * Returns true if a record was removed, false if no such meeting existed.
 */
export function deleteMeeting(id: string): Promise<boolean> {
  const result = chain.then(async () => {
    const all = await readAll();
    const next = all.filter((m) => m.id !== id);
    if (next.length === all.length) return false;
    await writeAll(next);
    return true;
  });
  chain = result.catch(() => undefined);
  return result;
}
