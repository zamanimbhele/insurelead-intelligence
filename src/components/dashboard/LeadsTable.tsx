"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Lead } from "@/lib/types";
import { LEAD_STATUS_LABELS } from "@/lib/constants";
import { ScoreBadge, StatusBadge } from "./ScoreBadge";
import { Search } from "lucide-react";
import { format } from "date-fns";

export function LeadsTable({ leads }: { leads: Lead[] }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = useMemo(() => {
    return leads.filter((l) => {
      const matchesQuery =
        !query ||
        l.businessName.toLowerCase().includes(query.toLowerCase()) ||
        l.industry.toLowerCase().includes(query.toLowerCase()) ||
        l.province.toLowerCase().includes(query.toLowerCase());
      const matchesStatus = statusFilter === "all" || l.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [leads, query, statusFilter]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search business, industry, province..."
            className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        >
          <option value="all">All statuses</option>
          {Object.entries(LEAD_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[840px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Business</th>
              <th className="px-4 py-3">Industry</th>
              <th className="px-4 py-3">Province</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Score</th>
              <th className="px-4 py-3">Broker</th>
              <th className="px-4 py-3">Received</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.slice(0, 25).map((lead) => (
              <tr key={lead.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link href={`/dashboard/leads/${lead.id}`} className="font-medium text-primary-700 hover:underline">
                    {lead.businessName}
                  </Link>
                  {lead.doNotContact && (
                    <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">DNC</span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">{lead.industry}</td>
                <td className="px-4 py-3 text-slate-600">{lead.province}</td>
                <td className="px-4 py-3"><StatusBadge status={lead.status} label={LEAD_STATUS_LABELS[lead.status] ?? lead.status} /></td>
                <td className="px-4 py-3"><ScoreBadge band={lead.scoreBand} score={lead.score} /></td>
                <td className="px-4 py-3 text-slate-600">{lead.assignedBroker ?? "Unassigned"}</td>
                <td className="px-4 py-3 text-slate-500">{format(new Date(lead.createdAt), "d MMM yyyy")}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">No leads match your filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="border-t border-slate-200 px-4 py-3 text-xs text-slate-400">
        Showing {Math.min(filtered.length, 25)} of {filtered.length} matching leads ({leads.length} total demo leads).
      </div>
    </div>
  );
}
