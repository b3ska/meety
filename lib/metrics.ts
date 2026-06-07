/**
 * Pure participation metrics — no external calls, no side effects.
 *
 * Worked example (2 speakers, A and B):
 *
 * utterances = [
 *   { speaker: "A", text: "Hello there",  start: 0,    end: 2000, sentiment: "POSITIVE" },
 *   { speaker: "B", text: "How are you",  start: 2500, end: 5500, sentiment: "NEUTRAL"  },
 *   { speaker: "A", text: "I am fine",    start: 6000, end: 7000, sentiment: "NEUTRAL"  },
 * ]
 * speakerMap = { A: "Alice" }
 *
 * Speaker A: talkTimeSec = (2000 + 1000) / 1000 = 3.0
 *            words       = 2 + 3 = 5
 *            turns       = 2
 *            avgSentiment= (1 + 0) / 2 = 0.5
 * Speaker B: talkTimeSec = 3000 / 1000 = 3.0
 *            words       = 3
 *            turns       = 1
 *            avgSentiment= 0 / 1 = 0.0
 * totalTalkTime = 6.0
 *
 * Expected output (sorted by talkTimeSec desc — tie: original insertion order):
 * [
 *   { speaker: "A", employeeName: "Alice",     talkTimeSec: 3.0, talkPct: 50, turns: 2, words: 5, avgSentimentScore: 0.50 },
 *   { speaker: "B", employeeName: "Speaker B", talkTimeSec: 3.0, talkPct: 50, turns: 1, words: 3, avgSentimentScore: 0.00 },
 * ]
 */

import type { Utterance, SpeakerMap, Participation } from "@/lib/types";

const SENTIMENT_SCORE = { POSITIVE: 1, NEUTRAL: 0, NEGATIVE: -1 } as const;

function isGenericSpeakerLabel(label: string): boolean {
  return /^[A-Z]$/.test(label) || /^\d+$/.test(label);
}

/**
 * Resolve a diarization label to a human-readable name.
 * Falls back to "Speaker <label>" for generic diarization labels. If AssemblyAI
 * Speaker Identification returned a name/role directly, keep it as the name.
 */
export function resolveName(label: string, speakerMap: SpeakerMap): string {
  return speakerMap[label] ?? (isGenericSpeakerLabel(label) ? `Speaker ${label}` : label);
}

/**
 * Compute per-speaker participation metrics from a list of utterances.
 * Returns results sorted by talkTimeSec descending.
 *
 * Speakers in `excludeLabels` (marked as bots / non-participants) are dropped
 * entirely, and any speaker with zero talk time is auto-dropped — both keep
 * silent bots and phantom diarization labels out of the metrics. talkPct is
 * renormalized over the remaining speakers.
 */
export function computeParticipation(
  utterances: Utterance[],
  speakerMap: SpeakerMap,
  excludeLabels?: Iterable<string>
): Participation[] {
  const excluded = new Set(excludeLabels ?? []);

  // Group utterances by speaker label, preserving first-seen order.
  const order: string[] = [];
  const groups = new Map<string, Utterance[]>();

  for (const u of utterances) {
    if (excluded.has(u.speaker)) continue;
    if (!groups.has(u.speaker)) {
      groups.set(u.speaker, []);
      order.push(u.speaker);
    }
    groups.get(u.speaker)!.push(u);
  }

  // Compute raw talk time per speaker.
  const talkTimes = new Map<string, number>();
  for (const [speaker, turns] of groups) {
    const ms = turns.reduce((sum, u) => sum + (u.end - u.start), 0);
    talkTimes.set(speaker, ms);
  }

  // Auto-drop speakers who produced no actual speech time (silent participants).
  const keptOrder = order.filter((speaker) => (talkTimes.get(speaker) ?? 0) > 0);

  const totalMs = keptOrder.reduce((a, s) => a + (talkTimes.get(s) ?? 0), 0);

  // Build raw (unrounded) results first so we can apply largest-remainder to talkPct.
  const rawResults = keptOrder.map((speaker) => {
    const turns = groups.get(speaker)!;
    const speakerMs = talkTimes.get(speaker)!;

    const talkTimeSec = Math.round((speakerMs / 1000) * 10) / 10;
    const rawPct = totalMs === 0 ? 0 : (speakerMs / totalMs) * 100;

    const words = turns.reduce(
      (sum, u) => sum + u.text.trim().split(/\s+/).filter(Boolean).length,
      0
    );

    const sentimentedTurns = turns.filter((u) => u.sentiment !== undefined);
    const avgSentimentScore =
      sentimentedTurns.length === 0
        ? 0
        : Math.round(
            (sentimentedTurns.reduce(
              (sum, u) => sum + SENTIMENT_SCORE[u.sentiment!],
              0
            ) /
              sentimentedTurns.length) *
              100
          ) / 100;

    return {
      speaker,
      employeeName: resolveName(speaker, speakerMap),
      talkTimeSec,
      rawPct,
      turns: turns.length,
      words,
      avgSentimentScore,
    };
  });

  // Largest-remainder method: ensure rounded talkPct values sum to exactly 100.
  const hasTalkTime = totalMs > 0;
  let remainingPct = hasTalkTime ? 100 : 0;
  const floored = rawResults.map((r) => Math.floor(r.rawPct));
  const remainders = rawResults.map((r, i) => ({
    index: i,
    remainder: r.rawPct - floored[i],
  }));
  remainders.sort((a, b) => b.remainder - a.remainder);
  const toDistribute = remainingPct - floored.reduce((a, b) => a + b, 0);
  for (let i = 0; i < toDistribute; i++) {
    floored[remainders[i].index]++;
  }

  const results: Participation[] = rawResults.map((r, i) => ({
    speaker: r.speaker,
    employeeName: r.employeeName,
    talkTimeSec: r.talkTimeSec,
    talkPct: floored[i],
    turns: r.turns,
    words: r.words,
    avgSentimentScore: r.avgSentimentScore,
  }));

  // Sort by talkTimeSec descending; stable sort preserves insertion order on ties.
  results.sort((a, b) => b.talkTimeSec - a.talkTimeSec);

  return results;
}
