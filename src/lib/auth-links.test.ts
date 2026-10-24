import { describe, expect, it } from "vitest";
import { appOrigin, isRecentRecovery, safeAuthNext } from "./auth-links";

describe("auth link helpers", () => {
  it("only continues to the password pages", () => {
    expect(safeAuthNext("/reset-password")).toBe("/reset-password");
    expect(safeAuthNext("/reset-password?flow=invite")).toBe("/reset-password?flow=invite");
    expect(safeAuthNext("https://evil.example")).toBeNull();
    expect(safeAuthNext("/dashboard")).toBeNull();
    expect(safeAuthNext(null)).toBeNull();
  });

  it("recognises a recovery email sent in the last hour", () => {
    const now = Date.parse("2026-10-24T10:00:00Z");
    expect(isRecentRecovery("2026-10-24T09:30:00Z", now)).toBe(true);
    expect(isRecentRecovery("2026-10-24T08:30:00Z", now)).toBe(false);
    expect(isRecentRecovery(null, now)).toBe(false);
    expect(isRecentRecovery("not a date", now)).toBe(false);
  });

  it("builds the link origin from config, else the request host", () => {
    expect(appOrigin("https://insurelead.online/", "x.vercel.app", "https")).toBe("https://insurelead.online");
    expect(appOrigin(undefined, "preview.vercel.app", "https")).toBe("https://preview.vercel.app");
    expect(appOrigin("", "127.0.0.1:3100", "http")).toBe("http://127.0.0.1:3100");
    expect(appOrigin(undefined, "bad host/<x>", "https")).toBeNull();
  });
});
