# Daily task digest

Every morning at about 06:00 SAST, each broker user gets one email listing their follow-up tasks
that are **overdue** or **due today**, each linked to the lead. Nothing is sent to someone with no
such tasks.

## Who gets which tasks

Open tasks with a due date, on leads **accepted by the user's own organisation**, excluding
deleted leads:

| Role | Tasks included |
|---|---|
| `broker_admin` | Every such task in the organisation |
| `broker_agent` | Tasks they created, or whose assignee matches their display name or email (case-insensitive) |
| Everyone else | No digest |

Only active members of active organisations are included. Tasks on Do Not Contact leads are listed
with a "close or cancel" flag, because they should not be actioned as outreach.

To limit personal data in email, a lead is identified by its business name, or by the contact's
first name only.

## Turning it off

Each user controls their own digest with the **Email me the digest** switch on the Broker Profile
page. The same card previews exactly what today's email contains.

## Setup

1. Run migration `202610210003_task_due_digest.sql`.
2. Verify a sending domain for the platform in Resend (for example `insurelead.online`). Then set
   these in Vercel and redeploy:

   ```dotenv
   RESEND_API_KEY=...            # already set if campaign delivery is configured
   NOTIFICATION_EMAIL_FROM=InsureLead <notifications@insurelead.online>
   CRON_SECRET=...               # openssl rand -hex 32; shared with the campaign scheduler
   ```

3. Triggering: `vercel.json` already schedules `/api/cron/task-digest` daily at 04:00 UTC
   (06:00 SAST). A once-a-day cron works on every Vercel plan, and Vercel sends the
   `CRON_SECRET` header automatically. To use Supabase `pg_cron` instead, schedule
   `0 4 * * *` with the same `net.http_get` call shown in docs/CAMPAIGN_MCP_SETUP.md section 7,
   pointed at `/api/cron/task-digest`.

Without `NOTIFICATION_EMAIL_FROM` the run reports `email-not-configured` and sends nothing.
Without `CRON_SECRET` the endpoint returns 503.

## Delivery guarantees

- **At most one digest per person per SAST day.** Each person is claimed in
  `task_digest_deliveries` before their email is sent, so a repeated or overlapping run skips
  anyone already handled. Resend also receives a per-person-per-day idempotency key.
- **Failures are recorded, not retried that day.** The row's `status` is `failed`, with the error
  message. Query them with:

  ```sql
  select digest_date, status, task_count, error
  from task_digest_deliveries
  order by created_at desc
  limit 50;
  ```
