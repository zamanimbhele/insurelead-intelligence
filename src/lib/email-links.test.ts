import { describe, expect, it } from "vitest";
import { emailLinkDestination, emailLinkFailure, isEmailLinkType } from "./email-links";

describe("email links", () => {
  it("accepts only Supabase's link types", () => {
    expect(isEmailLinkType("signup")).toBe(true);
    expect(isEmailLinkType("recovery")).toBe(true);
    expect(isEmailLinkType("magic")).toBe(false);
    expect(isEmailLinkType(null)).toBe(false);
  });

  it("sends each kind to the right place", () => {
    expect(emailLinkDestination("signup")).toBe("/login?message=email_confirmed");
    expect(emailLinkDestination("recovery")).toBe("/reset-password");
    expect(emailLinkDestination("invite")).toBe("/reset-password?flow=invite");
    expect(emailLinkFailure("signup")).toBe("/login?error=confirmation_failed");
    expect(emailLinkFailure("recovery")).toBe("/forgot-password?error=link_expired");
  });
});
