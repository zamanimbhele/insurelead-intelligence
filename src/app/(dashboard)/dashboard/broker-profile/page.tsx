import { canCreateSendingIdentity, canInviteTeamMember, getDashboardIdentity, isBrokerUser } from "@/lib/auth";
import { getDashboardBrokerWorkspace } from "@/lib/dashboard-data";
import { getProductCatalogue } from "@/lib/product-catalogue";
import { productLabelMap } from "@/lib/products";
import { SendingIdentityForm } from "@/components/dashboard/SendingIdentityForm";
import { InviteTeamMemberForm } from "@/components/dashboard/InviteTeamMemberForm";
import { TaskDigestCard } from "@/components/dashboard/TaskDigestCard";
import { getTaskDigestPreview } from "@/lib/task-digest-runtime";
import { formatDueSast } from "@/lib/task-digest";
import { workspaceTerms } from "@/lib/workspace";
import { AuthorisationsSection } from "@/components/dashboard/AuthorisationsSection";
import { BrandSettingsForm } from "@/components/dashboard/BrandSettingsForm";
import { getDisclosureTemplate } from "@/lib/brand-runtime";
import { COMPANY_BRAND, campaignSenderName } from "@/lib/brand";
import { PlatformSendingOffer } from "@/components/dashboard/PlatformSendingOffer";
import { platformSendingDomain, warmUpDailyCap } from "@/lib/sender-reputation";
import { currentProfileId, listAuthorisations } from "@/lib/authorisation-service";

export const dynamic = "force-dynamic";


export default async function BrokerProfilePage() {
  const identity = await getDashboardIdentity();
  const catalogue = await getProductCatalogue();
  const productLabels = productLabelMap(catalogue);
  const terms = workspaceTerms(identity.workspaceType);
  if (identity.mode === "supabase" && !isBrokerUser(identity)) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
        <h1 className="text-xl font-bold text-slate-900">{terms.profileTitle}</h1>
        <p className="mt-2 text-sm text-amber-900">This workspace is available to broker and insurer organisation members.</p>
      </div>
    );
  }

  const [workspace, digestPreview, authorisations, disclosureTemplate] = await Promise.all([
    getDashboardBrokerWorkspace(identity),
    getTaskDigestPreview(identity),
    listAuthorisations(identity).catch(() => []),
    getDisclosureTemplate(),
  ]);
  const buyer = workspace?.buyer;
  const digestItems = [...(digestPreview.digest?.overdue ?? []), ...(digestPreview.digest?.dueToday ?? [])];
  const formattedDue = Object.fromEntries(digestItems.map((item) => [item.taskId, formatDueSast(item.dueAt)]));
  if (!workspace || !buyer) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
        <h1 className="text-xl font-bold text-slate-900">{terms.profileTitle}</h1>
        <p className="mt-2 text-sm text-amber-900">No buyer profile is associated with this organisation.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{terms.profileTitle}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {identity.workspaceType === "individual"
            ? `Settings, approved products and sending details for ${buyer.organisationName}.`
            : `Tenant configuration for ${buyer.organisationName}.`}
        </p>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{buyer.organisationName}</h2>
            <p className="mt-1 text-sm text-slate-500">{buyer.contactEmail} · {buyer.fspNumber ?? "FSP number pending"}</p>
          </div>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">{buyer.onboardingStatus} · {buyer.status}</span>
        </div>
        <dl className="mt-6 grid gap-5 text-sm sm:grid-cols-2 lg:grid-cols-5">
          <div><dt className="text-slate-400">Daily capacity</dt><dd className="mt-1 font-semibold text-slate-800">{buyer.dailyLeadCapacity} leads</dd></div>
          <div><dt className="text-slate-400">Contact SLA</dt><dd className="mt-1 font-semibold text-slate-800">{buyer.contactSlaHours} hours</dd></div>
          <div><dt className="text-slate-400">Minimum score</dt><dd className="mt-1 font-semibold text-slate-800">{buyer.minimumScore}/100</dd></div>
          <div><dt className="text-slate-400">Shared leads</dt><dd className="mt-1 font-semibold text-slate-800">{buyer.acceptsSharedLeads ? "Accepted" : "Not accepted"}</dd></div>
          <div><dt className="text-slate-400">Campaigns</dt><dd className="mt-1 font-semibold text-slate-800">{buyer.acceptsCampaigns ? "Enabled" : "Disabled"}</dd></div>
        </dl>
      </section>

      <BrandSettingsForm
        organisationId={buyer.id}
        initial={buyer.brand ?? COMPANY_BRAND}
        template={disclosureTemplate}
        canEdit={identity.role === "broker_admin"}
      />

      <AuthorisationsSection
        catalogue={catalogue}
        authorisations={authorisations}
        profileId={currentProfileId(identity)}
        organisationId={buyer.id}
        organisationNoun={terms.organisationNoun}
        canSubmit={isBrokerUser(identity)}
        showTeam={terms.showTeam}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="font-semibold text-slate-900">Approved appetite</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {buyer.insuranceProducts.map((product) => (
              <span key={product} className="rounded-full bg-primary-50 px-3 py-1 text-xs font-medium text-primary-700">
                {productLabels.get(product) ?? product}
              </span>
            ))}
          </div>
          <p className="mt-5 text-sm text-slate-600"><span className="text-slate-400">Provinces:</span> {buyer.provinces.join(", ") || "National"}</p>
          <p className="mt-2 text-sm text-slate-600"><span className="text-slate-400">Cities:</span> {buyer.cities.join(", ") || "All cities in approved provinces"}</p>
          <p className="mt-2 text-sm text-slate-600"><span className="text-slate-400">Industries:</span> {buyer.industries.join(", ") || "All industries"}</p>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="font-semibold text-slate-900">Sending identities</h2>
          <p className="mt-1 text-xs text-slate-400">Only verified identities can be used when campaign delivery is enabled.</p>
          <div className="mt-4 space-y-3">
            {workspace.sendingIdentities.length === 0 ? <p className="text-sm text-amber-700">No identity configured.</p> : workspace.sendingIdentities.map((item) => (
              <div key={item.id} className="rounded-lg border border-slate-200 p-4" data-testid="sending-identity">
                <div className="flex justify-between gap-3">
                  <span className="text-sm font-medium text-slate-800">{item.fromName}</span>
                  <span className={`text-xs capitalize ${item.status === "verified" ? "text-emerald-700" : item.status === "disabled" ? "text-red-700" : "text-slate-500"}`}>
                    {item.status === "disabled" && item.pausedAt ? "paused" : item.status}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-600">{item.fromEmail}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {item.kind === "platform" ? <span className="mr-1 rounded bg-primary-50 px-1.5 py-0.5 font-semibold text-primary-700">InsureLead sending</span> : null}
                  {item.domain}{item.isDefault ? " · default" : ""}{item.replyToEmail ? ` · replies to ${item.replyToEmail}` : ""}
                </p>
                {item.kind === "platform" && item.status === "verified" && warmUpDailyCap(item.createdAt) !== undefined && (
                  <p className="mt-1 text-xs text-slate-500">New sender: up to {warmUpDailyCap(item.createdAt)} emails a day for now, rising over the first 30 days.</p>
                )}
                {item.statusReason && <p className="mt-1 text-xs text-red-700" data-testid="sending-identity-reason">{item.statusReason}</p>}
              </div>
            ))}
          </div>
          {canCreateSendingIdentity(identity) && !workspace.sendingIdentities.some((item) => item.kind === "platform") ? (
            <PlatformSendingOffer
              fromName={campaignSenderName(buyer.organisationName, buyer.brand)}
              replyTo={identity.email}
              domain={platformSendingDomain(process.env.INSURELEAD_PLATFORM_SENDING_DOMAIN, identity.mode === "demo")}
            />
          ) : null}
          {canCreateSendingIdentity(identity) ? <SendingIdentityForm /> : null}
        </section>
      </div>

      {digestPreview.eligible && (
        <TaskDigestCard enabled={digestPreview.enabled} digest={digestPreview.digest} formattedDue={formattedDue} />
      )}

      {terms.showTeam ? (
        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="font-semibold text-slate-900">Organisation members</h2>
          <div className="mt-4 divide-y divide-slate-100">
            {workspace.members.length === 0 ? <p className="text-sm text-slate-500">No demo members are listed.</p> : workspace.members.map((member) => (
              <div key={member.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                <div><p className="font-medium text-slate-800">{member.displayName ?? "Broker user"}</p><p className="text-xs text-slate-400">{member.jobTitle ?? member.role.replaceAll("_", " ")}</p></div>
                <span className="capitalize text-slate-500">{member.status}</span>
              </div>
            ))}
          </div>
          {canInviteTeamMember(identity) ? <InviteTeamMemberForm /> : null}
        </section>
      ) : (
        <section className="rounded-xl border border-slate-200 bg-white p-6" data-testid="solo-team-invite">
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-slate-900">Working with someone? Invite a colleague</summary>
            <p className="mt-2 text-sm text-slate-500">
              You work on your own, so team pages are hidden. Inviting a colleague turns your workspace into a practice,
              and the team pages appear for you both.
            </p>
            {canInviteTeamMember(identity) ? <InviteTeamMemberForm /> : null}
          </details>
        </section>
      )}
    </div>
  );
}
