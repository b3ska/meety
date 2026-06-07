import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { saveMeeting } from "@/lib/store";
import { processMeeting } from "@/lib/pipeline";
import { validateUploadFile } from "@/lib/constants";
import type { Meeting, MeetingType } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const TYPES: MeetingType[] = [
  "standup",
  "one_on_one",
  "planning",
  "retro",
  "review",
  "other",
];

function parseParticipants(raw: FormDataEntryValue | null): string[] {
  if (typeof raw !== "string") return [];
  return Array.from(
    new Set(
      raw
        .split(/[\n,;]+/)
        .map((name) => name.trim())
        .filter(Boolean)
    )
  );
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const title = (form.get("title") as string)?.trim() || "Untitled meeting";
    const rawType = form.get("type") as string;
    const type: MeetingType = TYPES.includes(rawType as MeetingType)
      ? (rawType as MeetingType)
      : "other";
    const project = (form.get("project") as string)?.trim() || undefined;
    const department =
      (form.get("department") as string)?.trim() || undefined;
    const expectedParticipants = parseParticipants(form.get("participants"));

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
    }

    const validationError = validateUploadFile(file.name, file.size);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const id = randomUUID();

    const meeting: Meeting = {
      id,
      title,
      type,
      createdAt: new Date().toISOString(),
      durationSec: 0,
      project,
      department,
      expectedParticipants,
      transcriptText: "",
      utterances: [],
      speakerMap: {},
      summary: "",
      tasks: [],
      participation: [],
      snapshots: [],
      status: "processing",
    };
    await saveMeeting(meeting);

    // Fire-and-forget: process in the background; UI polls for status.
    void processMeeting(id, buffer);

    return NextResponse.json({ id });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ingest failed" },
      { status: 500 },
    );
  }
}
