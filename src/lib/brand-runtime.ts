// Server side: works out each broker's required representative disclosure
// from the live legal text, so generation and every campaign check use
// the same wording.
import { LEGAL_TEXT_DOCUMENT_DEFINITIONS } from "./constants.ts";
import { getRuntimeLegalTextDocument } from "./runtime-data.ts";
import { isPlaceholderWording, renderDisclosure } from "./brand.ts";
import type { Buyer } from "./types.ts";

const FALLBACK_TEMPLATE = LEGAL_TEXT_DOCUMENT_DEFINITIONS.find((item) => item.key === "representative_disclosure")?.defaultContent ?? "";

export async function getDisclosureTemplate(): Promise<string> {
  try {
    return (await getRuntimeLegalTextDocument("representative_disclosure")).content;
  } catch {
    return FALLBACK_TEMPLATE;
  }
}

export async function withRequiredDisclosure<T extends Buyer | undefined>(buyer: T): Promise<T> {
  if (!buyer || buyer.brand?.mode !== "personal") return buyer;
  const template = await getDisclosureTemplate();
  return {
    ...buyer,
    requiredDisclosure: renderDisclosure(template, buyer.brand),
    disclosureIsPlaceholder: isPlaceholderWording(template),
  };
}

export async function withRequiredDisclosures(buyers: Buyer[]): Promise<Buyer[]> {
  if (!buyers.some((buyer) => buyer.brand?.mode === "personal")) return buyers;
  const template = await getDisclosureTemplate();
  const placeholder = isPlaceholderWording(template);
  return buyers.map((buyer) => buyer.brand?.mode === "personal"
    ? { ...buyer, requiredDisclosure: renderDisclosure(template, buyer.brand), disclosureIsPlaceholder: placeholder }
    : buyer);
}
