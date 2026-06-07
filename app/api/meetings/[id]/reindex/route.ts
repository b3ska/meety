import { NextResponse } from "next/server";
import { getMeeting } from "@/lib/store";
import { syncMemories } from "@/lib/pipeline";

export const runtime = "nodejs";

// Re-sync a meeting's memories to Muninn — evolves existing memories in place
// (no duplicates), creates any new ones. Returns a per-item report.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const meeting = await getMeeting(id);
  if (!meeting) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const report = await syncMemories(meeting);
  return NextResponse.json(report);
}
