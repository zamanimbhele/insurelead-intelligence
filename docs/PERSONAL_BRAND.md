# Personal brand and representative disclosure

Some advisors may not use their employer's or FSP's name and branding in their own
marketing. With a **personal brand**, their campaigns are signed with their own name and
always carry a **representative disclosure**: who they are, in what capacity, and for
which authorised FSP.

## Setting it up

**My practice** (or **Broker Profile**) → *Branding* → **Personal brand**, then fill in:

| Detail | Example |
| --- | --- |
| Your name as it appears on emails | Lerato Ndlovu |
| Your capacity | Representative of an FSP, or Key individual of an FSP |
| Authorised FSP you act for | Example Life Financial Services |
| FSP number | 12345 |

The form shows a live preview of the footer. Only the organisation's broker admin, or a
platform admin, can change it, and every change is audit-logged.

## How the disclosure gets into emails

- The wording is the editable legal text **Representative Disclosure** (Dashboard → Legal
  Content), with `{{advisor_name}}`, `{{capacity}}`, `{{fsp_name}}` and `{{fsp_number}}`
  filled in from the details above.
- A paragraph starting with `PLACEHOLDER` is a note for admins and never appears in email.
  While it is there, campaigns show a warning that the wording is still a placeholder.
- The disclosure is written into the campaign content **when the content is generated**,
  so the email that is approved is exactly the email that is sent.
- If the details or the wording change later, existing content is flagged *"The disclosure
  in this content is missing or out of date"*, and approval, scheduling and sending are
  blocked until the content is generated again. A campaign that is already sending pauses
  itself.
- Content can't be generated for a personal brand until all four details are filled in.

## Before go-live

Confirm the disclosure wording with a compliance officer (see `docs/AUTHORISATIONS.md`),
replace the text under Legal Content, and remove the `PLACEHOLDER` paragraph.
