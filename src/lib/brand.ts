// Personal brand and representative disclosure (individual advisors plan,
// phase 4). Pure helpers, safe for client components.
export type BrandMode = "company" | "personal";
export type DisclosureCapacity = "representative" | "key_individual";

export type OrganisationBrand = {
  mode: BrandMode;
  displayName?: string;
  capacity?: DisclosureCapacity;
  fspName?: string;
  fspNumber?: string;
};

export const COMPANY_BRAND: OrganisationBrand = { mode: "company" };

export const CAPACITY_OPTIONS: { value: DisclosureCapacity; label: string; wording: string }[] = [
  { value: "representative", label: "Representative of an FSP", wording: "representative" },
  { value: "key_individual", label: "Key individual of an FSP", wording: "key individual" },
];

export function normaliseBrand(row: {
  brand_mode?: string | null; disclosure_name?: string | null; disclosure_capacity?: string | null;
  disclosure_fsp_name?: string | null; disclosure_fsp_number?: string | null;
} | null | undefined): OrganisationBrand {
  if (!row) return COMPANY_BRAND;
  const capacity = CAPACITY_OPTIONS.some((option) => option.value === row.disclosure_capacity)
    ? (row.disclosure_capacity as DisclosureCapacity)
    : undefined;
  return {
    mode: row.brand_mode === "personal" ? "personal" : "company",
    displayName: row.disclosure_name ?? undefined,
    capacity,
    fspName: row.disclosure_fsp_name ?? undefined,
    fspNumber: row.disclosure_fsp_number ?? undefined,
  };
}

// The details a personal brand still needs (empty = complete).
export function missingDisclosureDetails(brand: OrganisationBrand): string[] {
  const missing: string[] = [];
  if (!brand.displayName?.trim()) missing.push("your name");
  if (!brand.capacity) missing.push("your capacity");
  if (!brand.fspName?.trim()) missing.push("the FSP name");
  if (!brand.fspNumber?.trim()) missing.push("the FSP number");
  return missing;
}

// A paragraph starting "PLACEHOLDER" in the legal text is a note for
// admins: it marks the wording as unconfirmed and never goes into email.
const PLACEHOLDER_NOTE = /^\s*PLACEHOLDER\b/i;

export function isPlaceholderWording(template: string): boolean {
  return template.split(/\n\s*\n/).some((paragraph) => PLACEHOLDER_NOTE.test(paragraph));
}

// Fills in the representative disclosure. Returns undefined while details
// are missing. Whitespace is normalised so the text can be found in
// generated content reliably.
export function renderDisclosure(template: string, brand: OrganisationBrand): string | undefined {
  if (missingDisclosureDetails(brand).length) return undefined;
  const capacity = CAPACITY_OPTIONS.find((option) => option.value === brand.capacity)?.wording ?? "";
  const values: Record<string, string> = {
    advisor_name: brand.displayName!.trim(),
    capacity,
    fsp_name: brand.fspName!.trim(),
    fsp_number: brand.fspNumber!.trim(),
  };
  return template
    .split(/\n\s*\n/)
    .filter((paragraph) => !PLACEHOLDER_NOTE.test(paragraph))
    .map((paragraph) => paragraph.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => values[key] ?? match))
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" ");
}

// Who a campaign is "from" in its wording.
export function campaignSenderName(organisationName: string, brand: OrganisationBrand | undefined): string {
  return brand?.mode === "personal" && brand.displayName?.trim() ? brand.displayName.trim() : organisationName;
}

// Generation input for a broker's brand: a personal brand signs with the
// advisor's name and must carry its representative disclosure.
export function brandedCopyInput<T extends object>(
  buyer: { organisationName: string; brand?: OrganisationBrand; requiredDisclosure?: string },
  input: T,
) {
  if (buyer.brand?.mode === "personal" && !buyer.requiredDisclosure) {
    const missing = missingDisclosureDetails(buyer.brand);
    throw new Error(`Add ${missing.join(", ") || "your branding details"} under branding before generating content`);
  }
  return {
    ...input,
    brokerName: campaignSenderName(buyer.organisationName, buyer.brand),
    disclosure: buyer.brand?.mode === "personal" ? buyer.requiredDisclosure : undefined,
  };
}
