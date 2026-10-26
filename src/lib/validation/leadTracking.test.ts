import { describe, expect, it } from "vitest";
import { parseLeadTracking } from "./leadTracking";

describe("parseLeadTracking", () => {
  it("keeps known UTM tags and http(s) URLs", () => {
    expect(parseLeadTracking({
      utm: { source: "google", medium: "cpc", campaign: "fye", term: "cover", content: "ad-1" },
      referrer: "https://www.google.com/",
      sourceUrl: "https://insurelead.online/consultation",
    })).toEqual({
      utm: { source: "google", medium: "cpc", campaign: "fye", term: "cover", content: "ad-1" },
      referrer: "https://www.google.com/",
      sourceUrl: "https://insurelead.online/consultation",
    });
  });

  it("drops unknown keys, non-strings, oversized values and unsafe URLs", () => {
    expect(parseLeadTracking({
      utm: { source: { nested: true }, medium: "x".repeat(201), campaign: "  ", injected: "yes" },
      referrer: "javascript:alert(1)",
      sourceUrl: `https://example.co.za/${"a".repeat(2100)}`,
    })).toEqual({ utm: {}, referrer: undefined, sourceUrl: undefined });
  });

  it("copes with a missing or malformed body", () => {
    expect(parseLeadTracking(null)).toEqual({ utm: {}, referrer: undefined, sourceUrl: undefined });
    expect(parseLeadTracking({ utm: ["source"] })).toEqual({ utm: {}, referrer: undefined, sourceUrl: undefined });
  });
});
