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
addresses. This increment records an accepted provider send or an immediate provider failure at
launch time; what happens to the message afterwards (delivered, bounced, complained, opened,
clicked) is ingested separately - see the next section.

## 6. Configure provider delivery and engagement webhooks

Resend reports what happens to a sent message - delivered, bounced, complained, opened, clicked -
asynchronously, by calling a webhook endpoint you register. `POST /api/webhooks/resend`
(`src/app/api/webhooks/resend/route.ts`) receives these, verifies Resend's own signature, matches
the event back to the `campaign_recipients` row that send created (by the provider message ID
recorded at send time), updates that recipient's status where the event represents one
(`delivered`, `bounced`, `complained` - `opened`/`clicked` are recorded as events only, since they
are engagement signals rather than delivery states), and appends an immutable
`campaign_delivery_events` row either way. A bounce or complaint also writes a hashed
`marketing_suppressions` record for that broker - the same list a recipient's own unsubscribe
click writes to - so neither this nor any future campaign for that broker ever re-targets the
address again.

Resend signs these webhooks with Svix. In the Resend dashboard, under Webhooks, add an endpoint:

```
URL: <NEXT_PUBLIC_APP_URL>/api/webhooks/resend
Events: email.delivered, email.bounced, email.complained, email.opened, email.clicked
```

Resend shows a signing secret starting `whsec_` when you create the endpoint. Paste it into:

```dotenv
RESEND_WEBHOOK_SECRET=whsec_PASTE_THE_SIGNING_SECRET
```

This is the only authority check on this endpoint - there is no Supabase session or dashboard
role attached to a provider callback, so a request with a missing, stale (older than 5 minutes),
or invalid signature is rejected (401) before any lookup or database write runs, and the response
never distinguishes "bad signature" from "no matching recipient" or any other reason, so the
endpoint cannot be used to probe for valid campaign or recipient state. `/api/health` reports
`checks.campaignWebhooks` as `configured` once `RESEND_WEBHOOK_SECRET` is set - this is
informational only and does not gate `readyForCampaignDelivery`, since a missing webhook secret
does not stop a campaign from sending, it only means delivery feedback is never ingested.

Demo mode has a full equivalent of this entire flow against its own JSON-file campaign store (no
Resend account or real webhook needed to exercise it): the signature verification, status
transitions, idempotency, and `email.*` type mapping are identical code paths in both modes - only
the secret and where a `campaign_recipients`/`campaign_delivery_events`/`marketing_suppressions`
row is read from and written to differ. In demo mode `RESEND_WEBHOOK_SECRET` is ignored entirely
in favour of a fixed, clearly-labelled demo secret (the same convention
`CAMPAIGN_UNSUBSCRIBE_SECRET` already follows for the unsubscribe link), so the e2e suite and a
local demo run can both sign a test webhook request deterministically without any real Resend
account.

## 7. Sending limits and scheduled sending

Migration `202610210002_campaign_sending_limits_and_scheduling.sql` adds:

- **Per-broker quotas.** Every broker has a daily and a monthly campaign email limit (defaults
  200 and 3 000), counted across all of its campaigns per South African calendar day and month.
  Platform admins change them in **Broker Directory → Edit appetite & permissions**. A batch never
  sends past the remaining quota; leftover recipients stay queued and go out after the limit resets.
- **Scheduling from the dashboard.** On an approved campaign, a broker admin or platform admin
  opens the **Sending** panel, picks "Start sending now" or a date and time (SAST), ticks the
  confirmation and schedules it. **Cancel schedule** and **Pause sending** stop it again; queued
  recipients are kept. Editing the content after approval resets the approval and automatically
  pauses any scheduled or in-progress send.
- **A scheduled sender** at `/api/cron/campaign-sends`. Each run sends at most one batch per due
  campaign (`CAMPAIGN_MAX_BATCH_SIZE`, max 100), re-checks every recipient at send time, and stops
  starting new work after 45 seconds. A campaign that can no longer pass validation is paused with
  the reason in its activity log. A per-campaign send lease prevents two runs (or a run and an MCP
  `launch_campaign`) from sending the same queue at once.

The MCP `launch_campaign` tool uses the same engine, so it also respects the quotas.

### Configure the scheduler

1. Generate a secret and add it to the deployment's environment variables, then redeploy:

   ```bash
   openssl rand -hex 32   # -> CRON_SECRET
   ```

2. Call `GET` (or `POST`) `/api/cron/campaign-sends` every 5 minutes with the header
   `Authorization: Bearer <CRON_SECRET>`. Pick one option:

   **Vercel Cron (Vercel Pro).** Add a `vercel.json` at the repo root. Vercel sends the
   `CRON_SECRET` header automatically. On the Hobby plan crons can only run once a day, and a
   more frequent schedule fails the deployment, so use the Supabase option there.

   ```json
   { "crons": [{ "path": "/api/cron/campaign-sends", "schedule": "*/5 * * * *" }] }
   ```

   **Supabase pg_cron (any Vercel plan).** Enable the `pg_cron` and `pg_net` extensions
   (Database → Extensions), store the secret in Vault, then schedule the call in the SQL editor:

   ```sql
   select vault.create_secret('<CRON_SECRET>', 'campaign_cron_secret');

   select cron.schedule(
     'campaign-sends',
     '*/5 * * * *',
     $$
     select net.http_get(
       url := 'https://insurelead.online/api/cron/campaign-sends',
       headers := jsonb_build_object(
         'Authorization',
         'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'campaign_cron_secret')
       ),
       timeout_milliseconds := 60000
     );
     $$
   );
   ```

3. Check it: `select * from cron.job_run_details order by start_time desc limit 5;` (pg_cron) or
   the Vercel function logs, which print one `[campaign-scheduler] run complete` line per run.

Without `CRON_SECRET` the endpoint returns 503 and nothing is sent; scheduled campaigns simply
wait.

## 8. Validate locally

```bash
npm run typecheck
npm run lint
npm run test:unit
npm run test:tenancy
npm run test:campaigns
npm run build
npm run test:e2e
```

Use `npm run test:e2e`, not raw `npx playwright test`, so Supabase and Turnstile production
settings do not leak into the isolated browser-test runtime.
