import { getDashboardLead } from "@/lib/dashboard-data";
import { LEAD_STATUS_LABELS, INSURANCE_PRODUCTS } from "@/lib/constants";
import { ScoreBadge, StatusBadge } from "@/components/dashboard/ScoreBadge";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Mail, Phone, MapPin, Building2, ShieldOff } from "lucide-react";
import { format } from "date-fns";

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lead = await getDashboardLead(id);
  if (!lead) return notFound();

  const productLabels = lead.insuranceProducts.map(
    (p) => INSURANCE_PRODUCTS.find((ip) => ip.value === p)?.label ?? p
  );

  return (
    <div className="flex flex-col gap-6">
      <Link href="/dashboard/leads" className="flex w-fit items-center gap-2 text-sm text-slate-500 hover:text-primary-700">
        <ArrowLeft className="h-4 w-4" /> Back to leads
      </Link>

      <div className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-6 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{lead.businessName}</h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-slate-500">
            <Building2 className="h-4 w-4" /> {lead.industry} · {lead.businessType}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={lead.status} label={LEAD_STATUS_LABELS[lead.status] ?? lead.status} />
          <ScoreBadge band={lead.scoreBand} score={lead.score} />
        </div>
      </div>

      {lead.doNotContact && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <ShieldOff className="h-4 w-4" /> This lead is marked Do Not Contact. Future marketing and broker outreach
          actions are blocked, except where required for lawful operational communication.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-sm font-semibold text-slate-900">Lead Score Explanation</h2>
            <p className="mt-2 text-sm text-slate-600">{lead.scoreExplanation}</p>
            <p className="mt-2 text-xs text-slate-400">
              This score is for internal prioritisation only. It does not represent an underwriting or pricing
              decision and must always be reviewed by a human broker.
            </p>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-sm font-semibold text-slate-900">Insurance Needs</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {productLabels.map((p) => (
                <span key={p} className="rounded-full bg-primary-50 px-3 py-1 text-xs font-medium text-primary-700">{p}</span>
              ))}
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div><dt className="text-slate-400">Current status</dt><dd className="text-slate-700">{lead.currentInsuranceStatus.replace(/_/g, " ")}</dd></div>
              <div><dt className="text-slate-400">Financial year-end</dt><dd className="text-slate-700">{lead.financialYearEndMonth ?? "Not provided"}</dd></div>
            </dl>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-sm font-semibold text-slate-900">Business Details</h2>
            <dl className="mt-3 grid grid-cols-2 gap-4 text-sm">
              <div><dt className="text-slate-400">Employees</dt><dd className="text-slate-700">{lead.employeeBand}</dd></div>
              <div><dt className="text-slate-400">Annual turnover</dt><dd className="text-slate-700">{lead.turnoverBand}</dd></div>
              <div><dt className="text-slate-400">Years in operation</dt><dd className="text-slate-700">{lead.yearsInOperation}</dd></div>
              <div><dt className="text-slate-400">Location</dt><dd className="flex items-center gap-1 text-slate-700"><MapPin className="h-3.5 w-3.5" />{lead.city}, {lead.province}</dd></div>
            </dl>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-sm font-semibold text-slate-900">Activity Timeline</h2>
            <ul className="mt-3 space-y-3 text-sm">
              <li className="flex items-start gap-3">
                <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-primary-500" />
                <span>
                  <span className="font-medium text-slate-700">Lead created</span> via public consultation form
                  <div className="text-xs text-slate-400">{format(new Date(lead.createdAt), "d MMM yyyy, HH:mm")}</div>
                </span>
              </li>
            </ul>
            <p className="mt-4 text-xs text-slate-400">
              Notes, tasks, call logs, and status-change history are part of the full Broker Workflow build - see the
              Phase 2 backlog document.
            </p>
          </section>
        </div>

        <div className="flex flex-col gap-6">
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-sm font-semibold text-slate-900">Contact Person</h2>
            <p className="mt-2 text-sm font-medium text-slate-800">{lead.contactFullName}</p>
            <p className="text-xs text-slate-500">{lead.contactRole}</p>
            <div className="mt-4 flex flex-col gap-2 text-sm">
              <span className="flex items-center gap-2 text-slate-600"><Mail className="h-4 w-4" /> {lead.contactEmail}</span>
              <span className="flex items-center gap-2 text-slate-600"><Phone className="h-4 w-4" /> {lead.contactMobile}</span>
            </div>
            <p className="mt-3 text-xs text-slate-400">Preferred channel: {lead.preferredContactChannel}</p>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-sm font-semibold text-slate-900">Source &amp; Attribution</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div><dt className="text-slate-400">Campaign</dt><dd className="text-slate-700">{lead.campaignSource ?? "Direct / Organic"}</dd></div>
              <div><dt className="text-slate-400">UTM Source</dt><dd className="text-slate-700">{lead.utm.source ?? "-"}</dd></div>
              <div><dt className="text-slate-400">UTM Medium</dt><dd className="text-slate-700">{lead.utm.medium ?? "-"}</dd></div>
            </dl>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-sm font-semibold text-slate-900">Assignment</h2>
            <p className="mt-2 text-sm text-slate-700">{lead.assignedBroker ?? "Unassigned"}</p>
          </section>
        </div>
      </div>
    </div>
  );
}
