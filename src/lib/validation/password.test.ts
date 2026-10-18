import { describe, expect, it } from "vitest";
import { firstPasswordError } from "./password";

describe("password policy", () => {
  it("accepts a long mixed password that matches its confirmation", () => {
    expect(firstPasswordError({ password: "Harbour-lights-2026", confirmPassword: "Harbour-lights-2026" })).toBeNull();
  });

  it("rejects a password shorter than 12 characters", () => {
    expect(firstPasswordError({ password: "Short-1", confirmPassword: "Short-1" })).toMatch(/at least 12/);
  });

  it("rejects letters-only and digits-only passwords", () => {
    expect(firstPasswordError({ password: "onlylettershere", confirmPassword: "onlylettershere" })).toMatch(/number or symbol/);
    expect(firstPasswordError({ password: "123456789012345", confirmPassword: "123456789012345" })).toMatch(/number or symbol/);
  });

  it("rejects a highly repetitive password", () => {
    expect(firstPasswordError({ password: "aaaaaa111111", confirmPassword: "aaaaaa111111" })).toMatch(/repetitive/);
  });

  it("rejects a confirmation that does not match", () => {
    expect(firstPasswordError({ password: "Harbour-lights-2026", confirmPassword: "Harbour-lights-2025" })).toMatch(/do not match/);
  });
});
