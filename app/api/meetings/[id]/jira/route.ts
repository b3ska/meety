import { NextResponse } from "next/server";
import { getMeeting, updateMeeting } from "@/lib/store";
import { buildSnapshots } from "@/lib/pipeline";
import { createJiraIssue, isJiraConfigured } from "@/lib/jira";
import type { Task } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await params; // id not needed for this endpoint
  return NextResponse.json({ configured: isJiraConfigured() });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!isJiraConfigured()) {
      return NextResponse.json(
        {
          error:
            "Jira is not configured. Set JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN, JIRA_PROJECT_KEY.",
        },
        { status: 400 },
      );
    }

    const { id } = await params;
    const meeting = await getMeeting(id);
    if (!meeting) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      taskIds?: string[];
    };

    const taskIdSet = body.taskIds ? new Set(body.taskIds) : null;

    const targets = meeting.tasks.filter(
      (t) =>
        (taskIdSet === null || taskIdSet.has(t.id)) && !t.jiraKey,
    );

    type PushResult =
      | { taskId: string; key: string; url: string }
      | { taskId: string; error: string };

    const results: PushResult[] = [];
    const updatedTaskMap = new Map<string, Task>(
      meeting.tasks.map((t) => [t.id, { ...t }]),
    );

    for (const task of targets) {
      const description =
        `From Meety meeting "${meeting.title}".\nAssignee: ${task.assignee}.` +
        (task.dueDate ? `\nDue: ${task.dueDate}.` : "") +
        (task.priority ? `\nPriority: ${task.priority}.` : "") +
        `\n\nCreated automatically by Meety Meeting Intelligence.`;

      try {
        const { key, url } = await createJiraIssue({
          summary: task.text,
          description,
        });
        results.push({ taskId: task.id, key, url });
        const t = updatedTaskMap.get(task.id)!;
        t.jiraKey = key;
        t.jiraUrl = url;
      } catch (e) {
        results.push({
          taskId: task.id,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    const newTasks = meeting.tasks.map((t) => updatedTaskMap.get(t.id) ?? t);

    const updated = await updateMeeting(id, {
      tasks: newTasks,
      snapshots: buildSnapshots(meeting.participation, newTasks),
    });

    const pushed = results.filter((r) => "key" in r).length;
    const failed = results.filter((r) => "error" in r).length;

    return NextResponse.json({ meeting: updated, results, pushed, failed });
  } catch (e) {
    console.error("[POST /api/meetings/[id]/jira]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 },
    );
  }
}
