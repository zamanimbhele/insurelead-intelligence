# Production-pilot hardening

This guide enables the controls around the public consultation form after the Supabase setup is
complete. Keep `INSURELEAD_CAPTCHA_MODE=off` only for local development; `/api/health` reports
whether the deployed environment has all pilot controls configured.

## 1. Apply the rate-limit migration

From the repository root:

```bash
npx supabase migration list
npx supabase db push
```

Migration `202609050001_pilot_hardening.sql` creates an atomic PostgreSQL rate-limit counter.
The application stores only an HMAC digest of the client IP, never the raw address. Old counters
are removed after seven days.

Generate a unique server-only secret of at least 32 characters:

```bash
openssl rand -hex 32
```

Add these settings to `.env.local` and to the deployment environment:

```dotenv
RATE_LIMIT_HASH_SECRET=PASTE_THE_GENERATED_VALUE
LEAD_RATE_LIMIT_MAX=5
LEAD_RATE_LIMIT_WINDOW_SECONDS=60
```

Changing `RATE_LIMIT_HASH_SECRET` invalidates existing counters, so rotate it deliberately. Never
prefix it with `NEXT_PUBLIC_`, commit it, or paste it into client-side code.

## 2. Configure Cloudflare Turnstile

1. Create a Turnstile widget in Cloudflare and allow `localhost` for local testing plus the exact
   preview and production hostnames that should serve the form.
2. Store its site key and secret key in `.env.local` or the deployment settings.
3. Enable Turnstile only after both values are present:

```dotenv
INSURELEAD_CAPTCHA_MODE=turnstile
NEXT_PUBLIC_TURNSTILE_SITE_KEY=YOUR_SITE_KEY
TURNSTILE_SECRET_KEY=YOUR_SECRET_KEY
```

The site key is intentionally public. `TURNSTILE_SECRET_KEY` is server-only. The browser obtains
a token and `/api/leads` validates it with Cloudflare before checking for duplicates or writing a
lead. Failed or expired tokens are reset in the form.

For local work without a widget, use:

```dotenv
INSURELEAD_CAPTCHA_MODE=off
```

## 3. Connect the lead-queue notification

Create an HTTPS webhook in the internal automation service used by the pilot, such as Power
Automate, Make, Zapier, or a controlled internal endpoint. Configure:

```dotenv
NEXT_PUBLIC_APP_URL=https://YOUR_DEPLOYED_DOMAIN
LEAD_NOTIFICATION_WEBHOOK_URL=https://YOUR_WEBHOOK_ENDPOINT
LEAD_NOTIFICATION_WEBHOOK_TOKEN=OPTIONAL_BEARER_TOKEN
```

The server sends this shape only after the lead has been stored:

```json
{
  "event": "lead.created",
  "leadId": "uuid",
  "businessName": "Example Business",
  "industry": "Manufacturing",
  "province": "Gauteng",
  "city": "Johannesburg",
  "insuranceProducts": ["Property Insurance"],
  "preferredContactChannel": "email",
  "score": 58,
  "scoreBand": "warm",
  "campaignSource": "partner-referral",
  "dashboardUrl": "https://YOUR_DEPLOYED_DOMAIN/dashboard/leads/uuid",
  "createdAt": "ISO-8601 timestamp"
}
```

Contact name, email, and mobile are deliberately excluded. The alert recipient must authenticate
to the dashboard to view contact details. Configure the workflow to notify the internal lead
queue, then test that it acknowledges the webhook with an HTTP 2xx response. Failed webhook
delivery is written to the audit log and does not discard the captured lead.

## 4. Check deployment readiness

Open or monitor:

```text
https://YOUR_DEPLOYED_DOMAIN/api/health
```

A public-ready pilot returns HTTP 200 with:

```json
{
  "status": "ok",
  "mode": "supabase",
  "readyForPublicTraffic": true,
  "checks": {
    "dataStore": "ok",
    "durableRateLimit": "configured",
    "captcha": "configured",
    "notifications": "configured"
  }
}
```

The endpoint exposes configuration status but never secret values. `degraded` means the app can
run but a go-live control is disabled or missing; `unavailable` returns HTTP 503 when the data
store cannot be reached.

## 5. Pilot acceptance check

Before sending paid traffic:

- Submit one clearly labelled test enquiry from the deployed form.
- Confirm exactly one lead, one current consent, and the `lead_created` audit event exist.
- Confirm the internal notification arrives and its dashboard link requires authentication.
- Submit more than the configured limit and confirm HTTP 429 behavior.
- Submit with a missing or expired CAPTCHA token and confirm no lead is created.
- Confirm `/api/health` reports `readyForPublicTraffic: true`.
- Rotate any secret that appeared in a screenshot, terminal recording, support ticket, or chat.
