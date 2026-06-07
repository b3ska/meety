import { NextResponse } from "next/server";
import { listMeetings } from "@/lib/store";
import type { RecordingCard } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const q = (new URL(req.url).searchParams.get("q") ?? "").trim().toLowerCase();

    const meetings = await listMeetings();

    const filtered = q
      ? meetings.filter((m) => {
          const speakerNames = [
            ...m.participation.map((p) => p.employeeName),
            ...Object.values(m.speakerMap ?? {}),
          ];
          return (
            m.title.toLowerCase().includes(q) ||
            (m.transcriptText ?? "").toLowerCase().includes(q) ||
            speakerNames.some((name) => name.toLowerCase().includes(q))
          );
        })
      : meetings;

    const cards: RecordingCard[] = filtered
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((m) => {
        let summarySnippet = "";
        if (m.summary) {
          const cleaned = m.summary
            .replace(/[\n*#_`]/g, " ")
            .replace(/\s+/g, " ")
            .trim();
          summarySnippet =
            cleaned.length > 180 ? cleaned.slice(0, 180) + "…" : cleaned;
        }

        return {
          id: m.id,
          title: m.title,
          type: m.type,
          status: m.status,
          createdAt: m.createdAt,
          durationSec: m.durationSec,
          ...(m.project !== undefined ? { project: m.project } : {}),
          summarySnippet,
          taskCount: m.tasks.length,
          participantCount: m.participation.length,
        };
      });

    return NextResponse.json(cards);
  } catch (e) {
    console.error("[GET /api/recordings]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 }
    );
  }
}
