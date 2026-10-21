import { afterEach, describe, expect, it } from "vitest";
import { checkCronRequest } from "./cron-auth";

const original = process.env.CRON_SECRET;
afterEach(() => {
  if (original === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = original;
});

describe("checkCronRequest", () => {
  it("refuses to run when no secret is configured", () => {
    delete process.env.CRON_SECRET;
    expect(checkCronRequest("Bearer anything")).toMatchObject({ ok: false, status: 503 });
  });

  it("refuses a secret shorter than 16 characters", () => {
    process.env.CRON_SECRET = "short";
    expect(checkCronRequest("Bearer short")).toMatchObject({ ok: false, status: 503 });
  });

  it("accepts only the exact bearer token", () => {
    process.env.CRON_SECRET = "a".repeat(32);
    expect(checkCronRequest(`Bearer ${"a".repeat(32)}`)).toEqual({ ok: true });
    expect(checkCronRequest(`Bearer ${"a".repeat(31)}b`)).toMatchObject({ ok: false, status: 401 });
    expect(checkCronRequest("a".repeat(32))).toMatchObject({ ok: false, status: 401 });
    expect(checkCronRequest(null)).toMatchObject({ ok: false, status: 401 });
  });
});
