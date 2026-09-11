import { defineConfig, devices } from "@playwright/test";

const e2ePort = process.env.INSURELEAD_E2E_PORT ?? "3100";
const e2eBaseUrl = `http://127.0.0.1:${e2ePort}`;

/**
 * E2E test configuration.
 *
 * Runs serially (fullyParallel: false, workers: 1) on purpose: the
 * prototype's demo data store (src/lib/demo-store.ts) is a flat JSON file on
 * disk, not a real database, so concurrent writes from parallel test workers
 * could race and clobber each other. Once the app moves to Supabase in
 * production, this can safely be switched back to parallel execution.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL: e2eBaseUrl,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: `npm run build && npm run start -- -H 127.0.0.1 -p ${e2ePort}`,
    url: e2eBaseUrl,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
