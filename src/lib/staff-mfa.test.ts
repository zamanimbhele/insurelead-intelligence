import { describe, expect, it } from "vitest";
import { beginEnrolment, isMfaCode, isQrCodeDataUrl, staffNeedsMfa, verifiedTotpFactor, verifyCode, type MfaAuth } from "./staff-mfa";

type Factor = { id: string; factor_type: string; status: string };

function fakeAuth(factors: Factor[], options: { validCode?: string } = {}) {
  const calls: string[] = [];
  const auth: MfaAuth = {
    listFactors: async () => ({ data: { all: [...factors] }, error: null }),
    enroll: async (params) => {
      calls.push(`enroll:${params.issuer}`);
      factors.push({ id: "new-factor", factor_type: "totp", status: "unverified" });
      return { data: { id: "new-factor", totp: { qr_code: "data:image/svg+xml;utf-8,<svg/>", secret: "SECRET" } }, error: null };
    },
    unenroll: async ({ factorId }) => {
      calls.push(`unenroll:${factorId}`);
      factors.splice(factors.findIndex((factor) => factor.id === factorId), 1);
      return { data: {}, error: null };
    },
    challengeAndVerify: async ({ factorId, code }) => {
      calls.push(`verify:${factorId}`);
      return code === (options.validCode ?? "123456") ? { data: {}, error: null } : { data: null, error: { message: "Invalid TOTP code" } };
    },
  };
  return { auth, calls };
}

describe("staffNeedsMfa", () => {
  it("requires a second factor for every platform staff role, and only them", () => {
    for (const role of ["platform_admin", "compliance_admin", "compliance_auditor"]) {
      expect(staffNeedsMfa(role, "aal1")).toBe(true);
      expect(staffNeedsMfa(role, null)).toBe(true);
      expect(staffNeedsMfa(role, "aal2")).toBe(false);
    }
    for (const role of ["broker_admin", "campaign_manager", "broker_agent", null]) {
      expect(staffNeedsMfa(role, "aal1")).toBe(false);
    }
  });
});

describe("input checks", () => {
  it("accepts only 6-digit codes and SVG data-URL QR codes", () => {
    expect(isMfaCode("012345")).toBe(true);
    for (const value of ["12345", "1234567", "12345a", " 123456", 123456, null]) expect(isMfaCode(value)).toBe(false);
    expect(isQrCodeDataUrl("data:image/svg+xml;utf-8,<svg/>")).toBe(true);
    expect(isQrCodeDataUrl("javascript:alert(1)")).toBe(false);
    expect(isQrCodeDataUrl("https://example.co.za/qr.png")).toBe(false);
  });
});

describe("beginEnrolment", () => {
  it("clears unfinished set-ups and enrols a new authenticator", async () => {
    const { auth, calls } = fakeAuth([{ id: "stale", factor_type: "totp", status: "unverified" }]);
    const result = await beginEnrolment(auth);
    expect(result).toEqual({ factorId: "new-factor", qrCode: "data:image/svg+xml;utf-8,<svg/>", secret: "SECRET" });
    expect(calls).toEqual(["unenroll:stale", "enroll:InsureLead"]);
  });

  it("refuses when an authenticator is already verified (a password alone cannot add one)", async () => {
    const { auth, calls } = fakeAuth([{ id: "phone", factor_type: "totp", status: "verified" }]);
    await expect(beginEnrolment(auth)).rejects.toThrow("already set up");
    expect(calls).toEqual([]);
  });
});

describe("verifyCode", () => {
  it("verifies the user's own factor and reports a first-time set-up", async () => {
    const { auth } = fakeAuth([{ id: "f1", factor_type: "totp", status: "unverified" }]);
    await expect(verifyCode(auth, { factorId: "f1", code: "123456" })).resolves.toEqual({ enrolled: true });
  });

  it("signs in with an existing factor", async () => {
    const { auth } = fakeAuth([{ id: "f1", factor_type: "totp", status: "verified" }]);
    await expect(verifyCode(auth, { factorId: "f1", code: "123456" })).resolves.toEqual({ enrolled: false });
    await expect(verifiedTotpFactor(auth)).resolves.toMatchObject({ id: "f1" });
  });

  it("refuses bad codes, malformed codes and factors that are not the user's", async () => {
    const { auth, calls } = fakeAuth([{ id: "f1", factor_type: "totp", status: "verified" }]);
    await expect(verifyCode(auth, { factorId: "f1", code: "000000" })).rejects.toThrow("did not work");
    await expect(verifyCode(auth, { factorId: "f1", code: "12ab56" })).rejects.toThrow("6-digit");
    await expect(verifyCode(auth, { factorId: "someone-else", code: "123456" })).rejects.toThrow("Start the authenticator set-up again");
    expect(calls).toEqual(["verify:f1"]);
  });
});
