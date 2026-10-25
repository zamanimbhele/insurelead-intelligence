# Product catalogue

Which products InsureLead offers is data in Supabase, not code. Adding, hiding or
renaming a product needs no deployment; pages pick up the change within about a minute.

## Tables

| Table | What it holds |
| --- | --- |
| `product_categories` | The regulated families: short-term insurance, life and funeral cover, investments, medical aid, banking and credit. Each names the authorisation needed to sell it (`required_authorisation`), enforced from phase 3. |
| `insurance_products` | Each product: id, name, description, applicant types (`individual`, `business`), category and status. |

Both have a `status`:

| Status | Meaning |
| --- | --- |
| `active` | Offered: on the public site, lead form, broker appetite and campaigns. |
| `hidden` | Prepared but not offered yet. Nobody can choose it. |
| `retired` | No longer offered. Existing leads and campaigns keep their product name. |

A product is offered only when **both** it and its category are `active`. The database
enforces the order: switch a category on before its products, and its products off before
the category.

`insurance_products.active` still exists for older checks, but it is generated from
`status`: change `status`, never `active`.

## Common changes (Supabase SQL editor)

Switch a prepared category and its products on (phase 7, after the pilot):

```sql
update public.product_categories set status = 'active', updated_at = now() where id = 'medical_schemes';
update public.insurance_products set status = 'active', updated_at = now() where category_id = 'medical_schemes';
```

Stop offering a product (existing leads keep it):

```sql
update public.insurance_products set status = 'retired', updated_at = now() where id = 'travel_insurance';
```

Add a product (starts hidden):

```sql
insert into public.insurance_products (id, name, description, applicant_types, category_id, status, display_order)
values ('disability_cover', 'Disability Cover', 'Income protection if you cannot work.', array['individual'], 'long_term_insurance', 'hidden', 45);
```

Ids are permanent: lowercase letters, digits and underscores, starting with a letter.
Never rename or delete an id that leads, appetite or campaigns already use; retire it instead.

## Where it is enforced

- **Database:** a lead can only be submitted for an active product that matches the
  applicant type (`capture_public_lead()`), and broker appetite can only include active
  products (`update_buyer_preferences()`).
- **API:** the lead, campaign and appetite routes validate against the catalogue first,
  so people get a clear message.
- **Fallback:** `src/lib/products.ts` holds a copy of the seeded catalogue for demo mode
  and for the rare case the table cannot be read. `src/lib/product-catalogue.test.ts`
  loads the real migrations into an in-memory Postgres and fails if the two differ.
  Products you add later in the database don't need to be copied there.
