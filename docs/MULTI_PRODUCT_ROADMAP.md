# Multi-product platform roadmap

## Product position

InsureLead Intelligence is a multi-product insurance lead intelligence and campaign orchestration
platform. It connects consented individual and business enquiries with participating brokers whose
approved product appetite matches the selected need. The platform does not provide automated
insurance advice, quotes, premiums, or underwriting decisions.

## Increment 1 — multi-product foundation

- Top-level catalogue for motor, home and contents, life, funeral, travel, personal accident,
  business insurance, and general insurance reviews.
- Individual and business paths through the public enquiry form.
- Existing business leads migrate to `business_insurance`; their detailed cover selections move
  to `business_cover_interests` without being discarded.
- Buyer appetite can be restricted by insurance product in addition to province, industry, and
  minimum score.
- Dashboard and MCP queries expose product classification without changing consent boundaries.

## Increment 2 — multi-broker tenancy

- Broker profile, approved products, geographic coverage, daily capacity, contact SLA, and sending
  identity configuration are implemented in `202609110001_multi_broker_tenancy.sql`.
- Broker-admin, campaign-manager, broker-agent, compliance-auditor, and platform-admin roles are enforced.
- Row Level Security ensures broker users only access their organisation's active allocations and leads.
- Product-aware, territory-aware, and capacity-aware evaluations record a reason for every explicit match or rejection.
- Broker operators can accept or release their own organisation's reserved leads through an audited RPC.

Operational setup is documented in [`BROKER_TENANCY_SETUP.md`](BROKER_TENANCY_SETUP.md).

## Increment 3 — campaign-generation MCP

Campaign generation and campaign delivery remain separate capabilities. Generation creates a
versioned draft; it cannot send. This increment is implemented by
`202609110002_campaign_generation_mcp.sql` and the tenant-scoped campaign MCP tools.

Planned tools:

- `list_insurance_products` and `list_eligible_brokers`
- `list_campaigns` and `create_campaign_draft`
- `generate_campaign_content`, `validate_campaign`, and `preview_campaign`
- `send_test_campaign`, `approve_campaign`, and explicit `launch_campaign`
- `pause_campaign` and `get_campaign_performance`

Before launch, the service must confirm broker/product permission, tenant ownership, consent or
other approved contact basis, suppression status, approved content version, sending identity, and
an explicit human approval. Every attempt and delivery outcome must be auditable.

For the pilot, platform notifications and approved campaign tests may use
`notify.indlelatechnologies.com`. Broker-specific verified sending domains should be supported
before broader campaign volume so reputation and identity can be managed per broker.

See [`CAMPAIGN_MCP_SETUP.md`](CAMPAIGN_MCP_SETUP.md) for role, Resend, delivery-mode, and launch
instructions. Provider webhook ingestion for delivered, bounced, complained, and engagement events
remains a production integration task.
