-- Replace every REPLACE_* value. Run once per approved broker or insurer.
do $$
declare
  buyer_name text := 'REPLACE_WITH_BUYER_NAME';
  buyer_email text := 'REPLACE_WITH_BUYER_CONTACT_EMAIL';
  buyer_kind public.organisation_type := 'broker'; -- broker or insurer
  buyer_id uuid;
begin
  if buyer_name like 'REPLACE_%' or buyer_email like 'REPLACE_%' then
    raise exception 'Replace the buyer placeholders before running this script';
  end if;

  insert into public.organisations (
    name, organisation_type, status, contact_email, fsp_number
  ) values (
    buyer_name, buyer_kind, 'active', buyer_email, null
  ) returning id into buyer_id;

  insert into public.buyer_preferences (
    organisation_id, provinces, industries, minimum_score, accepts_shared_leads
  ) values (
    buyer_id,
    array['Gauteng'],
    array['Construction and Contracting', 'Transport and Logistics'],
    35,
    false
  );
end;
$$;
