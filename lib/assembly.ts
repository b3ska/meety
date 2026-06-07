import { AssemblyAI } from "assemblyai";
import type {
  SentimentAnalysisResult,
  TranscribeParams,
  TranscriptUtterance,
} from "assemblyai";
import type { SpeakerMap, Utterance, Sentiment } from "@/lib/types";

/** Construct an AssemblyAI client, throwing a clear error if the key is unset. */
function getClient(): AssemblyAI {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) {
    throw new Error("ASSEMBLYAI_API_KEY environment variable is not set.");
  }
  return new AssemblyAI({ apiKey });
}

/** Normalize generic diarization labels while preserving identified speaker names.
 *  AssemblyAI diarization uses "A","B",...; Speaker Identification can return
 *  names/roles such as "Alice Johnson", which must not be collapsed to "A".
 */
function normalizeLabel(raw: string): string {
  const trimmed = raw.trim();
  // If it's already a letter, return uppercase.
  if (/^[A-Za-z]$/.test(trimmed)) return trimmed.toUpperCase();
  // If it looks numeric (1-based), convert to corresponding letter.
  if (/^\d+$/.test(trimmed)) {
    const n = parseInt(trimmed, 10);
    if (n >= 1 && n <= 26) {
      return String.fromCharCode(64 + n); // 1→A, 2→B, ...
    }
  }
  // Speaker Identification returns meaningful names/roles; keep them intact.
  return trimmed;
}

/** Find the dominant sentiment from sentiment results that overlap an utterance's time range. */
function pickDominantSentiment(
  utteranceStart: number,
  utteranceEnd: number,
  utteranceSpeaker: string,
  sentimentResults: SentimentAnalysisResult[]
): Sentiment | undefined {
  const overlapping = sentimentResults.filter((s) => {
    const timeOverlaps = s.start < utteranceEnd && s.end > utteranceStart;
    const speakerMatches =
      s.speaker === null ||
      s.speaker === utteranceSpeaker ||
      normalizeLabel(s.speaker) === utteranceSpeaker;
    return timeOverlaps && speakerMatches;
  });

  if (overlapping.length === 0) return undefined;

  // Count occurrences of each sentiment value.
  const counts: Record<Sentiment, number> = {
    POSITIVE: 0,
    NEUTRAL: 0,
    NEGATIVE: 0,
  };
  for (const s of overlapping) {
    counts[s.sentiment as Sentiment] += 1;
  }

  // Return the sentiment with the highest count (tie-breaks: POSITIVE > NEUTRAL > NEGATIVE).
  if (counts.POSITIVE >= counts.NEUTRAL && counts.POSITIVE >= counts.NEGATIVE)
    return "POSITIVE";
  if (counts.NEUTRAL >= counts.NEGATIVE) return "NEUTRAL";
  return "NEGATIVE";
}

/**
 * Transcribe an audio file using AssemblyAI with speaker diarization and
 * sentiment analysis enabled.
 *
 * @param input - Provide either a Buffer (in-memory file) or a local file path.
 * @returns Transcript text, mapped utterances, and audio duration in seconds.
 */
export async function transcribeAudio(input: {
  buffer?: Buffer;
  filePath?: string;
  expectedParticipants?: string[];
}): Promise<{
  transcriptText: string;
  utterances: Utterance[];
  speakerMap: SpeakerMap;
  durationSec: number;
  transcriptId: string;
}> {
  const audio = input.buffer ?? input.filePath;
  if (!audio) {
    throw new Error("transcribeAudio requires either buffer or filePath.");
  }

  const client = getClient();
  const expectedParticipants = Array.from(
    new Set(
      (input.expectedParticipants ?? [])
        .map((name) => name.trim())
        .filter(Boolean)
    )
  );

  const transcriptParams: TranscribeParams = {
    audio,
    speech_models: ["universal-3-pro", "universal-2"],
    language_detection: true,
    speaker_labels: true,
    sentiment_analysis: true,
  };

  if (expectedParticipants.length > 0) {
    transcriptParams.speech_understanding = {
      request: {
        speaker_identification: {
          speaker_type: "name",
          known_values: expectedParticipants,
        },
      },
    };
  }

  // Bound the poll: the SDK otherwise waits forever (pollingTimeout defaults to
  // -1). universal-3-pro + speaker identification can run several minutes, but a
  // genuinely stalled job must surface as an error — never hang the pipeline,
  // leaving the meeting pinned to "processing" indefinitely.
  const transcript = await client.transcripts.transcribe(transcriptParams, {
    pollingTimeout: 7 * 60 * 1000,
  });

  if (transcript.status === "error") {
    throw new Error(
      `AssemblyAI transcription failed: ${transcript.error ?? "unknown error"}`
    );
  }

  const rawUtterances: TranscriptUtterance[] = transcript.utterances ?? [];
  const sentimentResults: SentimentAnalysisResult[] =
    transcript.sentiment_analysis_results ?? [];
  const speakerMap =
    (
      transcript as typeof transcript & {
        speech_understanding?: {
          response?: {
            speaker_identification?: {
              mapping?: SpeakerMap;
            };
          };
        };
      }
    ).speech_understanding?.response?.speaker_identification?.mapping ?? {};

  const utterances: Utterance[] = rawUtterances.map((u) => {
    const speaker = normalizeLabel(u.speaker);
    const sentiment = pickDominantSentiment(
      u.start,
      u.end,
      speaker,
      sentimentResults
    );
    const mapped: Utterance = {
      speaker,
      text: u.text,
      start: u.start,
      end: u.end,
      confidence: u.confidence,
    };
    if (sentiment !== undefined) mapped.sentiment = sentiment;
    return mapped;
  });

  const durationSec =
    typeof transcript.audio_duration === "number"
      ? transcript.audio_duration
      : utterances.length > 0
      ? Math.max(...utterances.map((u) => u.end)) / 1000
      : 0;

  return {
    transcriptText: transcript.text ?? "",
    utterances,
    speakerMap,
    durationSec,
    transcriptId: transcript.id,
  };
}

/**
 * Permanently delete a transcript (and its associated audio) from AssemblyAI.
 * Call after we've extracted everything we need, so no recording is retained
 * on the third party. Fail-soft: caller should not let this break the pipeline.
 */
export async function deleteTranscript(id: string): Promise<void> {
  await getClient().transcripts.delete(id);
}
