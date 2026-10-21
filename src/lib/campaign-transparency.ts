// Campaign transparency: content version comparison and the "who is
// excluded, and why" audience breakdown. Pure functions, unit-tested.
import type { CampaignAudienceDecision } from "./campaign-policy.ts";
import type { CampaignContentVersion, CampaignRecipient, Lead } from "./types.ts";

// --- Version comparison -------------------------------------------------

export type DiffLine = { kind: "same" | "added" | "removed"; text: string };

// Line diff via longest common subsequence. Campaign bodies are a few
// dozen lines, so the O(n*m) table is trivially small; inputs are capped
// defensively anyway.
export function diffLines(before: string, after: string, maxLines = 2000): DiffLine[] {
  const a = before.split(/\r?\n/).slice(0, maxLines);
  const b = after.split(/\r?\n/).slice(0, maxLines);
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ kind: "same", text: a[i] });
      i += 1;
      j += 1;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ kind: "removed", text: a[i] });
      i += 1;
    } else {
      out.push({ kind: "added", text: b[j] });
      j += 1;
    }
  }
  while (i < a.length) out.push({ kind: "removed", text: a[i++] });
  while (j < b.length) out.push({ kind: "added", text: b[j++] });
  return out;
}

export type VersionComparison = {
  from: CampaignContentVersion;
  to: CampaignContentVersion;
  subjectChanged: boolean;
  preheaderChanged: boolean;
  htmlChanged: boolean;
  body: DiffLine[];
  addedLines: number;
  removedLines: number;
};

export function compareContentVersions(from: CampaignContentVersion, to: CampaignContentVersion): VersionComparison {
  const body = diffLines(from.textBody, to.textBody);
  return {
    from,
    to,
    subjectChanged: from.subject !== to.subject,
    preheaderChanged: from.preheader !== to.preheader,
    htmlChanged: from.htmlBody !== to.htmlBody,
    body,
    addedLines: body.filter((line) => line.kind === "added").length,
    removedLines: body.filter((line) => line.kind === "removed").length,
  };
}

// Which two versions to compare when none are chosen: what was approved
// against what is current if they differ (the question a reviewer has
// after an edit reset approval), otherwise the previous version against
// the latest.
export function defaultComparison(
  versions: number[],
  approvedVersion?: number,
  currentVersion?: number,
): { from: number; to: number } | null {
  const sorted = [...new Set(versions)].sort((x, y) => x - y);
  if (sorted.length < 2) return null;
  const latest = currentVersion && sorted.includes(currentVersion) ? currentVersion : sorted[sorted.length - 1];
  if (approvedVersion && approvedVersion !== latest && sorted.includes(approvedVersion)) {
    return { from: approvedVersion, to: latest };
  }
  const previous = sorted.filter((version) => version < latest).pop();
  return previous === undefined ? null : { from: previous, to: latest };
}

// --- Audience breakdown --------------------------------------------------

export const NOT_ALLOCATED_REASON = "Lead is not accepted by this broker tenant";

export type AudienceRow = {
  leadId: string;
  label: string;
  linkable: boolean;
  eligible: boolean;
  reasons: string[];
  recipientStatus?: CampaignRecipient["status"];
  sendTimeReason?: string;
};

export type AudienceBreakdown = {
  eligibleCount: number;
  excludedCount: number;
  // Leads outside this broker's book: counted, never listed - they are
  // not the broker's leads and would drown out the useful rows.
  notAllocatedCount: number;
  reasons: { reason: string; count: number }[];
  rows: AudienceRow[];
  removedAtSend: AudienceRow[];
};

// Short, non-identifying reference used when the viewer may not see who a
// lead is (marketing analysts, compliance auditors).
export function anonymousLeadReference(leadId: string) {
  const tail = leadId.replace(/[^a-zA-Z0-9]/g, "").slice(-6).toUpperCase();
  return `Lead …${tail}`;
}

export function buildAudienceBreakdown(input: {
  decisions: CampaignAudienceDecision[];
  leads: Lead[];
  recipients: CampaignRecipient[];
  showIdentity: boolean;
  reasonFilter?: string;
}): AudienceBreakdown {
  const leadsById = new Map(input.leads.map((lead) => [lead.id, lead]));
  const recipientsByLead = new Map(input.recipients.map((recipient) => [recipient.leadId, recipient]));
  const label = (leadId: string) => {
    if (!input.showIdentity) return anonymousLeadReference(leadId);
    const lead = leadsById.get(leadId);
    return lead?.businessName?.trim() || lead?.contactFullName.trim() || anonymousLeadReference(leadId);
  };

  const inBook = input.decisions.filter((decision) => !decision.reasons.includes(NOT_ALLOCATED_REASON));
  const notAllocatedCount = input.decisions.length - inBook.length;

  const reasonCounts = new Map<string, number>();
  for (const decision of inBook) {
    for (const reason of decision.reasons) reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
  }

  const toRow = (decision: CampaignAudienceDecision): AudienceRow => {
    const recipient = recipientsByLead.get(decision.leadId);
    return {
      leadId: decision.leadId,
      label: label(decision.leadId),
      linkable: input.showIdentity,
      eligible: decision.eligible,
      reasons: decision.reasons,
      recipientStatus: recipient?.status,
      sendTimeReason: recipient && ["suppressed", "failed"].includes(recipient.status) ? recipient.exclusionReason : undefined,
    };
  };

  const filtered = input.reasonFilter === "eligible"
    ? inBook.filter((decision) => decision.eligible)
    : input.reasonFilter
      ? inBook.filter((decision) => decision.reasons.includes(input.reasonFilter as string))
      : inBook;

  return {
    eligibleCount: inBook.filter((decision) => decision.eligible).length,
    excludedCount: inBook.filter((decision) => !decision.eligible).length,
    notAllocatedCount,
    reasons: [...reasonCounts.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((x, y) => y.count - x.count || x.reason.localeCompare(y.reason)),
    rows: filtered
      .map(toRow)
      .sort((x, y) => Number(x.eligible) - Number(y.eligible) || x.label.localeCompare(y.label)),
    removedAtSend: input.recipients
      .filter((recipient) => ["suppressed", "failed"].includes(recipient.status))
      .map((recipient) => ({
        leadId: recipient.leadId,
        label: label(recipient.leadId),
        linkable: input.showIdentity,
        eligible: false,
        reasons: [],
        recipientStatus: recipient.status,
        sendTimeReason: recipient.exclusionReason,
      })),
  };
}
