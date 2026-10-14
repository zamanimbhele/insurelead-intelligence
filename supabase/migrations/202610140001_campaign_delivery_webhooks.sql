-- Extends campaign_delivery_events.event_type to accept the inbound
-- Resend/Svix delivery and engagement webhook outcomes the application
-- layer can now record (src/lib/campaign-webhooks.ts,
-- src/app/api/webhooks/resend/route.ts): "delivered", "bounced",
-- "complained", "opened", "clicked". No other schema change is needed -
-- campaign_recipients.status already accepted 'delivered'/'bounced'/
-- 'complained' from the original campaign-generation migration
-- (202609110002), it was simply never reachable until now because nothing
-- fed those outcomes back from the provider. The webhook route runs with
-- the service-role client (there is no Supabase session to authorise a
-- provider-originated HTTP callback against - the Svix signature is the
-- only trust boundary), which already has full table access independent
-- of the authenticated/anon grants this migration series manages, so no
-- grant changes are needed here either.

alter table public.campaign_delivery_events
  drop constraint if exists campaign_delivery_events_event_type_check;

alter table public.campaign_delivery_events
  add constraint campaign_delivery_events_event_type_check
  check (event_type in (
    'draft_created', 'content_generated', 'validation_completed', 'test_sent',
    'approved', 'launch_started', 'recipient_sent', 'recipient_failed',
    'paused', 'completed', 'recipient_unsubscribed',
    'delivered', 'bounced', 'complained', 'opened', 'clicked'
  ));
