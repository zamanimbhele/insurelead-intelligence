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

- Broker profile, approved products, geographic coverage, capacity, contact SLA, and sending
  identity configuration.
- Broker-admin, campaign-manager, broker-agent, compliance-auditor, and platform-admin roles.
- Row Level Security ensuring broker users only access their organisation's campaigns and leads.
- Product-aware allocation with an auditable reason for every match or rejection.

## Increment 3 — campaign-generation MCP

Campaign generation and campaign delivery remain separate capabilities. Generation creates a
versioned draft; it cannot send.

Planned tools:

- `list_insurance_products`
- `list_eligible_brokers`
- `create_campaign_draft`
- `generate_campaign_content`
- `validate_campaign`
- `preview_campaign`
- `send_test_campaign`
- `approve_campaign`
- `launch_campaign`
- `pause_campaign`
- `get_campaign_performance`

Before launch, the service must confirm broker/product permission, tenant ownership, consent or
other approved contact basis, suppression status, approved content version, sending identity, and
an explicit human approval. Every attempt and delivery outcome must be auditable.

For the pilot, platform notifications and approved campaign tests may use
`notify.indlelatechnologies.com`. Broker-specific verified sending domains should be supported
before broader campaign volume so reputation and identity can be managed per broker.
