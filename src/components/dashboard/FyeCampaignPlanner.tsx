"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, CheckCircle2, ClipboardList, Loader2 } from "lucide-react";
import type { FinancialYearCampaignPlan, FyeCampaignPlanStatus } from "@/lib/types";
import type { FyeMonthBreakdown, FyeMonthCalendarEntry } from "@/lib/fye-planner";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatPercent(value: number | null): string {
  if (value === null) return "-";
  return `${Math.round(value * 100)}%`;
}

const STATUS_LABELS: Record<FyeCampaignPlanStatus, string> = {
  planned: "Planned",
  active: "Active",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATUS_STYLES: Record<FyeCampaignPlanStatus, string> = {
  planned: "bg-slate-100 text-slate-600",
  active: "bg-primary-50 text-primary-700",
  completed: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-red-50 text-red-600",
};

function CalendarGrid({
  calendar,
  selectedMonth,
  onSelect,
}: {
  calendar: FyeMonthCalendarEntry[];
  selectedMonth: string;
  onSelect: (month: string) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5" data-testid="fye-calendar-grid">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <CalendarClock className="h-4 w-4 text-primary-600" /> Campaign calendar
      </h2>
      <p className="mt-1 text-xs text-slate-500">
        Lead volume by each business&apos;s own financial-year-end month. A highlighted month falls inside the
        planning window and is worth acting on now. Select a month to see its breakdown below.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {calendar.map((entry) => {
          const isSelected = entry.month === selectedMonth;
          return (
            <button
              key={entry.month}
              type="button"
              data-testid={`fye-month-${entry.month}`}
              onClick={() => onSelect(entry.month)}
              className={`flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition ${
                isSelected
                  ? "border-primary-600 bg-primary-50"
                  : entry.withinPlanningWindow
                    ? "border-amber-300 bg-amber-50 hover:border-primary-400"
                    : "border-slate-200 bg-white hover:border-primary-300"
              }`}
            >
              <span className="text-sm font-semibold text-slate-900">{entry.month}</span>
              <span className="text-xs text-slate-500">{entry.leadVolume} leads</span>
              {entry.withinPlanningWindow ? (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                  Plan now
                </span>
              ) : null}
              {entry.plans.length > 0 ? (
                <span className="text-[10px] font-medium text-primary-700">
                  {entry.plans.length} plan{entry.plans.length === 1 ? "" : "s"}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BreakdownTable({ breakdown }: { breakdown: FyeMonthBreakdown }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5" data-testid="fye-breakdown-panel">
      <h2 className="text-sm font-semibold text-slate-900">{breakdown.month}: results breakdown</h2>
      <p className="mt-1 text-xs text-slate-500">
        {breakdown.totalLeads} lead{breakdown.totalLeads === 1 ? "" : "s"} with this financial year-end month,
        conversion {breakdown.conversionRate === null ? "no closed leads yet" : formatPercent(breakdown.conversionRate)},
        top need {breakdown.topInsuranceNeed ?? "-"}.
      </p>

      {breakdown.totalLeads === 0 ? (
        <p className="mt-4 text-sm text-slate-400" data-testid="fye-breakdown-empty">
          No leads carry this financial year-end month yet.
        </p>
      ) : (
        <div className="mt-4 grid gap-6 sm:grid-cols-2">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">By sector</h3>
            <ul className="mt-2 space-y-1 text-sm text-slate-600">
              {breakdown.byIndustry.slice(0, 6).map((row) => (
                <li key={row.label} className="flex items-center justify-between gap-2">
                  <span>{row.label}</span>
                  <span className="font-medium text-slate-900">{row.leadVolume}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">By location</h3>
            <ul className="mt-2 space-y-1 text-sm text-slate-600">
              {breakdown.byProvince.slice(0, 6).map((row) => (
                <li key={row.label} className="flex items-center justify-between gap-2">
                  <span>{row.label}</span>
                  <span className="font-medium text-slate-900">{row.leadVolume}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function FollowUpTaskCard({ month, canCreateTasks }: { month: string; canCreateTasks: boolean }) {
  const [title, setTitle] = useState(`Financial year-end review follow-up (${month})`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: number; skipped: number; totalEligible: number } | null>(null);

  if (!canCreateTasks) return null;

  async function createTasks() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/market-intelligence/fye-follow-up-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, taskTitle: title }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "The follow-up tasks could not be created");
      setResult({ created: body.created, skipped: body.skipped, totalEligible: body.totalEligible });
    } catch (err) {
      setError(err instanceof Error ? err.message : "The follow-up tasks could not be created");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5" data-testid="fye-followup-card">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <ClipboardList className="h-4 w-4 text-primary-600" /> Broker follow-up task list
      </h2>
      <p className="mt-1 text-xs text-slate-500">
        Creates one ordinary follow-up task per eligible lead whose financial year-end is {month} - never a message
        sent automatically, just a task for a broker to act on, the same as adding one by hand.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-slate-500">
          Task title
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
          />
        </label>
        <button
          type="button"
          onClick={createTasks}
          disabled={busy}
          data-testid="fye-followup-button"
          className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Create follow-up tasks
        </button>
      </div>
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
      {result ? (
        <p className="mt-2 text-xs text-emerald-700" data-testid="fye-followup-result">
          Created {result.created} of {result.totalEligible} eligible lead{result.totalEligible === 1 ? "" : "s"}
          {result.skipped > 0 ? ` (${result.skipped} skipped)` : ""}.
        </p>
      ) : null}
    </div>
  );
}

function PlanForm({ defaultFyeMonth }: { defaultFyeMonth: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [fyeMonth, setFyeMonth] = useState(defaultFyeMonth);
  const [plannedContactMonth, setPlannedContactMonth] = useState(defaultFyeMonth);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!title.trim()) {
      setError("A title is required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/market-intelligence/fye-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, fyeMonth, plannedContactMonth, notes: notes || undefined }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "The campaign plan could not be created");
      setTitle("");
      setNotes("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The campaign plan could not be created");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5" data-testid="fye-plan-form">
      <h2 className="text-sm font-semibold text-slate-900">Create a campaign reminder</h2>
      <p className="mt-1 text-xs text-slate-500">
        A plan is a reminder and calendar entry only - it never sends anything on its own.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500 sm:col-span-2">
          Title
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. March FYE renewal review push"
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
          Targets businesses whose FYE is
          <select
            value={fyeMonth}
            onChange={(event) => setFyeMonth(event.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
          >
            {MONTH_NAMES.map((month) => (
              <option key={month} value={month}>
                {month}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
          Brokers should start acting in
          <select
            value={plannedContactMonth}
            onChange={(event) => setPlannedContactMonth(event.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
          >
            {MONTH_NAMES.map((month) => (
              <option key={month} value={month}>
                {month}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500 sm:col-span-2">
          Notes (optional)
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={2}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
          />
        </label>
      </div>
      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        Create plan
      </button>
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

function PlanList({ plans, canManagePlans }: { plans: FinancialYearCampaignPlan[]; canManagePlans: boolean }) {
  const router = useRouter();
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  async function setStatus(planId: string, status: FyeCampaignPlanStatus) {
    setUpdatingId(planId);
    try {
      const response = await fetch(`/api/market-intelligence/fye-plans/${planId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (response.ok) router.refresh();
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5" data-testid="fye-plan-list">
      <h2 className="text-sm font-semibold text-slate-900">Campaign plans</h2>
      {plans.length === 0 ? (
        <p className="mt-4 text-sm text-slate-400" data-testid="fye-plan-list-empty">
          No campaign plans created yet.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {plans.map((plan) => (
            <li key={plan.id} className="rounded-lg border border-slate-200 p-3" data-testid={`fye-plan-${plan.id}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{plan.title}</p>
                  <p className="text-xs text-slate-500">
                    Targets {plan.fyeMonth} FYE businesses - start acting in {plan.plannedContactMonth}
                  </p>
                </div>
                <span
                  data-testid={`fye-plan-status-${plan.id}`}
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[plan.status]}`}
                >
                  {STATUS_LABELS[plan.status]}
                </span>
              </div>
              {plan.notes ? <p className="mt-2 text-xs text-slate-500">{plan.notes}</p> : null}
              {canManagePlans && plan.status !== "cancelled" && plan.status !== "completed" ? (
                <div className="mt-3 flex gap-2">
                  {plan.status === "planned" ? (
                    <button
                      type="button"
                      disabled={updatingId === plan.id}
                      onClick={() => setStatus(plan.id, "active")}
                      className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                    >
                      Mark active
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={updatingId === plan.id}
                    onClick={() => setStatus(plan.id, "completed")}
                    className="inline-flex items-center gap-1 rounded-md border border-emerald-300 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
                  >
                    <CheckCircle2 className="h-3 w-3" /> Mark completed
                  </button>
                  <button
                    type="button"
                    disabled={updatingId === plan.id}
                    onClick={() => setStatus(plan.id, "cancelled")}
                    className="rounded-md border border-red-300 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
                  >
                    Cancel
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function FyeCampaignPlanner({
  calendar,
  plans,
  breakdowns,
  canManagePlans,
  canCreateTasks,
}: {
  calendar: FyeMonthCalendarEntry[];
  plans: FinancialYearCampaignPlan[];
  breakdowns: Record<string, FyeMonthBreakdown>;
  canManagePlans: boolean;
  canCreateTasks: boolean;
}) {
  const defaultMonth = useMemo(() => {
    return calendar.find((entry) => entry.withinPlanningWindow)?.month ?? calendar[0]?.month ?? "January";
  }, [calendar]);
  const [selectedMonth, setSelectedMonth] = useState(defaultMonth);
  const breakdown = breakdowns[selectedMonth];

  return (
    <div className="flex flex-col gap-6">
      <CalendarGrid calendar={calendar} selectedMonth={selectedMonth} onSelect={setSelectedMonth} />
      {breakdown ? <BreakdownTable breakdown={breakdown} /> : null}
      <FollowUpTaskCard month={selectedMonth} canCreateTasks={canCreateTasks} />
      {canManagePlans ? <PlanForm defaultFyeMonth={selectedMonth} /> : null}
      <PlanList plans={plans} canManagePlans={canManagePlans} />
    </div>
  );
}
