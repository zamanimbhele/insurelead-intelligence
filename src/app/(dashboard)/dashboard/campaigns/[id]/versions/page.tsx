import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { getDashboardCampaignVersions } from "@/lib/dashboard-data";
import { compareContentVersions, defaultComparison } from "@/lib/campaign-transparency";

export const dynamic = "force-dynamic";

// Content version comparison. Versions are immutable (database trigger),
// so this is an exact record of what changed between any two of them -
// in particular between what was approved and what is current.
export default async function CampaignVersionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const data = await getDashboardCampaignVersions(id);
  if (!data) return notFound();
  const { campaign, versions } = data;
  const numbers = versions.map((item) => item.version);

  const fallback = defaultComparison(numbers, campaign.approvedContentVersion, campaign.currentContentVersion);
  const fromNumber = Number(query.from) || fallback?.from;
  const toNumber = Number(query.to) || fallback?.to;
  const from = versions.find((item) => item.version === fromNumber);
  const to = versions.find((item) => item.version === toNumber);
  const comparison = from && to && from.version !== to.version ? compareContentVersions(from, to) : null;

  const badge = (version: number) => [
    version === campaign.approvedContentVersion ? "approved" : null,
    version === campaign.currentContentVersion ? "current" : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-col gap-6">
      <Link href={`/dashboard/campaigns/${campaign.id}`} className="flex w-fit items-center gap-2 text-sm text-slate-500 hover:text-primary-700">
        <ArrowLeft className="h-4 w-4" /> Back to {campaign.name}
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Content versions</h1>
        <p className="mt-1 text-sm text-slate-500">
          Every generated version is kept unchanged. Compare any two to see exactly what changed.
        </p>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-slate-900">Versions ({versions.length})</h2>
        {versions.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No content has been generated yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100 text-sm" data-testid="campaign-version-list">
            {[...versions].reverse().map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                <span>
                  <span className="font-semibold text-slate-900">Version {item.version}</span>
                  {badge(item.version) && (
                    <span className="ml-2 rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium capitalize text-primary-700">{badge(item.version)}</span>
                  )}
                  <span className="ml-2 text-slate-500">&ldquo;{item.subject}&rdquo;</span>
                </span>
                <span className="text-xs text-slate-400">{item.generatedBy} · {format(new Date(item.createdAt), "d MMM yyyy, HH:mm")}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {versions.length >= 2 && (
        <section className="rounded-xl border border-slate-200 bg-white p-6" data-testid="campaign-version-compare">
          <form className="flex flex-wrap items-end gap-3 text-sm" method="get">
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
              Compare
              <select name="from" defaultValue={from?.version} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900">
                {numbers.map((number) => <option key={number} value={number}>Version {number}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
              with
              <select name="to" defaultValue={to?.version} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900">
                {numbers.map((number) => <option key={number} value={number}>Version {number}</option>)}
              </select>
            </label>
            <button type="submit" className="rounded-md border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:border-primary-300">Compare</button>
          </form>

          {!comparison ? (
            <p className="mt-4 text-sm text-slate-500">Choose two different versions to compare.</p>
          ) : (
            <div className="mt-5 flex flex-col gap-4">
              <p className="text-sm text-slate-700" data-testid="campaign-version-summary">
                Version {comparison.from.version} → version {comparison.to.version}:{" "}
                {comparison.addedLines} line{comparison.addedLines === 1 ? "" : "s"} added, {comparison.removedLines} removed
                {comparison.subjectChanged ? ", subject changed" : ""}
                {comparison.preheaderChanged ? ", preheader changed" : ""}.
              </p>
              {comparison.subjectChanged && (
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  <div className="rounded-md bg-red-50 p-3"><dt className="text-xs text-red-700">Subject, version {comparison.from.version}</dt><dd className="mt-1 text-red-900">{comparison.from.subject}</dd></div>
                  <div className="rounded-md bg-emerald-50 p-3"><dt className="text-xs text-emerald-700">Subject, version {comparison.to.version}</dt><dd className="mt-1 text-emerald-900">{comparison.to.subject}</dd></div>
                </dl>
              )}
              {comparison.preheaderChanged && (
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  <div className="rounded-md bg-red-50 p-3"><dt className="text-xs text-red-700">Preheader, version {comparison.from.version}</dt><dd className="mt-1 text-red-900">{comparison.from.preheader || "(empty)"}</dd></div>
                  <div className="rounded-md bg-emerald-50 p-3"><dt className="text-xs text-emerald-700">Preheader, version {comparison.to.version}</dt><dd className="mt-1 text-emerald-900">{comparison.to.preheader || "(empty)"}</dd></div>
                </dl>
              )}
              <div>
                <p className="text-xs font-medium text-slate-500">Plain-text body</p>
                <pre className="mt-1.5 overflow-x-auto rounded-md border border-slate-200 text-xs leading-relaxed" data-testid="campaign-version-diff">
                  {comparison.body.map((line, index) => (
                    <div
                      key={index}
                      className={line.kind === "added" ? "bg-emerald-50 text-emerald-900" : line.kind === "removed" ? "bg-red-50 text-red-900" : "text-slate-600"}
                    >
                      <span className="select-none px-2 text-slate-400" aria-hidden="true">{line.kind === "added" ? "+" : line.kind === "removed" ? "−" : " "}</span>
                      <span className="sr-only">{line.kind === "added" ? "Added: " : line.kind === "removed" ? "Removed: " : ""}</span>
                      {line.text || " "}
                    </div>
                  ))}
                </pre>
              </div>
              {comparison.htmlChanged && (
                <p className="text-xs text-slate-500">The HTML version also changed; it is generated from the same message, so the plain-text diff above reflects the wording change.</p>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
