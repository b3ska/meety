/**
 * Jira Cloud REST API client — one-way push of action items as issues.
 * Auth: API-token Basic auth (no OAuth).
 * Uses REST API v2 so descriptions are plain text (avoids ADF).
 */

export function isJiraConfigured(): boolean {
  return !!(
    process.env.JIRA_BASE_URL &&
    process.env.JIRA_EMAIL &&
    process.env.JIRA_API_TOKEN &&
    process.env.JIRA_PROJECT_KEY
  );
}

export async function createJiraIssue(input: {
  summary: string;
  description?: string;
}): Promise<{ key: string; url: string }> {
  if (!isJiraConfigured()) {
    throw new Error("Jira is not configured");
  }

  const baseUrl = process.env.JIRA_BASE_URL!.replace(/\/$/, "");
  const email = process.env.JIRA_EMAIL!;
  const token = process.env.JIRA_API_TOKEN!;
  const projectKey = process.env.JIRA_PROJECT_KEY!;
  const issueType = process.env.JIRA_ISSUE_TYPE || "Task";

  const auth =
    "Basic " + Buffer.from(`${email}:${token}`).toString("base64");

  const fields: Record<string, unknown> = {
    project: { key: projectKey },
    summary: input.summary.slice(0, 250),
    issuetype: { name: issueType },
    ...(input.description ? { description: input.description } : {}),
  };

  const res = await fetch(`${baseUrl}/rest/api/2/issue`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: auth,
    },
    body: JSON.stringify({ fields }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Jira ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as { key: string };
  return { key: data.key, url: `${baseUrl}/browse/${data.key}` };
}
