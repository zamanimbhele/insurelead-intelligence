# Campaign-generation MCP setup

This increment lets one MCP server orchestrate campaigns for multiple broker and insurer tenants
without mixing their data. A campaign belongs to exactly one organisation and may only use that
organisation's approved insurance products and verified sending identity.

Content generation never sends. Approval never sends. Delivery requires a separate launch call
containing the exact campaign ID.

## 1. Apply the migration

After the feature pull request has been merged and `main` is current:

```bash
npx supabase migration list
npx supabase db push
npx supabase migration list
```

`202609110002_campaign_generation_mcp.sql` adds campaigns, immutable content versions, approvals,
recipient snapshots, delivery events, hashed suppressions, tenant Row Level Security, and the
database-side recipient preparation check.

## 2. Enable a broker deliberately

Campaign permission is disabled by default for newly provisioned brokers. Confirm the broker's
approved product appetite and then enable it in Supabase SQL Editor:

```sql
update public.buyer_preferences
set accepts_campaigns = true
where organisation_id = 'REPLACE_WITH_BROKER_ORGANISATION_UUID';
```

The broker also needs a `broker_sending_identities` row with `status = 'verified'`. During a small
pilot, a sender under `notify.indlelatechnologies.com` can be attached to an approved broker tenant.
Use broker-specific verified domains before broader volume so reputation and identity remain
separable.

## 3. Configure the MCP actor

The stdio MCP process has no interactive Supabase login. Its environment therefore defines a
single trusted actor context. Never share a broker-scoped MCP configuration with another broker.

Platform administrator example:

```dotenv
INSURELEAD_MCP_ALLOW_WRITES=true
INSURELEAD_MCP_ACTOR_ROLE=platform_admin
INSURELEAD_MCP_ACTOR_LABEL=zamanim@indlelatechnologies.com
INSURELEAD_MCP_ORGANISATION_ID=
```

Broker campaign-manager example:

```dotenv
INSURELEAD_MCP_ALLOW_WRITES=true
INSURELEAD_MCP_ACTOR_ROLE=campaign_manager
INSURELEAD_MCP_ACTOR_LABEL=REPLACE_WITH_BROKER_USER_EMAIL
INSURELEAD_MCP_ORGANISATION_ID=REPLACE_WITH_BROKER_ORGANISATION_UUID
```

A broker-scoped actor cannot select a different `organisationId`. Campaign managers can create
and generate campaigns but cannot approve them. Approval requires `broker_admin` or
`platform_admin`.

## 4. Configure safe delivery

Start with delivery disabled:

```dotenv
INSURELEAD_CAMPAIGN_DELIVERY_MODE=disabled
RESEND_API_KEY=PASTE_SERVER_ONLY_KEY
CAMPAIGN_UNSUBSCRIBE_SECRET=PASTE_RANDOM_64_CHARACTER_VALUE
CAMPAIGN_MAX_BATCH_SIZE=25
NEXT_PUBLIC_APP_URL=https://REPLACE_WITH_DEPLOYED_HOST
```

Generate the unsubscribe secret with:

```bash
openssl rand -hex 32
```

The Resend key and unsubscribe secret are server-only. Never prefix them with `NEXT_PUBLIC_`,
commit them, or put them in screenshots.

Delivery modes:

| Mode | `send_test_campaign` | `launch_campaign` |
|---|---:|---:|
| `disabled` | Blocked | Blocked |
| `test` | Allowed | Blocked |
| `live` | Allowed | Allowed after approval and confirmation |

Move from `disabled` to `test`, send to a controlled address, inspect the message and unsubscribe
flow, then use `live` only after compliance approval. Demo mode simulates provider delivery and
never calls Resend.

## 5. MCP workflow

Use the tools in this order:

1. `list_insurance_products`
2. `list_eligible_brokers`
3. `create_campaign_draft`
4. `generate_campaign_content`
5. `validate_campaign`
6. `preview_campaign`
7. `send_test_campaign` with `SEND TEST`
8. `approve_campaign` with `I approve this campaign for delivery`
9. `launch_campaign` with `LAUNCH <campaign-id>`
10. `get_campaign_performance`, or `pause_campaign` before another batch

Each launch batch rechecks:

- campaign ownership and MCP tenant scope;
- broker approval and `accepts_campaigns`;
- product appetite and verified sender ownership;
- approval of the current immutable content version;
- an accepted lead allocation for that same broker;
- explicit marketing consent and Do Not Contact status;
- hashed broker-level suppression records;
- the configured batch ceiling.

The launch result and performance tool expose aggregate outcomes, not recipient names or email
addresses. Provider delivery, bounce, complaint, and engagement webhooks remain a production
integration task; this increment records accepted provider sends and immediate provider failures.

## 6. Validate locally

```bash
npm run typecheck
npm run lint
npm run test:tenancy
npm run test:campaigns
npm run build
npm run test:e2e
```

Use `npm run test:e2e`, not raw `npx playwright test`, so Supabase and Turnstile production
settings do not leak into the isolated browser-test runtime.
