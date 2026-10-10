# Multi-broker tenancy setup

This increment separates each participating broker or insurer into an organisation tenant. Platform administrators
can review all approved tenants and allocate consented leads. Broker users see only leads and allocations belonging
to their own organisation.

## Roles

| Role | Scope | Main permissions |
| --- | --- | --- |
| `platform_admin` | All tenants | Configure brokers, review marketplace inventory, reserve leads |
| `compliance_admin` | All tenants | Platform oversight and controlled administration |
| `compliance_auditor` | All tenants, read-only | Review tenant configuration, leads, allocations, and audit evidence |
| `broker_admin` | Own tenant | View organisation profile and accept or release allocated leads |
| `campaign_manager` | Own tenant | View broker profile and manage campaign drafts/content; cannot approve |
| `broker_agent` | Own tenant | View allocated leads and accept or release a reservation |

Legacy `buyer_manager` and `broker` profiles are migrated to `broker_admin` and `broker_agent` respectively.

## Provision a broker tenant

Two paths exist, depending on how the broker arrived.

### Self-service sign-up (the common case)

A broker who fills in `/signup` gets a real Supabase auth user immediately, but no dashboard access until a
platform administrator reviews them - `handle_new_user()` (`supabase/migrations/202610100001_platform_admin_
onboarding.sql`), a trigger on `auth.users`, reads the signup form's `brokerage_name`/`fsp_number`/`requested_role`
metadata and automatically creates a matching `organisations` row (`onboarding_status = 'pending'`) and `profiles`
row (`member_status = 'invited'`) for them - there is nothing to run by hand for this path any more.

1. Open **Broker Directory** (`/dashboard/brokers`, platform/compliance admin only) and find the new organisation -
   it shows an amber "awaiting approval" panel with **Approve**/**Reject** buttons.
2. Approving sets `onboarding_status = 'approved'` and `status = 'active'` (`review_broker_organisation()` RPC); the
   signed-up user's own profile is already `invited`, so under their organisation's **Team members** list, change
   their status to **Active** (and their role, if it should differ from the default `Broker Admin`) via
   `update_profile_membership()`. Both RPCs are platform-admin-only, re-check the caller's role server-side, and
   write an `audit_logs` entry (`organisation_reviewed` / `profile_membership_updated`).
3. Rejecting leaves the organisation inactive; the signed-up user stays `invited` and sees `/access-denied` if they
   try to sign in.
4. Add further team members to an already-approved organisation the same way: have them sign up at `/signup` with
   the same brokerage name (today this creates a *second* `pending` organisation rather than joining the existing
   one - inviting a colleague into an already-approved org, rather than always creating a new one, is a reasonable
   next refinement but out of scope here), or fall back to the manual path below.

**Security note:** `raw_user_meta_data` on a Supabase auth user is client-supplied at signup time and is never
trusted for anything above the lowest privilege tier - `handle_new_user()` always creates the new profile as
`invited` (never `active`) and clamps `requested_role` to `broker_admin`/`broker_agent`/`campaign_manager` only, so
a spoofed `requested_role: "platform_admin"` in a direct call to Supabase's own signup endpoint can never result in
anything but an invited, access-denied broker-role profile that still needs a real platform admin's explicit review.

### Manual provisioning (platform/compliance admins, or a broker added outside the self-service flow)

`handle_new_user()` only fires when `brokerage_name` is present in the signup metadata, so a platform admin,
compliance admin/auditor, or any broker user you choose to add directly (rather than have them self-sign-up) is
still provisioned exactly as before:

1. Apply all migrations with `npx supabase db push`.
2. Copy `supabase/add-pilot-buyer.example.sql`, replace every placeholder, and run it in the Supabase SQL editor.
3. Add each broker user in Supabase Authentication.
4. Copy `supabase/add-broker-user.example.sql`, replace the broker slug, user email, display name, and role, then run it.
5. Ask the user to sign in at `/login` and confirm that `/dashboard/broker-profile` shows only their organisation.
6. Allocate a matching lead as a platform administrator, then confirm the broker can see it under `/dashboard/allocations`.

### Sending-domain verification

`/dashboard/brokers` also shows each organisation's `broker_sending_identities` with **Mark verified**/**Disable**
actions for platform admins (`review_sending_identity()` RPC - manual attestation that the domain's DNS records
were checked, not an automated DNS/Resend API check). There is still no self-service way for a broker to *add* a
sending identity from the dashboard - today that only happens via the manual SQL scripts above - so this review
action is only useful once an identity already exists to review; a broker-side creation form is open future work.

## Tenant boundary

- Dashboard reads use the signed-in Supabase session and Row Level Security.
- A broker tenant can see leads only while it has a `reserved`, `accepted`, or `disputed` allocation.
- A released allocation no longer grants access to the lead.
- Only platform administrators can create allocations or mark sending identities as verified.
- Broker operators respond through the `respond_to_lead_allocation` RPC, which validates tenant ownership and writes an audit record.
- Suspended members do not resolve to an active organisation and therefore lose tenant access.

## Broker appetite and capacity

`buyer_preferences` controls approved products, provinces, optional cities and industries, minimum lead score,
shared-lead eligibility, daily capacity, and contact SLA. Matching is evaluated again inside PostgreSQL before an
allocation is created. Each explicit evaluation is written to `lead_match_evaluations` with its match/rejection reasons.

## Sending identities

`broker_sending_identities` stores each tenant's Resend domain, From address, Reply-To address, verification status,
and default identity. The campaign-generation MCP requires a verified identity, tenant ownership, approved content,
and human approval before delivery.

The operational MCP uses the server-only Supabase client and must not be exposed directly to untrusted users.
Tenant-scoped campaign actor settings and approval enforcement are documented in
[`CAMPAIGN_MCP_SETUP.md`](CAMPAIGN_MCP_SETUP.md).
