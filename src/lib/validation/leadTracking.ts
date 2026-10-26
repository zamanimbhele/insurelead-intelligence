// Marketing attribution sent with a public lead (UTM tags, referrer, the
// page the form was on). The public form fills these in from the URL, so
// anyone can send anything: only known UTM keys are kept, each value is a
// bounded string, and URLs must be http(s). Anything else is dropped
// rather than rejecting the enquiry, because attribution is optional.
import { z } from "zod";

const UTM_KEYS = ["source", "medium", "campaign", "term", "content"] as const;
const MAX_UTM_LENGTH = 200;
const MAX_URL_LENGTH = 2048;

export type LeadTracking = {
  utm: Partial<Record<(typeof UTM_KEYS)[number], string>>;
  referrer?: string;
  sourceUrl?: string;
};

const textValue = z.string().trim().min(1).max(MAX_UTM_LENGTH);

function safeUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > MAX_URL_LENGTH) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function parseLeadTracking(body: unknown): LeadTracking {
  const source = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const rawUtm = source.utm && typeof source.utm === "object" && !Array.isArray(source.utm)
    ? (source.utm as Record<string, unknown>)
    : {};
  const utm: LeadTracking["utm"] = {};
  for (const key of UTM_KEYS) {
    const parsed = textValue.safeParse(rawUtm[key]);
    if (parsed.success) utm[key] = parsed.data;
  }
  return { utm, referrer: safeUrl(source.referrer), sourceUrl: safeUrl(source.sourceUrl) };
}
