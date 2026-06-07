// Upload limits + supported formats. Shared by client (validation/UI) and server (ingest guard).

export const SUPPORTED_AUDIO_EXT = [
  "mp3",
  "m4a",
  "wav",
  "mp4",
  "webm",
  "flac",
  "ogg",
] as const;

export const MAX_FILE_MB = 1024;
export const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;

/** Human-readable size cap (e.g. "1GB", "100MB"). */
export const MAX_FILE_LABEL =
  MAX_FILE_MB >= 1024 ? `${MAX_FILE_MB / 1024}GB` : `${MAX_FILE_MB}MB`;

/** Human-readable accept hint shown in the UI. */
export const ACCEPT_HINT = `${SUPPORTED_AUDIO_EXT.join(" · ")} — max ${MAX_FILE_LABEL}`;

/** <input accept="..."> value. */
export const ACCEPT_ATTR =
  SUPPORTED_AUDIO_EXT.map((e) => `.${e}`).join(",") + ",audio/*,video/*";

/** Validate a file by name + size. Returns an error string, or null if OK. */
export function validateUploadFile(
  name: string,
  sizeBytes: number,
): string | null {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (!SUPPORTED_AUDIO_EXT.includes(ext as (typeof SUPPORTED_AUDIO_EXT)[number])) {
    return `Unsupported file type ".${ext}". Supported: ${SUPPORTED_AUDIO_EXT.join(", ")}.`;
  }
  if (sizeBytes > MAX_FILE_BYTES) {
    return `File too large (${(sizeBytes / 1024 / 1024).toFixed(1)}MB). Max ${MAX_FILE_LABEL}.`;
  }
  if (sizeBytes === 0) {
    return "File is empty.";
  }
  return null;
}
