"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { TaskDigest, TaskDigestItem } from "@/lib/task-digest";

function DigestList({ title, tone, items, formatted }: {
  title: string;
  tone: string;
  items: TaskDigestItem[];
  formatted: Record<string, string>;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mt-3">
      <p className={`text-xs font-semibold ${tone}`}>{title} ({items.length})</p>
      <ul className="mt-1.5 flex flex-col gap-1.5 text-sm">
        {items.map((item) => (
          <li key={item.taskId} className="flex flex-wrap items-baseline justify-between gap-2">
            <Link href={`/dashboard/leads/${item.leadId}`} className="font-medium text-primary-700 hover:text-primary-800">
              {item.taskTitle}
            </Link>
            <span className="text-xs text-slate-500">
              {item.leadLabel} · due {formatted[item.taskId]}
              {item.leadDoNotContact && <span className="ml-1 font-semibold text-red-700">Do Not Contact</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TaskDigestCard({
  enabled: savedEnabled,
  digest,
  formattedDue,
}: {
  enabled: boolean;
  digest?: TaskDigest;
  formattedDue: Record<string, string>;
}) {
  const router = useRouter();
  // Optimistic: the switch responds immediately and reverts if saving fails.
  const [enabled, setEnabled] = useState(savedEnabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const next = !enabled;
    setEnabled(next);
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/notifications/task-digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Your digest preference could not be saved");
      router.refresh();
    } catch (err) {
      setEnabled(!next);
      setError(err instanceof Error ? err.message : "Your digest preference could not be saved");
    } finally {
      setBusy(false);
    }
  }

  const total = (digest?.overdue.length ?? 0) + (digest?.dueToday.length ?? 0);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6" data-testid="task-digest-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-900">Daily task digest</h2>
          <p className="mt-1 text-sm text-slate-500">
            An email at about 06:00 listing your overdue follow-up tasks and those due today.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <input type="checkbox" checked={enabled} onChange={() => void toggle()} disabled={busy} className="h-4 w-4 rounded border-slate-300" />
          Email me the digest
        </label>
      </div>
      {error ? <p className="mt-2 text-xs text-red-600" role="alert">{error}</p> : null}

      <div className="mt-4 border-t border-slate-100 pt-3" data-testid="task-digest-preview">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Today&apos;s digest</p>
        {!enabled ? (
          <p className="mt-2 text-sm text-slate-500">The digest is switched off.</p>
        ) : total === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Nothing overdue or due today. No email will be sent.</p>
        ) : (
          <>
            <DigestList title="Overdue" tone="text-red-700" items={digest?.overdue ?? []} formatted={formattedDue} />
            <DigestList title="Due today" tone="text-blue-700" items={digest?.dueToday ?? []} formatted={formattedDue} />
          </>
        )}
      </div>
    </section>
  );
}
