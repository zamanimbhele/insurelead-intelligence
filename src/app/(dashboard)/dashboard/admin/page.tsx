import Link from "next/link";
import { ArrowRight, Building2, Inbox, MailCheck, ShieldCheck, Store, UserPlus } from "lucide-react";
import { getDashboardIdentity } from "@/lib/auth";
import { buildAdminOverview } from "@/lib/admin-overview";
import { getCampaignDeliveryStatus } from "@/lib/campaign-delivery";
import { getResendWebhookStatus } from "@/lib/campaign-webhooks";
import { getActiveAllocationLeadIds, getDashboardBrokerDirectory, getDashboardMarketplaceData, isLeadUnassigned } from "@/lib/dashboard-data";
import { isPlatformStaffRole, portalBadge } from "@/lib/portal";
import { getTransactionalEmailStatus } from "@/lib/transactional-email";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin home | InsureLead Intelligence" };

type Tone = "good" | "warn" | "off";

const TONE_CLASSES: Record<Tone, string> = {
  good: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warn: "border-amber-200 bg-amber-50 text-amber-900",
  off: "border-slate-200 bg-slate-50 text-slate-600",
};

function integrationRows() {
  const email = getTransactionalEmailStatus();
  const delivery = getCampaignDeliveryStatus();
  const webhooks = getResendWebhookStatus();
  return [
    {
      name: "Staff notification email",
      detail: "Daily task digest and other staff emails.",
      status: email === "configured" ? "Configured" : email === "missing-api-key" ? "Resend API key missing" : "Sender address missing",
      tone: (email === "configured" ? "good" : "warn") as Tone,
    },
    {
      name: "Campaign delivery",
      detail: "Whether approved campaigns are actually sent.",
      status: delivery === "live" ? "Live" : delivery === "test" ? "Test mode" : delivery === "disabled" ? "Disabled" : delivery === "missing-api-key" ? "Resend API key missing" : "Invalid setting",
      tone: (delivery === "live" ? "good" : delivery === "disabled" || delivery === "test" ? "off" : "warn") as Tone,
    },
    {
      name: "Delivery feedback webhooks",
      detail: "Delivered, bounced and complaint events from Resend.",
      status: webhooks === "configured" ? "Configured" : "Signing secret missing",
      tone: (webhooks === "configured" ? "good" : "warn") as Tone,
    },
  ];
}

export default async function AdminHomePage() {
  const identity = await getDashboardIdentity();
  if (!isPlatformStaffRole(identity.role)) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6" data-testid="admin-home-denied">
        <h1 className="text-xl font-bold text-slate-900">Admin home</h1>
        <p className="mt-2 text-sm text-amber-900">The admin portal is restricted to InsureLead platform staff.</p>
      </div>
    );
  }

  const badge = portalBadge(identity.role);
  // Each source is read with the viewer's own permissions; if one is not
  // readable for this role, its counts show as zero rather than failing
  // the whole page.
  const [directory, marketplace, assignedLeadIds] = await Promise.all([
    getDashboardBrokerDirectory().catch(() => ({ buyers: [], sendingIdentities: [], members: [] })),
    getDashboardMarketplaceData().catch(() => ({ leads: [] })),
    getActiveAllocationLeadIds().catch(() => new Set<string>()),
  ]);
  const overview = buildAdminOverview({
    ...directory,
    leads: marketplace.leads,
    isUnassigned: (lead) => isLeadUnassigned(lead, assignedLeadIds),
  });

  const cards = [
    { label: "Brokers awaiting review", value: overview.brokersAwaitingReview, href: "/dashboard/brokers", icon: Building2, attention: overview.brokersAwaitingReview > 0 },
    { label: "Sending identities to verify", value: overview.identitiesAwaitingVerification, href: "/dashboard/brokers", icon: MailCheck, attention: overview.identitiesAwaitingVerification > 0 },
    { label: "Invited members not yet active", value: overview.invitedMembers, href: "/dashboard/brokers", icon: UserPlus, attention: false },
    { label: "Active brokers", value: overview.activeBrokers, href: "/dashboard/brokers", icon: ShieldCheck, attention: false },
    { label: "Leads on the platform", value: overview.liveLeads, href: "/dashboard/marketplace", icon: Inbox, attention: false },
    { label: "Unassigned leads", value: overview.unassignedLeads, href: "/dashboard/marketplace", icon: Store, attention: overview.unassignedLeads > 0 },
  ];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Admin home</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          What needs attention across every broker on the platform.
          {identity.role === "compliance_auditor" && " You have read-only access."}
        </p>
        {badge && <p className="sr-only">{badge.label}: {badge.note}</p>}
      </div>

      <section aria-labelledby="admin-queue-heading">
        <h2 id="admin-queue-heading" className="text-sm font-semibold uppercase tracking-wide text-slate-500">Queues and totals</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="admin-home-cards">
          {cards.map((card) => (
            <Link
              key={card.label}
              href={card.href}
              className={`group flex items-start justify-between rounded-xl border bg-white p-5 shadow-sm transition hover:shadow ${card.attention ? "border-amber-300" : "border-slate-200"}`}
            >
              <div>
                <p className="text-sm font-medium text-slate-600">{card.label}</p>
                <p className="mt-2 text-3xl font-bold text-slate-900">{card.value}</p>
                {card.attention && <p className="mt-1 text-xs font-semibold text-amber-700">Needs attention</p>}
              </div>
              <span className="flex flex-col items-end gap-3 text-slate-400">
                <card.icon className="h-5 w-5" />
                <ArrowRight className="h-4 w-4 opacity-0 transition group-hover:opacity-100" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section aria-labelledby="admin-health-heading">
        <h2 id="admin-health-heading" className="text-sm font-semibold uppercase tracking-wide text-slate-500">Integrations</h2>
        <ul className="mt-3 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white" data-testid="admin-home-integrations">
          {integrationRows().map((row) => (
            <li key={row.name} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div>
                <p className="text-sm font-semibold text-slate-900">{row.name}</p>
                <p className="text-xs text-slate-500">{row.detail}</p>
              </div>
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${TONE_CLASSES[row.tone]}`}>{row.status}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-slate-500">
          The campaign scheduler runs every five minutes from Supabase; its last runs are in the database&apos;s cron history.
        </p>
      </section>
    </div>
  );
}
