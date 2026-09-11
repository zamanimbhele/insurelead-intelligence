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

1. Apply all migrations with `npx supabase db push`.
2. Copy `supabase/add-pilot-buyer.example.sql`, replace every placeholder, and run it in the Supabase SQL editor.
3. Add each broker user in Supabase Authentication.
4. Copy `supabase/add-broker-user.example.sql`, replace the broker slug, user email, display name, and role, then run it.
5. Ask the user to sign in at `/login` and confirm that `/dashboard/broker-profile` shows only their organisation.
6. Allocate a matching lead as a platform administrator, then confirm the broker can see it under `/dashboard/allocations`.

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
