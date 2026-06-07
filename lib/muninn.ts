/**
 * Muninn memory client — MCP JSON-RPC 2.0 over HTTPS.
 *
 * Verified call shape:
 *   Endpoint : process.env.MUNINN_URL  (e.g. https://winnr.tailf82123.ts.net/mcp)
 *   Auth     : Authorization: Bearer <MUNINN_TOKEN>
 *   Headers  : Content-Type: application/json, Accept: application/json, text/event-stream
 *
 *   Step 1 — initialize (POST, no session id yet):
 *     body: { jsonrpc:"2.0", id:1, method:"initialize",
 *             params:{ protocolVersion:"2024-11-05", capabilities:{},
 *                      clientInfo:{ name:"winnr-app", version:"1.0" } } }
 *     → response header "mcp-session-id" is captured and reused for all subsequent calls.
 *
 *   Step 2 — tool call (POST with mcp-session-id header):
 *     body: { jsonrpc:"2.0", id:N, method:"tools/call",
 *             params:{ name:"<tool>", arguments:{...} } }
 *     → response may be plain JSON (content-type: application/json)
 *       OR Server-Sent-Events (content-type: text/event-stream, lines: "data: {...}").
 *     Tool result is at .result.content[0].text (a JSON or plain-text string).
 */

const VAULT = process.env.MUNINN_VAULT ?? "winnr-hack";

// Module-level session cache — lazily initialized, re-inited on session error.
let sessionId: string | null = null;
let initInFlight: Promise<string> | null = null;
let callCounter = 1;

/** Read a required env var, throwing a clear error if unset. */
function getEnv(key: "MUNINN_URL" | "MUNINN_TOKEN"): string {
  const value = process.env[key];
  if (!value) throw new Error(`${key} is not set`);
  return value;
}

function nextId(): number {
  return ++callCounter;
}

/** Parse a response body that may be plain JSON or SSE. Returns the parsed object. */
async function parseResponse(res: Response): Promise<unknown> {
  const text = await res.text();
  const ct = res.headers.get("content-type") ?? "";

  if (ct.includes("text/event-stream")) {
    // SSE: find the last "data: ..." line that contains a JSON object/array.
    const lines = text.split("\n");
    let last: string | null = null;
    for (const line of lines) {
      if (line.startsWith("data:")) {
        const payload = line.slice(5).trim();
        if (payload && payload !== "[DONE]") last = payload;
      }
    }
    if (last === null) throw new Error("No data line found in SSE response");
    return JSON.parse(last);
  }

  return JSON.parse(text);
}

/** Perform the initialize handshake and cache the session id. */
async function initialize(): Promise<string> {
  const url = getEnv("MUNINN_URL");
  const token = getEnv("MUNINN_TOKEN");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "winnr-app", version: "1.0" },
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`Muninn initialize failed: ${res.status} ${res.statusText}`);
  }

  const sid = res.headers.get("mcp-session-id");
  if (!sid) throw new Error("Muninn initialize: no mcp-session-id in response");

  // Drain response body (may be SSE or JSON — we don't need the init result body).
  await res.text().catch(() => undefined);

  return sid;
}

/** Ensure we have a valid session id (lazy init, race-safe via shared promise). */
async function ensureSession(): Promise<string> {
  if (sessionId) return sessionId;
  if (!initInFlight) {
    initInFlight = initialize()
      .then((sid) => {
        sessionId = sid;
        return sid;
      })
      .finally(() => {
        initInFlight = null;
      });
  }
  return initInFlight;
}

/**
 * Call a Muninn tool, handle session retry, parse the response, and return the
 * text payload from `.result.content[0].text`. Throws on RPC-level errors.
 */
async function callMuninnTool(
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  const url = getEnv("MUNINN_URL");
  const token = getEnv("MUNINN_TOKEN");

  let sid = await ensureSession();
  const id = nextId();

  const requestBody = JSON.stringify({
    jsonrpc: "2.0",
    id,
    method: "tools/call",
    params: { name, arguments: args },
  });

  const doRequest = async (sessionIdToUse: string): Promise<Response> =>
    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${token}`,
        "mcp-session-id": sessionIdToUse,
      },
      body: requestBody,
    });

  let res = await doRequest(sid);

  // If the server signals an invalid/expired session, re-initialize once and retry.
  if (res.status === 404 || res.status === 401) {
    sessionId = null;
    sid = await ensureSession();
    res = await doRequest(sid);
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(
      `Muninn tool call "${name}" failed: ${res.status} ${res.statusText} ${errBody.slice(0, 300)}`,
    );
  }

  const rpcResponse = await parseResponse(res);
  const r = rpcResponse as {
    result?: { content?: { text?: string }[] };
    error?: { message?: string };
  };
  if (r.error) throw new Error(`Muninn RPC error: ${r.error.message ?? JSON.stringify(r.error)}`);
  return r.result?.content?.[0]?.text ?? "";
}

// ---------------------------------------------------------------------------
// Result parsing helpers
// ---------------------------------------------------------------------------

/** Parse a tool result text payload as JSON, or null if it isn't JSON. */
function parseJson(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Forget (soft-delete, excluded from recall) a single memory by id. Fail-soft. */
export async function forgetMemory(id: string): Promise<void> {
  try {
    await callMuninnTool("muninn_forget", { vault: VAULT, id });
  } catch (e) {
    console.error(`[muninn forget failed] ${id}:`, e instanceof Error ? e.message : e);
  }
}

/**
 * Fallback for meetings with no stored memory ids: find every memory mentioning
 * an entity (e.g. the meeting title) and forget each. Fail-soft.
 */
export async function forgetMemoriesByEntity(entityName: string): Promise<void> {
  try {
    const text = await callMuninnTool("muninn_find_by_entity", {
      vault: VAULT,
      entity_name: entityName,
      limit: 50,
    });
    const parsed = parseJson(text);
    const items: unknown[] = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object"
      ? ((parsed as Record<string, unknown>).memories as unknown[]) ??
        ((parsed as Record<string, unknown>).results as unknown[]) ??
        []
      : [];
    const ids = items
      .map((it) =>
        it && typeof it === "object" ? (it as Record<string, unknown>).id : undefined,
      )
      .filter((v): v is string => typeof v === "string");
    for (const id of ids) await forgetMemory(id);
  } catch (e) {
    console.error(
      `[muninn forget-by-entity failed] ${entityName}:`,
      e instanceof Error ? e.message : e,
    );
  }
}

/**
 * Extract a single engram id from a remember/evolve result.
 * Shape (verified): {"id":"01...","concept":""}. Defensive against {engram_id}.
 */
function extractId(text: string): string {
  const obj = parseJson(text);
  if (obj && typeof obj === "object") {
    const o = obj as Record<string, unknown>;
    const id = o.id ?? o.engram_id;
    if (typeof id === "string" && id) return id;
  }
  throw new Error(`Muninn: could not parse engram id from result: ${text.slice(0, 200)}`);
}

// ---------------------------------------------------------------------------
// Public API — types
// ---------------------------------------------------------------------------

export interface MemoryInput {
  content: string;
  type?: string;
  summary?: string;
  concept?: string;
  entities?: { name: string; type: string }[];
  /** Associations to existing memories, created at write time. */
  relationships?: { target_id: string; relation: string; weight?: number }[];
}

export interface RecalledMemory {
  id?: string;
  type?: string;
  summary?: string;
  content?: string;
  concept?: string;
  score?: number;
}

// ---------------------------------------------------------------------------
// Public API — writes
// ---------------------------------------------------------------------------

/** Build the tool-call arguments for a single memory (shared by remember/batch). */
function toMemoryArgs(m: MemoryInput): Record<string, unknown> {
  const args: Record<string, unknown> = { content: m.content };
  if (m.type !== undefined) args.type = m.type;
  if (m.summary !== undefined) args.summary = m.summary;
  if (m.concept !== undefined) args.concept = m.concept;
  if (m.entities !== undefined) args.entities = m.entities;
  if (m.relationships !== undefined) args.relationships = m.relationships;
  return args;
}

/**
 * Store one memory in Muninn and return its engram id.
 * Throws on hard failure so callers (e.g. ingest) can log it.
 */
export async function rememberMemory(m: MemoryInput): Promise<string> {
  const text = await callMuninnTool("muninn_remember", { vault: VAULT, ...toMemoryArgs(m) });
  return extractId(text);
}

/**
 * Store up to 50 memories in one call. Returns engram ids aligned to the input
 * order (`""` for any item the server did not store successfully).
 * Result shape (verified): {"results":[{"index":0,"id":"01...","status":"ok"}],"total":N}.
 */
export async function rememberBatch(memories: MemoryInput[]): Promise<string[]> {
  if (memories.length === 0) return [];
  const text = await callMuninnTool("muninn_remember_batch", {
    vault: VAULT,
    memories: memories.map(toMemoryArgs),
  });

  const ids = new Array<string>(memories.length).fill("");
  const parsed = parseJson(text) as { results?: unknown } | null;
  const results = parsed && Array.isArray(parsed.results) ? parsed.results : [];
  for (const r of results) {
    if (r && typeof r === "object") {
      const { index, id, status } = r as Record<string, unknown>;
      if (
        typeof index === "number" &&
        index >= 0 &&
        index < ids.length &&
        typeof id === "string" &&
        (status === undefined || status === "ok")
      ) {
        ids[index] = id;
      }
    }
  }
  return ids;
}

/**
 * Update a memory in place. Muninn versions the memory and returns the NEW
 * version's id — callers must persist it to keep future evolves valid.
 */
export async function evolveMemory(
  id: string,
  newContent: string,
  reason: string
): Promise<string> {
  const text = await callMuninnTool("muninn_evolve", {
    vault: VAULT,
    id,
    new_content: newContent,
    reason,
  });
  return extractId(text);
}

// ---------------------------------------------------------------------------
// Public API — recall
// ---------------------------------------------------------------------------

/**
 * Recall memories relevant to the given context strings, as structured objects.
 * Fail-soft: returns [] on any network or parse error.
 */
export async function recallStructured(
  context: string[],
  opts?: {
    limit?: number;
    mode?: "semantic" | "recent" | "balanced" | "deep";
    profile?: string;
    threshold?: number;
  }
): Promise<RecalledMemory[]> {
  try {
    const toolArgs: Record<string, unknown> = {
      vault: VAULT,
      context,
      limit: opts?.limit ?? 8,
    };
    if (opts?.mode !== undefined) toolArgs.mode = opts.mode;
    if (opts?.profile !== undefined) toolArgs.profile = opts.profile;
    if (opts?.threshold !== undefined) toolArgs.threshold = opts.threshold;

    const text = await callMuninnTool("muninn_recall", toolArgs);
    const parsed = parseJson(text);
    if (!parsed || typeof parsed !== "object") return [];

    // Verified shape: { memories: [{ id, content, summary, concept, score, ... }], total }.
    const raw = (parsed as Record<string, unknown>).memories;
    if (!Array.isArray(raw)) return [];

    return raw.flatMap((item): RecalledMemory[] => {
      if (!item || typeof item !== "object") return [];
      const m = item as Record<string, unknown>;
      const str = (k: string) => (typeof m[k] === "string" ? (m[k] as string) : undefined);
      const mem: RecalledMemory = {
        id: str("id"),
        type: str("type") ?? str("type_label"),
        summary: str("summary"),
        content: str("content"),
        concept: str("concept"),
        score: typeof m.score === "number" ? m.score : undefined,
      };
      // Drop entries with no usable text.
      return mem.summary || mem.content ? [mem] : [];
    });
  } catch {
    return [];
  }
}
