// Server-side loader for the product catalogue (see products.ts).
//
// Supabase mode reads public.insurance_products and product_categories
// with the service-role client: the catalogue is public reference data,
// and reading it whole (hidden and retired products included) lets old
// leads keep their product names. Callers decide what to offer with
// activeProducts(). The result is memoised for a minute per server
// instance, so a product switched on or off shows within a minute
// without a deploy.
import { createSupabaseAdminClient } from "./supabase/admin.ts";
import { getDataMode } from "./supabase/config.ts";
import { FALLBACK_CATALOGUE, type ProductCatalogue, type ProductStatus } from "./products.ts";
import type { ApplicantType } from "./types.ts";

const TTL_MS = 60_000;
let memo: { catalogue: ProductCatalogue; expiresAt: number } | null = null;

type CategoryRow = {
  id: string; name: string; description: string | null; required_authorisation: string;
  status: ProductStatus; display_order: number;
};
type ProductRow = {
  id: string; name: string; description: string | null; applicant_types: string[] | null;
  category_id: string; status: ProductStatus; display_order: number;
};

export function mapCatalogueRows(categories: CategoryRow[], products: ProductRow[]): ProductCatalogue {
  return {
    categories: categories.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description ?? "",
      requiredAuthorisation: row.required_authorisation,
      status: row.status,
      displayOrder: row.display_order,
    })),
    products: products.map((row) => ({
      value: row.id,
      label: row.name,
      description: row.description ?? "",
      applicantTypes: (row.applicant_types ?? []).filter((type): type is ApplicantType => type === "individual" || type === "business"),
      categoryId: row.category_id,
      status: row.status,
      displayOrder: row.display_order,
    })),
  };
}

async function readCatalogue(): Promise<ProductCatalogue> {
  const client = createSupabaseAdminClient();
  if (!client) throw new Error("The product catalogue requires the server-only Supabase secret key");
  const [categories, products] = await Promise.all([
    client.from("product_categories").select("id, name, description, required_authorisation, status, display_order"),
    client.from("insurance_products").select("id, name, description, applicant_types, category_id, status, display_order"),
  ]);
  if (categories.error) throw new Error(`Read product categories: ${categories.error.message}`);
  if (products.error) throw new Error(`Read products: ${products.error.message}`);
  if (!products.data?.length) throw new Error("The product catalogue is empty");
  return mapCatalogueRows(categories.data as CategoryRow[], products.data as ProductRow[]);
}

export async function getProductCatalogue(): Promise<ProductCatalogue> {
  if (getDataMode() === "demo") return FALLBACK_CATALOGUE;
  if (memo && memo.expiresAt > Date.now()) return memo.catalogue;
  try {
    const catalogue = await readCatalogue();
    memo = { catalogue, expiresAt: Date.now() + TTL_MS };
    return catalogue;
  } catch (error) {
    // Better a slightly stale list than a broken lead form. The database
    // still validates every submission against the real table.
    console.error("[products] catalogue unavailable, using built-in list", error instanceof Error ? error.message : error);
    return FALLBACK_CATALOGUE;
  }
}

export function clearProductCatalogueCache() {
  memo = null;
}
