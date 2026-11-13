"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FOLLOW_UP_BUCKETS, UNASSIGNED, type FollowUpItem } from "@/lib/follow-ups";
import { LEAD_STATUS_LABELS } from "@/lib/constants";

const EVERYONE = "__everyone__";

const bucketTone: Record<string, string> = {
  overdue: "text-red-700",
  today: "text-amber-700",
  next_7_days: "text-slate-900",
  later: "text-slate-900",
  undated: "text-slate-500",
};

export function FollowUpQueue({
  items,
  formattedDue,
  canEdit,
}: {
  items: FollowUpItem[];
  // Due dates are formatted on the server (South African time) so the
  // browser's own time zone never changes what "due" means.
  formattedDue: Record<string, string>;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [assignee, setAssignee] = useState(EVERYONE);
  const [busyTask, setBusyTask] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const assignees = useMemo(() => {
    const names = new Map<string, string>();
    for (const item of items) {
      const name = item.assigneeLabel ?? UNASSIGNED;
      if (!names.has(name.toLowerCase())) names.set(name.toLowerCase(), name);
    }
    return [...names.values()].sort((a, b) => a.localeCompare(b));
  }, [items]);

  const visible = items.filter(
    (item) => assignee === EVERYONE || (item.assigneeLabel ?? UNASSIGNED).toLowerCase() === assignee.toLowerCase(),
  );

  async function complete(item: FollowUpItem) {
    setBusyTask(item.taskId);
    setError(null);
    try {
      const response = await fetch(`/api/leads/${encodeURIComponent(item.leadId)}/tasks/${encodeURIComponent(item.taskId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "The follow-up could not be updated");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The follow-up could not be updated");
    } finally {
      setBusyTask(null);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5" data-testid="follow-up-queue">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-900">Follow-up queue</h2>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          Assigned to
          <select
            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900"
            value={assignee}
            onChange={(event) => setAssignee(event.target.value)}
          >
            <option value={EVERYONE}>Everyone</option>
            {assignees.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </label>
      </div>

      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}

      {visible.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">
          No open follow-ups. Add one from a lead&apos;s page with a due date, for example a callback in three months.
        </p>
      ) : (
        FOLLOW_UP_BUCKETS.map((bucket) => {
          const rows = visible.filter((item) => item.bucket === bucket.key);
          if (rows.length === 0) return null;
          return (
            <section key={bucket.key} className="mt-5" data-testid={`follow-ups-${bucket.key}`}>
              <h3 className={`text-xs font-semibold uppercase tracking-wide ${bucketTone[bucket.key]}`}>
                {bucket.label} ({rows.length})
              </h3>
              <ul className="mt-2 divide-y divide-slate-100">
                {rows.map((item) => (
                  <li key={item.taskId} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <Link
                        href={`/dashboard/leads/${item.leadId}`}
                        className="text-sm font-medium text-primary-700 hover:text-primary-800"
                      >
                        {item.title}
                      </Link>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {item.leadLabel} · {LEAD_STATUS_LABELS[item.leadStatus] ?? item.leadStatus}
                        {item.dueAt ? ` · due ${formattedDue[item.taskId]}` : ""}
                        {` · ${item.assigneeLabel ?? UNASSIGNED}`}
                        {item.leadDoNotContact && <span className="ml-1 font-semibold text-red-700">Do Not Contact</span>}
                      </p>
                    </div>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => complete(item)}
                        disabled={busyTask === item.taskId}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        {busyTask === item.taskId ? "Saving…" : "Mark done"}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
