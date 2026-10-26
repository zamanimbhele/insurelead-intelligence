import { describe, expect, it } from "vitest";
import { guardPublicForm } from "./public-forms";

function deps(options: { blockedKeys?: string[]; captcha?: boolean } = {}) {
  const calls: string[] = [];
  return {
    calls,
    deps: {
      checkRateLimit: async (key: string) => { calls.push(key); return { allowed: !(options.blockedKeys ?? []).some((prefix) => key.startsWith(prefix)) }; },
      verifyCaptcha: async (_token: string | undefined, _ip: string, action: string) => { calls.push(`captcha:${action}`); return options.captcha ?? true; },
    },
  };
}

const headers = new Headers({ "x-forwarded-for": "203.0.113.5" });
const base = { headers, email: "Someone@Example.com", honeypot: "", captchaToken: "token" };

describe("public form guard", () => {
  it("passes a normal sign-up, checking IP, email and captcha", async () => {
    const { deps: d, calls } = deps();
    expect(await guardPublicForm({ ...base, kind: "signup" }, d)).toBe("ok");
    expect(calls).toEqual(["signup-ip:203.0.113.5", "signup-email:someone@example.com", "captcha:account_signup"]);
  });

  it("stops a bot that fills the hidden field, without touching anything else", async () => {
    const { deps: d, calls } = deps();
    expect(await guardPublicForm({ ...base, kind: "signup", honeypot: "https://spam.example" }, d)).toBe("honeypot");
    expect(calls).toEqual([]);
  });

  it("rate-limits by IP and by email address", async () => {
    expect(await guardPublicForm({ ...base, kind: "password_reset" }, deps({ blockedKeys: ["password_reset-ip:"] }).deps)).toBe("rate_limited");
    expect(await guardPublicForm({ ...base, kind: "password_reset" }, deps({ blockedKeys: ["password_reset-email:"] }).deps)).toBe("rate_limited");
  });

  it("fails when the captcha does not verify, using the form's own action", async () => {
    const { deps: d, calls } = deps({ captcha: false });
    expect(await guardPublicForm({ ...base, kind: "password_reset" }, d)).toBe("captcha_failed");
    expect(calls).toContain("captcha:password_reset");
  });
});
