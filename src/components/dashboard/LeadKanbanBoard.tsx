"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Building2, User } from "lucide-react";
import type { Lead, LeadStatus } from "@/lib/types";
import { LEAD_STATUS_LABELS, LEAD_STATUS_ORDER } from "@/lib/constants";
import { getLeadDisplayName } from "@/lib/lead-utils";
import { ScoreBadge } from "./ScoreBadge";

async function requestStatusChange(leadId: string, status: LeadStatus) {
  const response = await fetch(`/api/leads/${leadId}/status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? "The lead status could not be updated");
  return body as { status: LeadStatus; doNotContact: boolean };
}

export function LeadKanbanBoard({ leads, canEdit }: { leads: Lead[]; canEdit: boolean }) {
  const router = useRouter();
  const [board, setBoard] = useState(leads);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<LeadStatus | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const columns = useMemo(() => {
    const grouped = new Map<LeadStatus, Lead[]>(LEAD_STATUS_ORDER.map((status) => [status, []]));
    for (const lead of board) {
      (grouped.get(lead.status) ?? grouped.get("new")!).push(lead);
    }
    return grouped;
  }, [board]);

  async function moveLead(leadId: string, nextStatus: LeadStatus) {
    const current = board.find((lead) => lead.id === leadId);
    if (!current || current.status === nextStatus) return;

    setError(null);
    setPendingId(leadId);
    const previous = board;
    setBoard((rows) =>
      rows.map((lead) =>
        lead.id === leadId
          ? { ...lead, status: nextStatus, doNotContact: nextStatus === "do_not_contact" ? true : current.status === "do_not_contact" ? false : lead.doNotContact }
          : lead,
      ),
    );

    try {
      await requestStatusChange(leadId, nextStatus);
      router.refresh();
    } catch (err) {
      setBoard(previous);
      setError(err instanceof Error ? err.message : "The lead status could not be updated");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {!canEdit && (
        <p className="text-xs text-slate-400">
          View-only: your role cannot move leads between pipeline stages.
        </p>
      )}
      <div className="flex gap-4 overflow-x-auto pb-2">
        {LEAD_STATUS_ORDER.map((status) => {
          const leadsInColumn = columns.get(status) ?? [];
          return (
            <section
              key={status}
              onDragOver={(event) => {
                if (!canEdit || !draggingId) return;
                event.preventDefault();
                setDragOverColumn(status);
              }}
              onDragLeave={() => setDragOverColumn((current) => (current === status ? null : current))}
              onDrop={(event) => {
                event.preventDefault();
                setDragOverColumn(null);
                const leadId = event.dataTransfer.getData("text/plain");
                if (leadId) void moveLead(leadId, status);
              }}
              className={`flex w-64 flex-shrink-0 flex-col rounded-xl border bg-slate-50 ${
                dragOverColumn === status ? "border-primary-400 ring-1 ring-primary-300" : "border-slate-200"
              }`}
            >
              <header className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {LEAD_STATUS_LABELS[status] ?? status}
                </h3>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-500 shadow-sm">
                  {leadsInColumn.length}
                </span>
              </header>
              <div className="flex min-h-[4rem] flex-col gap-2 p-2">
                {leadsInColumn.map((lead) => {
                  const ApplicantIcon = lead.applicantType === "business" ? Building2 : User;
                  return (
                    <article
                      key={lead.id}
                      draggable={canEdit}
                      onDragStart={(event) => {
                        setDraggingId(lead.id);
                        event.dataTransfer.setData("text/plain", lead.id);
                        event.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setDragOverColumn(null);
                      }}
                      className={`rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition-opacity ${
                        canEdit ? "cursor-grab active:cursor-grabbing" : ""
                      } ${pendingId === lead.id ? "opacity-50" : ""}`}
                    >
                      <Link
                        href={`/dashboard/leads/${lead.id}`}
                        className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 hover:text-primary-700 hover:underline"
                      >
                        <ApplicantIcon className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
                        <span className="truncate">{getLeadDisplayName(lead)}</span>
                      </Link>
                      <p className="mt-1 truncate text-xs text-slate-500">{lead.city}, {lead.province}</p>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <ScoreBadge band={lead.scoreBand} score={lead.score} />
                        <span className="text-[10px] text-slate-400">{format(new Date(lead.createdAt), "d MMM")}</span>
                      </div>
                      {lead.doNotContact && (
                        <span className="mt-2 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                          Do Not Contact
                        </span>
                      )}
                      <label className="mt-2 block">
                        <span className="sr-only">Move {getLeadDisplayName(lead)} to a different pipeline stage</span>
                        <select
                          value={lead.status}
                          disabled={!canEdit || pendingId === lead.id}
                          onChange={(event) => void moveLead(lead.id, event.target.value as LeadStatus)}
                          className="w-full rounded-md border border-slate-200 bg-slate-50 px-1.5 py-1 text-[11px] text-slate-600 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:opacity-60"
                        >
                          {LEAD_STATUS_ORDER.map((option) => (
                            <option key={option} value={option}>{LEAD_STATUS_LABELS[option] ?? option}</option>
                          ))}
                        </select>
                      </label>
                    </article>
                  );
                })}
                {leadsInColumn.length === 0 && (
                  <p className="px-1 py-6 text-center text-[11px] text-slate-300">No leads</p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
