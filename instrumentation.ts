// Runs once per server instance on startup (Next.js instrumentation hook).
// Recovers meetings orphaned in "processing" by a previous process reload: a
// fire-and-forget transcription job dies with its worker, but the meeting's
// status is persisted as "processing" with no job left to advance it. Without
// this sweep, such meetings spin forever in the UI.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { recoverInterruptedMeetings } = await import("@/lib/store");
    const recovered = await recoverInterruptedMeetings();
    if (recovered > 0) {
      console.log(
        `[startup] recovered ${recovered} meeting(s) stuck in "processing" after restart`
      );
    }
  } catch (e) {
    // Never let recovery block server boot.
    console.error("[startup] meeting recovery sweep failed:", e);
  }
}
