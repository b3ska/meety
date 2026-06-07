import { NextResponse } from "next/server";
import { listMeetings } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const onlyArchived = new URL(req.url).searchParams.get("archived") === "1";
    const meetings = await listMeetings(onlyArchived ? { onlyArchived: true } : undefined);
    return NextResponse.json(meetings);
  } catch (e) {
    console.error("[GET /api/meetings]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 }
    );
  }
}
