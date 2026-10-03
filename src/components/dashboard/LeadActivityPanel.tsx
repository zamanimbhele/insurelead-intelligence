"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Loader2,
  MessageSquarePlus,
  PhoneCall,
  ShieldOff,
  XCircle,
} from "lucide-react";
import type { Lead, LeadActivity, LeadActivityKind, LeadNote, LeadStatus, LeadTask } from "@/lib/types";
import {
  LEAD_ACTIVITY_KIND_LABELS,
  LEAD_INTERACTION_CHANNELS,
  LEAD_INTERACTION_OUTCOMES,
  LEAD_STATUS_LABELS,
  LEAD_STATUS_ORDER,
} from "@/lib/constants";

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error ?? "The request could not be completed");
  return result as T;
}

// A single, visible, one-click way to move a lead to pipeline statuses
// that need a confirmation (loss reason) or are otherwise significant
// (Do Not Contact) - the Kanban board's per-card dropdown handles routine
// moves, but neither prompts for a loss reason, so "Lost" and "Do Not
// Contact" both get their own control here on the lead profile page.
export function LeadPipelineCard({ lead, canEdit }: { lead: Lead; canEdit: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState<LeadStatus>(lead.status);
  const [lossReason, setLossReason] = useState(lead.lossReason ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(nextStatus: LeadStatus, nextLossReason?: string) {
    setError(null);
    if (nextStatus === "lost" && !nextLossReason?.trim()) {
      setError("A loss reason is required when marking a lead as lost");
      return;
    }
    setSaving(true);
    try {
      await postJson(`/api/leads/${lead.id}/status`, { status: nextStatus, lossReason: nextLossReason });
      setStatus(nextStatus);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The lead status could not be updated");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="text-sm font-semibold text-slate-900">Pipeline &amp; Outcome</h2>
      {error && <p role="alert" className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      {canEdit ? (
        <div className="mt-3 flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
            Status
            <select
              value={status}
              disabled={saving}
              onChange={(event) => {
                const next = event.target.value as LeadStatus;
                setStatus(next);
                if (next !== "lost") void save(next);
              }}
              className="rounded-md border border-slate-200 px-2 py-1.5 text-sm text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:opacity-60"
            >
              {LEAD_STATUS_ORDER.map((option) => (
                <option key={option} value={option}>{LEAD_STATUS_LABELS[option] ?? option}</option>
              ))}
            </select>
          </label>
          {status === "lost" && (
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
              Loss reason
              <div className="flex gap-2">
                <input
                  value={lossReason}
                  onChange={(event) => setLossReason(event.target.value)}
                  placeholder="e.g. Went with an existing broker"
                  className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void save("lost", lossReason)}
                  className="flex-shrink-0 rounded-md bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
                </button>
              </div>
            </label>
          )}
          {lead.lossReason && status === "lost" && (
            <p className="text-xs text-slate-400">Recorded loss reason: {lead.lossReason}</p>
          )}
          {!lead.doNotContact && (
            <button
              type="button"
              disabled={saving}
              onClick={() => void save("do_not_contact")}
              className="flex items-center justify-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
            >
              <ShieldOff className="h-3.5 w-3.5" /> Mark Do Not Contact
            </button>
          )}
        </div>
      ) : (
        <p className="mt-2 text-sm text-slate-700">{LEAD_STATUS_LABELS[lead.status] ?? lead.status}</p>
      )}
    </section>
  );
}

const ACTIVITY_ICONS: Record<LeadActivityKind, typeof ClipboardList> = {
  lead_created: ClipboardList,
  status_change: ClipboardList,
  note_added: MessageSquarePlus,
  interaction_logged: PhoneCall,
  task_created: CalendarClock,
  task_completed: CheckCircle2,
  task_cancelled: XCircle,
  do_not_contact_set: ShieldOff,
};

function AddNoteForm({ leadId, canEdit, onAdded }: { leadId: string; canEdit: boolean; onAdded: () => void }) {
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!canEdit) return null;

  async function submit() {
    if (!body.trim()) {
      setError("Enter a note before saving");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await postJson(`/api/leads/${leadId}/notes`, { body });
      setBody("");
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The note could not be added");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder="Add a note for this lead..."
        rows={2}
        className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
      />
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      <button
        type="button"
        disabled={saving}
        onClick={() => void submit()}
        className="w-fit rounded-md bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
      >
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add note"}
      </button>
    </div>
  );
}

function LogInteractionForm({ leadId, canEdit, onAdded }: { leadId: string; canEdit: boolean; onAdded: () => void }) {
  const [channel, setChannel] = useState(LEAD_INTERACTION_CHANNELS[0].value);
  const [outcome, setOutcome] = useState(LEAD_INTERACTION_OUTCOMES[0].value);
  const [summary, setSummary] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!canEdit) return null;

  async function submit() {
    if (!summary.trim()) {
      setError("Describe what happened before saving");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await postJson(`/api/leads/${leadId}/interactions`, { channel, outcome, summary });
      setSummary("");
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The interaction could not be logged");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t border-slate-100 pt-4">
      <div className="flex gap-2">
        <select
          value={channel}
          onChange={(event) => setChannel(event.target.value as typeof channel)}
          className="rounded-md border border-slate-200 px-2 py-1.5 text-xs text-slate-700 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        >
          {LEAD_INTERACTION_CHANNELS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <select
          value={outcome}
          onChange={(event) => setOutcome(event.target.value as typeof outcome)}
          className="rounded-md border border-slate-200 px-2 py-1.5 text-xs text-slate-700 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        >
          {LEAD_INTERACTION_OUTCOMES.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>
      <textarea
        value={summary}
        onChange={(event) => setSummary(event.target.value)}
        placeholder="What was discussed?"
        rows={2}
        className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
      />
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      <button
        type="button"
        disabled={saving}
        onClick={() => void submit()}
        className="w-fit rounded-md bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
      >
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Log interaction"}
      </button>
    </div>
  );
}

function TasksSection({
  leadId,
  canEdit,
  tasks,
  onChanged,
}: {
  leadId: string;
  canEdit: boolean;
  tasks: LeadTask[];
  onChanged: () => void;
}) {
  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [assigneeLabel, setAssigneeLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!title.trim()) {
      setError("Enter a task title before saving");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await postJson(`/api/leads/${leadId}/tasks`, {
        title,
        dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
        assigneeLabel: assigneeLabel || undefined,
      });
      setTitle("");
      setDueAt("");
      setAssigneeLabel("");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The task could not be created");
    } finally {
      setSaving(false);
    }
  }

  async function resolveTask(taskId: string, status: "completed" | "cancelled") {
    setPendingTaskId(taskId);
    try {
      await postJson(`/api/leads/${leadId}/tasks/${taskId}`, { status });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The task could not be updated");
    } finally {
      setPendingTaskId(null);
    }
  }

  const openTasks = tasks.filter((task) => task.status === "open");
  const resolvedTasks = tasks.filter((task) => task.status !== "open");

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="text-sm font-semibold text-slate-900">Follow-up Tasks</h2>
      {canEdit && (
        <div className="mt-3 flex flex-col gap-2 border-b border-slate-100 pb-4 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-slate-500">
            Task
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Call to confirm renewal date"
              className="rounded-md border border-slate-200 px-2 py-1.5 text-sm text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
            Due
            <input
              type="date"
              value={dueAt}
              onChange={(event) => setDueAt(event.target.value)}
              className="rounded-md border border-slate-200 px-2 py-1.5 text-sm text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
            Assignee
            <input
              value={assigneeLabel}
              onChange={(event) => setAssigneeLabel(event.target.value)}
              placeholder="Optional"
              className="w-32 rounded-md border border-slate-200 px-2 py-1.5 text-sm text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </label>
          <button
            type="button"
            disabled={saving}
            onClick={() => void submit()}
            className="rounded-md bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add task"}
          </button>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}

      {openTasks.length === 0 ? (
        <p className="mt-4 text-sm text-slate-400">No open follow-up tasks.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {openTasks.map((task) => (
            <li key={task.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              <div>
                <p className="font-medium text-slate-700">{task.title}</p>
                <p className="text-xs text-slate-400">
                  {task.dueAt ? `Due ${format(new Date(task.dueAt), "d MMM yyyy")}` : "No due date"}
                  {task.assigneeLabel ? ` · ${task.assigneeLabel}` : ""}
                </p>
              </div>
              {canEdit && (
                <div className="flex flex-shrink-0 gap-1.5">
                  <button
                    type="button"
                    disabled={pendingTaskId === task.id}
                    onClick={() => void resolveTask(task.id, "completed")}
                    className="rounded-md border border-green-200 bg-green-50 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-100 disabled:opacity-60"
                  >
                    Complete
                  </button>
                  <button
                    type="button"
                    disabled={pendingTaskId === task.id}
                    onClick={() => void resolveTask(task.id, "cancelled")}
                    className="rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 disabled:opacity-60"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {resolvedTasks.length > 0 && (
        <p className="mt-3 text-xs text-slate-400">{resolvedTasks.length} resolved task(s) - see the activity timeline below.</p>
      )}
    </section>
  );
}

export function LeadActivityPanel({
  leadId,
  canEdit,
  notes,
  tasks,
  activities,
}: {
  leadId: string;
  canEdit: boolean;
  notes: LeadNote[];
  tasks: LeadTask[];
  activities: LeadActivity[];
}) {
  const router = useRouter();
  const refresh = () => router.refresh();

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-slate-900">Notes &amp; Interactions</h2>
        <div className="mt-3 flex flex-col gap-4">
          <AddNoteForm leadId={leadId} canEdit={canEdit} onAdded={refresh} />
          <LogInteractionForm leadId={leadId} canEdit={canEdit} onAdded={refresh} />
        </div>
        {notes.length > 0 && (
          <ul className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4">
            {notes.map((note) => (
              <li key={note.id} className="rounded-lg bg-slate-50 p-3 text-sm">
                <p className="text-slate-700">{note.body}</p>
                <p className="mt-1 text-xs text-slate-400">{note.authorLabel} · {format(new Date(note.createdAt), "d MMM yyyy, HH:mm")}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <TasksSection leadId={leadId} canEdit={canEdit} tasks={tasks} onChanged={refresh} />

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-slate-900">Activity Timeline</h2>
        <ul className="mt-3 space-y-3 text-sm">
          {activities.map((activity) => {
            const Icon = ACTIVITY_ICONS[activity.kind] ?? ClipboardList;
            return (
              <li key={activity.id} className="flex items-start gap-3">
                <Icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary-500" />
                <span>
                  <span className="font-medium text-slate-700">{LEAD_ACTIVITY_KIND_LABELS[activity.kind] ?? activity.kind}</span>
                  {activity.summary && activity.summary !== (LEAD_ACTIVITY_KIND_LABELS[activity.kind] ?? "") && (
                    <span className="text-slate-600"> - {activity.summary}</span>
                  )}
                  <div className="text-xs text-slate-400">
                    {activity.actorLabel} · {format(new Date(activity.occurredAt), "d MMM yyyy, HH:mm")}
                  </div>
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-4 text-xs text-slate-400">
          Notes, logged calls/emails/meetings, task changes, and status changes all land here automatically.
        </p>
      </section>
    </div>
  );
}
