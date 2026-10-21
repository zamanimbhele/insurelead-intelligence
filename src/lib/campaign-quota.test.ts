import { describe, expect, it } from "vitest";
import {
  batchAllowance,
  configuredMaximumBatchSize,
  formatSast,
  parseSastLocalDateTime,
  quotaStatus,
  sastDateKey,
  sastPeriodStarts,
  validateScheduleTime,
} from "./campaign-quota";

describe("SAST period boundaries", () => {
  it("starts the day and month at 00:00 SAST (22:00 UTC the previous day)", () => {
    const { dayStart, monthStart } = sastPeriodStarts(new Date("2026-10-21T14:00:00Z"));
    expect(dayStart.toISOString()).toBe("2026-10-20T22:00:00.000Z");
    expect(monthStart.toISOString()).toBe("2026-09-30T22:00:00.000Z");
  });

  it("treats 23:30 UTC as the next SAST day", () => {
    const { dayStart } = sastPeriodStarts(new Date("2026-10-21T23:30:00Z"));
    expect(dayStart.toISOString()).toBe("2026-10-21T22:00:00.000Z");
    expect(sastDateKey(new Date("2026-10-21T23:30:00Z"))).toBe("2026-10-22");
  });

  it("rolls into a new SAST month and year correctly", () => {
    const { dayStart, monthStart } = sastPeriodStarts(new Date("2026-12-31T22:30:00Z"));
    expect(dayStart.toISOString()).toBe("2026-12-31T22:00:00.000Z");
    expect(monthStart.toISOString()).toBe("2026-12-31T22:00:00.000Z");
  });
});

describe("quota status", () => {
  it("reports the tighter of the daily and monthly remaining counts", () => {
    const status = quotaStatus({ dailyLimit: 200, monthlyLimit: 3000 }, { sentToday: 150, sentThisMonth: 2980 });
    expect(status.remainingToday).toBe(50);
    expect(status.remainingThisMonth).toBe(20);
    expect(status.remaining).toBe(20);
    expect(status.exhaustedBy).toBeUndefined();
  });

  it("names the exhausted window, preferring monthly when both are spent", () => {
    expect(quotaStatus({ dailyLimit: 10, monthlyLimit: 100 }, { sentToday: 10, sentThisMonth: 40 }).exhaustedBy).toBe("daily");
    expect(quotaStatus({ dailyLimit: 10, monthlyLimit: 100 }, { sentToday: 10, sentThisMonth: 100 }).exhaustedBy).toBe("monthly");
  });

  it("never reports negative remaining after a limit is lowered below usage", () => {
    const status = quotaStatus({ dailyLimit: 5, monthlyLimit: 50 }, { sentToday: 9, sentThisMonth: 60 });
    expect(status.remainingToday).toBe(0);
    expect(status.remaining).toBe(0);
  });
});

describe("batch allowance", () => {
  it("is capped by request, deployment maximum and quota", () => {
    expect(batchAllowance({ requested: 25, configuredMaximum: 100, quotaRemaining: 7 })).toBe(7);
    expect(batchAllowance({ requested: 25, configuredMaximum: 10, quotaRemaining: 70 })).toBe(10);
    expect(batchAllowance({ requested: 3, configuredMaximum: 10, quotaRemaining: 70 })).toBe(3);
    expect(batchAllowance({ requested: 25, configuredMaximum: 10, quotaRemaining: 0 })).toBe(0);
  });

  it("parses CAMPAIGN_MAX_BATCH_SIZE defensively", () => {
    expect(configuredMaximumBatchSize(undefined)).toBe(25);
    expect(configuredMaximumBatchSize("40")).toBe(40);
    expect(configuredMaximumBatchSize("500")).toBe(100);
    expect(configuredMaximumBatchSize("0")).toBe(25);
    expect(configuredMaximumBatchSize("abc")).toBe(25);
  });
});

describe("schedule input", () => {
  it("interprets datetime-local values as SAST", () => {
    expect(parseSastLocalDateTime("2026-11-02T08:30")?.toISOString()).toBe("2026-11-02T06:30:00.000Z");
    expect(formatSast("2026-11-02T06:30:00.000Z")).toBe("2026-11-02 08:30 SAST");
  });

  it("rejects malformed and impossible dates", () => {
    expect(parseSastLocalDateTime("2026-02-31T08:00")).toBeNull();
    expect(parseSastLocalDateTime("tomorrow")).toBeNull();
  });

  it("allows now to 90 days ahead only", () => {
    const now = new Date("2026-10-21T12:00:00Z");
    expect(validateScheduleTime(new Date("2026-10-21T12:00:30Z"), now)).toBeNull();
    expect(validateScheduleTime(new Date("2026-10-21T11:58:00Z"), now)).toMatch(/past/);
    expect(validateScheduleTime(new Date("2027-01-20T12:00:00Z"), now)).toMatch(/90 days/);
  });
});
