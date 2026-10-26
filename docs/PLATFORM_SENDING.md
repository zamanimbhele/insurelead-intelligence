# InsureLead sending ("Name via InsureLead")

Advisors without their own email domain can send campaigns through the platform's own
sending domain. Emails go out as **"Lerato Ndlovu via InsureLead"** from an address such as
`lerato-ndlovu-1a2b3c4d@mail.insurelead.online`, and replies go to the advisor's own
confirmed email address.

## One-time setup (platform team)

1. **Verify a sending subdomain in Resend.** Use a subdomain such as `mail.insurelead.online`
   so campaign reputation stays separate from your main domain. In Resend → Domains → Add
   domain, add the DNS records it shows (SPF, DKIM, and a DMARC record such as
   `v=DMARC1; p=none; rua=mailto:dmarc@insurelead.online`), then wait for it to verify.
2. **Set the domain in Vercel:** `INSURELEAD_PLATFORM_SENDING_DOMAIN=mail.insurelead.online`,
   then redeploy.
3. **Check** `/api/health`: `platformSending` should read `configured`.
4. **Webhooks** must already be on (`campaignWebhooks: configured`). Without bounce and
   complaint events there is nothing to protect the shared reputation with.

## For an advisor

**My practice** → *Sending identities* → **Use InsureLead sending**. The identity is ready
straight away; there is no DNS to set up. One per organisation.

## Protecting the shared reputation

Everyone using the platform domain shares its reputation with mailbox providers, so:

| Safeguard | Rule |
| --- | --- |
| Warm-up | A new InsureLead sender may send up to **50** emails a day in its first week, **100** in the second, **250** until day 30, then the broker's own daily limit. |
| Bounces | Paused when more than **5%** of its emails in the last 30 days bounced, once it has sent at least 50. |
| Spam complaints | Paused when there are **2 or more** complaints and they are above **0.3%** of its emails in the last 30 days. |
| What a pause does | The identity is disabled with the reason shown to the advisor and to admins. Any campaign using it stops at its next batch (the existing sender safety check). |
| Re-enabling | A platform admin reviews the sender in the **Broker Directory** and uses **Mark verified**. |

The rules apply to every sending identity, including custom domains, because all
campaigns share the platform's Resend account. The checks run after every bounce or
complaint webhook, and before every send batch. The Admin home counts paused senders.

Thresholds live in `src/lib/sender-reputation.ts`.
