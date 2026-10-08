-- Configurable legal-text fields (project brief section 2: "Build
-- configurable legal-text fields so compliance teams can update: Privacy
-- notice text, Consent wording, Contact permission wording, Marketing
-- communication wording, Financial-services disclosures, Terms of use,
-- Data retention policy") with version history, editable by Compliance
-- Admin - BACKLOG.md's own item of the same name, and flagged inline at
-- the two places that were standing in for it: the PRODUCTION NOTE at the
-- top of src/app/(site)/privacy/page.tsx and the comment on
-- ApplicationSettings.leadRetentionDays in src/lib/types.ts.
--
-- Two tables, same shape as the Data Source Registry's own
-- current-state-plus-append-only-history split (202610040001):
--   legal_text_documents          - exactly 7 rows, one per document key,
--                                    holding the CURRENT published text.
--   legal_text_document_versions  - append-only history, one row per save,
--                                    so a prior version is never lost.
--
-- Unlike every other table this platform has added, the current text in
-- legal_text_documents is read by the PUBLIC site (Privacy Notice, Terms
-- of Use, and the consultation form's consent checkboxes) before anyone
-- has signed in. That public read goes through the server-side admin
-- (service-role) client - the same client the public lead-capture route
-- already uses for anonymous submissions (src/lib/runtime-data.ts) - so
-- RLS on this table only ever needs to cover the authenticated dashboard
-- read/write path, exactly like every other compliance table. No anon
-- grant is added here.

create table public.legal_text_documents (
  document_key text primary key check (document_key in (
    'privacy_notice', 'consent_wording', 'contact_permission_wording',
    'marketing_wording', 'fsp_disclosures', 'terms_of_use', 'data_retention_policy'
  )),
  title text not null,
  content text not null,
  version integer not null default 1,
  updated_by text not null default 'system_seed',
  updated_at timestamptz not null default now()
);

create table public.legal_text_document_versions (
  id uuid primary key default gen_random_uuid(),
  document_key text not null references public.legal_text_documents(document_key),
  version integer not null,
  content text not null,
  updated_by text not null,
  created_at timestamptz not null default now()
);

create index legal_text_document_versions_key_idx
  on public.legal_text_document_versions (document_key, version desc);

alter table public.legal_text_documents enable row level security;
alter table public.legal_text_document_versions enable row level security;

create policy "platform admins manage legal text documents"
  on public.legal_text_documents for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy "compliance auditors view legal text documents"
  on public.legal_text_documents for select
  using (public.is_compliance_auditor());

create policy "platform admins view legal text document versions"
  on public.legal_text_document_versions for select
  using (public.is_platform_admin());

create policy "compliance auditors view legal text document versions"
  on public.legal_text_document_versions for select
  using (public.is_compliance_auditor());

revoke all on public.legal_text_documents from public, anon, authenticated;
grant select on public.legal_text_documents to authenticated;

revoke all on public.legal_text_document_versions from public, anon, authenticated;
grant select on public.legal_text_document_versions to authenticated;

-- Seed the 7 required documents so a fresh database is never missing one -
-- the application code also falls back to these exact defaults in demo
-- mode (src/lib/constants.ts LEGAL_TEXT_DOCUMENT_DEFINITIONS) so the two
-- modes start from identical placeholder text.
insert into public.legal_text_documents (document_key, title, content) values
(
  'privacy_notice',
  'Privacy Notice',
  e'This Privacy Notice explains how InsureLead Intelligence (the "Platform") collects, uses, and protects information you submit when making a personal or business insurance enquiry.\n\nWhat we collect: We collect applicant type, location, selected insurance products, contact details, and, for business enquiries, relevant business details. We do not collect ID numbers, banking details, payment card details, or medical information through this form.\n\nHow we use your information: Your information is used to respond to your enquiry and, when you give partner-sharing consent, match it to no more than the number of approved insurance partners you selected. Optional marketing consent is separate and is not required. We record your campaign source, recipient limit and consent wording.\n\nYour rights: You may request access to, correction of, or deletion of your information, or ask to be marked Do Not Contact, at any time via our Contact Us page. We will action opt-out and deletion requests in line with our data retention policy.\n\nContact: For privacy queries, contact compliance@[configure-domain].co.za.'
),
(
  'consent_wording',
  'Consent Wording (Partner Sharing)',
  'I consent to InsureLead sharing this enquiry and my contact details with the approved insurance partner limit I select below, so they may contact me about the selected insurance products.'
),
(
  'contact_permission_wording',
  'Contact Permission Wording',
  'I am requesting contact about the insurance products selected and consent to be contacted about this enquiry via my selected contact channel (phone, email, or WhatsApp).'
),
(
  'marketing_wording',
  'Marketing Communication Wording',
  'Optional: I would also like to receive future insurance marketing communications relevant to the interests I selected. I understand I can unsubscribe at any time.'
),
(
  'fsp_disclosures',
  'Financial Services Provider Disclosures',
  e'Financial services provider details and relevant product permissions will be displayed here for each participating broker once configured by an authorised administrator. [Configure FSP name, licence number, and permitted product categories before go-live.]'
),
(
  'terms_of_use',
  'Terms of Use',
  e'By submitting the enquiry form, you confirm that the information provided is accurate to the best of your knowledge and, for a business enquiry, that you are authorised to submit it for the business named.\n\nSubmitting an enquiry through this Platform does not create insurance cover, a binding quote, financial advice, or any contractual relationship. Any recommendations, quotes, or advice will only be provided directly by a licensed broker following review of your enquiry.'
),
(
  'data_retention_policy',
  'Data Retention Policy',
  e'[Configure retention periods per data category - to be set by Compliance Admin before go-live.] The platform-wide lead retention threshold itself is configured separately under Compliance > Retention threshold.'
);

insert into public.legal_text_document_versions (document_key, version, content, updated_by)
select document_key, version, content, updated_by from public.legal_text_documents;

-- ---------------------------------------------------------------------
-- RPC: the only way to change a document's published content. Always
-- bumps the version, always appends to legal_text_document_versions, and
-- always writes an audit_logs entry - a prior version is never lost or
-- silently overwritten.
create or replace function public.update_legal_text_document(
  p_document_key text,
  p_content text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_profile public.profiles%rowtype;
  existing public.legal_text_documents%rowtype;
  actor_label text;
  trimmed_content text;
  next_version integer;
begin
  select * into acting_profile
  from public.profiles
  where id = auth.uid() and member_status = 'active';
  if not found then
    raise exception 'Only an active platform member may update legal text' using errcode = '42501';
  end if;
  if acting_profile.role not in ('platform_admin', 'compliance_admin') then
    raise exception 'Only a platform or compliance administrator may update legal text' using errcode = '42501';
  end if;

  select * into existing from public.legal_text_documents where document_key = p_document_key;
  if not found then
    raise exception 'Legal text document key is not recognised' using errcode = '22023';
  end if;

  trimmed_content := trim(p_content);
  if trimmed_content = '' then
    raise exception 'Document content must not be empty' using errcode = '22023';
  end if;

  actor_label := coalesce(auth.jwt() ->> 'email', 'dashboard_user');
  next_version := existing.version + 1;

  update public.legal_text_documents set
    content = trimmed_content,
    version = next_version,
    updated_by = actor_label,
    updated_at = now()
  where document_key = p_document_key;

  insert into public.legal_text_document_versions (document_key, version, content, updated_by)
  values (p_document_key, next_version, trimmed_content, actor_label);

  -- audit_logs.entity_id is uuid not null, and a document_key
  -- ('privacy_notice' etc.) is not one - mint a fresh id for this audit
  -- entry's own identity instead (same reasoning as a lead's own
  -- generated id becoming its audit entity_id; this entry has none of
  -- its own to reuse) and keep the actual document key readable in
  -- details, which is what the Audit Log Viewer renders.
  insert into public.audit_logs (actor_id, entity_type, entity_id, action, actor_label, details)
  values (
    auth.uid(), 'legal_text', gen_random_uuid(), 'legal_text_document_updated', actor_label,
    jsonb_build_object('documentKey', p_document_key, 'version', next_version)
  );

  return jsonb_build_object(
    'documentKey', p_document_key,
    'title', existing.title,
    'content', trimmed_content,
    'version', next_version,
    'updatedBy', actor_label,
    'updatedAt', now()
  );
end;
$$;

revoke all on function public.update_legal_text_document(text, text) from public, anon, authenticated;
grant execute on function public.update_legal_text_document(text, text) to authenticated;
