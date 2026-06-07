// One-off test for reconcileStalledMeetings (no test runner in this project).
// Transpiles the REAL store.ts with the bundled TypeScript compiler and exercises
// the pure recovery helper. Run: node lib/store.recovery.test.cjs
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const src = fs.readFileSync(path.join(__dirname, "store.ts"), "utf8");
const js = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText;
const mod = { exports: {} };
new Function("module", "exports", "require", js)(mod, mod.exports, require);
const { reconcileStalledMeetings } = mod.exports;

let failures = 0;
const assert = (cond, msg) => {
  if (!cond) { failures++; console.error("FAIL:", msg); }
  else console.log("ok  -", msg);
};

const now = 1_000_000_000_000;
const iso = (ms) => new Date(ms).toISOString();
const TEN_MIN = 10 * 60 * 1000;

const meetings = [
  { id: "stale", status: "processing", createdAt: iso(now - 30 * 60 * 1000) },  // orphaned 30m ago
  { id: "fresh", status: "processing", createdAt: iso(now - 2 * 60 * 1000) },   // healthy, 2m ago
  { id: "ready", status: "ready",      createdAt: iso(now - 60 * 60 * 1000) },  // done
  { id: "errored", status: "error",    createdAt: iso(now - 60 * 60 * 1000) },  // already errored
];

const { meetings: out, recovered } = reconcileStalledMeetings(meetings, now, TEN_MIN);
const byId = Object.fromEntries(out.map((m) => [m.id, m]));

assert(recovered === 1, `exactly one stale meeting recovered (got ${recovered})`);
assert(byId.stale.status === "error", "stale processing -> error");
assert(typeof byId.stale.error === "string" && byId.stale.error.length > 0, "stale meeting gets an error message");
assert(byId.fresh.status === "processing", "fresh in-flight meeting left untouched (staleness guard)");
assert(byId.ready.status === "ready", "ready meeting untouched");
assert(byId.errored.status === "error" && byId.errored.error === undefined, "already-errored meeting not rewritten");
assert(meetings[0].status === "processing", "input array not mutated (pure)");

console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
