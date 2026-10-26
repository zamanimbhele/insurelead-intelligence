# Licences and authorisations

Selling a financial product needs the right licence or accreditation. InsureLead records
what each person is authorised to sell, per **product category**, and only lets an
organisation receive leads or run campaigns for categories someone in it is verified for.

## How it works

1. A broker or advisor opens **My practice** (or **Broker Profile**) → *Licences and
   authorisations* → **Add an authorisation**. They pick the category and the evidence they
   hold (for example an FSP licence number, or the FSP that appointed them as a
   representative), and give the reference number and expiry date.
2. The claim shows as **Awaiting review**. Platform admins see it on the Admin home and on
   **Authorisations**, check it against the relevant register, and **verify** it (optionally
   setting an expiry) or **reject** it with a reason the advisor sees.
3. While at least one active member holds a **verified, unexpired** authorisation for a
   category, the organisation may sell that category's products.
4. An admin can **revoke** a verified authorisation (with a reason). The holder can
   **withdraw** their own (for example when an appointment ends).

Expiry is checked on every use, so nothing needs to run on a schedule. Authorisations
expiring within 30 days are listed for admins.

## Where it is enforced

| Rule | Database (Supabase) | App (both modes) |
| --- | --- | --- |
| Appetite only within authorised categories | `update_buyer_preferences()` | Appetite editor disables unauthorised products |
| Leads only allocated to an authorised organisation | Trigger on `lead_allocations` | Match reasons |
| Campaigns only for authorised products: created, approved, scheduled or restarted | Trigger on `campaigns` | Campaign validation issue `product_authorisation` |
| Pausing, completing or cancelling a campaign | Never blocked | Never blocked |

The rules live in migration `202610250003_practitioner_authorisations.sql` and are tested
against the full schema in `src/lib/authorisation-db.test.ts`.

## Placeholders to confirm before go-live

These are **demo placeholders** based on common practice. A compliance officer must
confirm or replace them before real advisors use the platform.

| Placeholder | Where to change it |
| --- | --- |
| Evidence accepted per category (`accepted_evidence`) | `product_categories` table |
| Guidance shown with the form (`evidence_guidance`) | `product_categories` table; then set `guidance_is_placeholder = false` to remove the "Placeholder guidance" label |
| Representative disclosure wording (campaign footer, see `docs/PERSONAL_BRAND.md`) | Dashboard → **Legal Content** → *Representative Disclosure*; remove the `PLACEHOLDER` paragraph once confirmed |

Questions for the compliance officer:

1. Which evidence is acceptable for each category, and must it be checked on a specific
   register (FSCA, CMS, NCR)?
2. Must every representative be authorised individually, or is the FSP's licence enough
   for the whole organisation?
3. What exactly must a representative's marketing email disclose (FSP name, FSP number,
   capacity, anything else)?
4. Should investments and medical aid require a second reviewer?

Example: confirm short-term guidance once agreed.

```sql
update public.product_categories
set evidence_guidance = '<confirmed wording>', guidance_is_placeholder = false, updated_at = now()
where id = 'short_term_insurance';
```

## Before go-live on an existing deployment

An organisation with **no** verified authorisations can no longer receive leads or run
campaigns. After running the migration, each live broker records their authorisations
and an admin verifies them, before allocations or campaigns resume.
