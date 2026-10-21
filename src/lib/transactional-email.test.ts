import { afterEach, describe, expect, it } from "vitest";
import { getTransactionalEmailStatus } from "./transactional-email";

const saved = { key: process.env.RESEND_API_KEY, from: process.env.NOTIFICATION_EMAIL_FROM };
afterEach(() => {
  for (const [name, value] of [["RESEND_API_KEY", saved.key], ["NOTIFICATION_EMAIL_FROM", saved.from]] as const) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("getTransactionalEmailStatus", () => {
  it("names the missing setting", () => {
    delete process.env.RESEND_API_KEY;
    process.env.NOTIFICATION_EMAIL_FROM = "InsureLead <notifications@insurelead.online>";
    expect(getTransactionalEmailStatus()).toBe("missing-api-key");
    process.env.RESEND_API_KEY = "re_test";
    process.env.NOTIFICATION_EMAIL_FROM = "   ";
    expect(getTransactionalEmailStatus()).toBe("missing-from");
  });

  it("is configured when both are set", () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.NOTIFICATION_EMAIL_FROM = "InsureLead <notifications@insurelead.online>";
    expect(getTransactionalEmailStatus()).toBe("configured");
  });
});
