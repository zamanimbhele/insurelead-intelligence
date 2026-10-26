import { describe, expect, it } from "vitest";
import { allowSignInAttempt, SIGN_IN_LIMITS } from "./sign-in-limits";

function fakeLimiter(blocked: string[] = []) {
  const calls: Array<{ key: string; limits: unknown }> = [];
  return {
    calls,
    checkRateLimit: async (key: string, limits: { windowSeconds: number; maximumRequests: number }) => {
      calls.push({ key, limits });
      return { allowed: !blocked.some((prefix) => key.startsWith(prefix)) };
    },
  };
}

const headers = new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" });

describe("allowSignInAttempt", () => {
  it("limits by the person's IP and by the email being tried (case-insensitive)", async () => {
    const limiter = fakeLimiter();
    await expect(allowSignInAttempt({ scope: "broker", headers, email: " Someone@Example.co.za " }, limiter)).resolves.toBe(true);
    expect(limiter.calls).toEqual([
      { key: "sign-in-broker-ip:203.0.113.7", limits: SIGN_IN_LIMITS.perIp },
      { key: "sign-in-email:someone@example.co.za", limits: SIGN_IN_LIMITS.perEmail },
    ]);
  });

  it("refuses when either limit is reached", async () => {
    await expect(allowSignInAttempt({ scope: "admin", headers, email: "a@example.co.za" }, fakeLimiter(["sign-in-admin-ip:"]))).resolves.toBe(false);
    await expect(allowSignInAttempt({ scope: "admin", headers, email: "a@example.co.za" }, fakeLimiter(["sign-in-email:"]))).resolves.toBe(false);
  });

  it("shares the per-email limit between the broker and admin sign-in pages", async () => {
    const broker = fakeLimiter();
    const admin = fakeLimiter();
    await allowSignInAttempt({ scope: "broker", headers, email: "a@example.co.za" }, broker);
    await allowSignInAttempt({ scope: "admin", headers, email: "a@example.co.za" }, admin);
    expect(broker.calls[1].key).toBe(admin.calls[1].key);
  });

  it("does not let attempts through when the limit store fails", async () => {
    const failing = { checkRateLimit: async () => { throw new Error("store down"); } };
    await expect(allowSignInAttempt({ scope: "broker", headers, email: "a@example.co.za" }, failing)).rejects.toThrow("store down");
  });
});
