/**
 * Shared formatters — imported by multiple agents/modules.
 * Signatures are contractual; do not change.
 */

/**
 * Format a duration in seconds into a human-readable string.
 * Omits leading zero units (no "0h 1m").
 *
 * Examples:
 *   3661 -> "1h 1m 1s"
 *   2999 -> "49m 59s"
 *      16 -> "16s"
 *       0 -> "0s"
 */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0 || h > 0) {
    // Show minutes whenever there are hours (even if m === 0), but omit leading "0m".
    if (m > 0) parts.push(`${m}m`);
  }
  parts.push(`${s}s`);

  return parts.join(" ");
}

/**
 * Format an ISO date string to a short locale date.
 * Uses "en-US" locale with month:"short", day:"numeric", year:"numeric".
 *
 * Example: "2026-06-07T..." -> "Jun 7, 2026"
 */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
