import { afterEach, describe, expect, it, vi } from "vitest";
import { getDataMode } from "./config";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getDataMode", () => {
  it("defaults to demo outside production", () => {
    vi.stubEnv("INSURELEAD_DATA_MODE", "");
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(getDataMode()).toBe("demo");
  });

  it("refuses to fall into demo mode in production when the mode is not set", () => {
    vi.stubEnv("INSURELEAD_DATA_MODE", "");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(() => getDataMode()).toThrow("must be set in production");
  });

  it("uses the mode production asks for", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("INSURELEAD_DATA_MODE", "supabase");
    expect(getDataMode()).toBe("supabase");
    vi.stubEnv("INSURELEAD_DATA_MODE", "demo");
    expect(getDataMode()).toBe("demo");
  });
});
