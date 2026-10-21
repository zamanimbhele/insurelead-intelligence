// Daily task digest: grouping and email rendering (pure, unit-tested).
//
// "Today" is the South African calendar day. SAST is a fixed UTC+02:00
// with no daylight saving, so day boundaries are a plain offset.

const SAST_OFFSET_MS = 120 * 60_000;

export function sastDay(now: Date) {
  const local = new Date(now.getTime() + SAST_OFFSET_MS);
  const start = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - SAST_OFFSET_MS);
  return {
    // YYYY-MM-DD, used as the once-per-day delivery key.
    date: local.toISOString().slice(0, 10),
    start,
    end: new Date(start.getTime() + 86_400_000),
  };
}

export type TaskDigestRow = {
  profileId: string;
  email: string;
  displayName?: string;
  taskId: string;
  taskTitle: string;
  dueAt: string;
  assigneeLabel?: string;
  leadId: string;
  leadLabel: string;
  leadDoNotContact: boolean;
};

export type TaskDigestItem = Pick<TaskDigestRow, "taskId" | "taskTitle" | "dueAt" | "assigneeLabel" | "leadId" | "leadLabel" | "leadDoNotContact">;

export type TaskDigest = {
  profileId: string;
  email: string;
  displayName?: string;
  overdue: TaskDigestItem[];
  dueToday: TaskDigestItem[];
};

// Rows (one per recipient x task, as returned by task_digest_rows()) to
// one digest per recipient, split into overdue and due-today, oldest
// first. Rows due after today are ignored defensively.
export function groupTaskDigests(rows: TaskDigestRow[], now: Date): TaskDigest[] {
  const { start, end } = sastDay(now);
  const byProfile = new Map<string, TaskDigest>();
  for (const row of rows) {
    const due = new Date(row.dueAt);
    if (Number.isNaN(due.getTime()) || due >= end) continue;
    let digest = byProfile.get(row.profileId);
    if (!digest) {
      digest = { profileId: row.profileId, email: row.email, displayName: row.displayName, overdue: [], dueToday: [] };
      byProfile.set(row.profileId, digest);
    }
    const item: TaskDigestItem = {
      taskId: row.taskId,
      taskTitle: row.taskTitle,
      dueAt: row.dueAt,
      assigneeLabel: row.assigneeLabel,
      leadId: row.leadId,
      leadLabel: row.leadLabel,
      leadDoNotContact: row.leadDoNotContact,
    };
    if (due < start) digest.overdue.push(item);
    else digest.dueToday.push(item);
  }
  for (const digest of byProfile.values()) {
    digest.overdue.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
    digest.dueToday.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  }
  return [...byProfile.values()].filter((digest) => digest.overdue.length + digest.dueToday.length > 0);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function formatDueSast(dueAt: string) {
  const local = new Date(new Date(dueAt).getTime() + SAST_OFFSET_MS).toISOString();
  return `${local.slice(8, 10)}/${local.slice(5, 7)} ${local.slice(11, 16)}`;
}

function leadUrl(appUrl: string, leadId: string) {
  try {
    return new URL(`/dashboard/leads/${encodeURIComponent(leadId)}`, appUrl).toString();
  } catch {
    return undefined;
  }
}

export function renderTaskDigestEmail(digest: TaskDigest, input: { appUrl: string; date: string }) {
  const total = digest.overdue.length + digest.dueToday.length;
  const subject = digest.overdue.length
    ? `${digest.overdue.length} overdue, ${digest.dueToday.length} due today: your InsureLead follow-ups`
    : `${digest.dueToday.length} follow-up${digest.dueToday.length === 1 ? "" : "s"} due today on InsureLead`;
  const greeting = digest.displayName ? `Hi ${digest.displayName.split(/\s+/)[0]},` : "Hi,";

  const textSection = (title: string, items: TaskDigestItem[]) => items.length === 0 ? "" : [
    `${title} (${items.length})`,
    ...items.map((item) =>
      `- ${item.taskTitle} - ${item.leadLabel}, due ${formatDueSast(item.dueAt)}`
      + `${item.leadDoNotContact ? " [Do Not Contact - close or cancel]" : ""}`
      + `${leadUrl(input.appUrl, item.leadId) ? `\n  ${leadUrl(input.appUrl, item.leadId)}` : ""}`),
    "",
  ].join("\n");

  const htmlSection = (title: string, colour: string, items: TaskDigestItem[]) => items.length === 0 ? "" : `
    <h2 style="font-size:15px;color:${colour};margin:20px 0 8px">${escapeHtml(title)} (${items.length})</h2>
    <ul style="padding-left:18px;margin:0">${items.map((item) => {
      const url = leadUrl(input.appUrl, item.leadId);
      const title = escapeHtml(item.taskTitle);
      return `<li style="margin:0 0 8px">${url ? `<a href="${escapeHtml(url)}">${title}</a>` : title}`
        + ` &middot; ${escapeHtml(item.leadLabel)} &middot; due ${escapeHtml(formatDueSast(item.dueAt))}`
        + `${item.leadDoNotContact ? ' &middot; <strong>Do Not Contact: close or cancel this task</strong>' : ""}</li>`;
    }).join("")}</ul>`;

  const settingsUrl = (() => {
    try {
      return new URL("/dashboard/broker-profile", input.appUrl).toString();
    } catch {
      return undefined;
    }
  })();
  const footer = "You receive this because you are a broker user with follow-up tasks on InsureLead. "
    + "Switch the daily digest off on your Broker Profile page.";

  const text = [
    greeting,
    "",
    `You have ${total} follow-up task${total === 1 ? "" : "s"} needing attention (times in SAST).`,
    "",
    textSection("Overdue", digest.overdue),
    textSection("Due today", digest.dueToday),
    footer,
    settingsUrl ?? "",
  ].join("\n").replace(/\n{3,}/g, "\n\n").trim();

  const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;font-size:14px;line-height:1.5">
    <p>${escapeHtml(greeting)}</p>
    <p>You have <strong>${total}</strong> follow-up task${total === 1 ? "" : "s"} needing attention (times in SAST).</p>
    ${htmlSection("Overdue", "#b91c1c", digest.overdue)}
    ${htmlSection("Due today", "#1d4ed8", digest.dueToday)}
    <p style="margin-top:24px;font-size:12px;color:#64748b">${escapeHtml(footer)}${settingsUrl ? ` <a href="${escapeHtml(settingsUrl)}">Manage digest</a>` : ""}</p>
  </body></html>`;

  return { subject, text, html };
}
