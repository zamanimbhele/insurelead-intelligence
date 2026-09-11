import { test, expect } from "@playwright/test";

test("health endpoint reports demo mode as operational but not public-ready", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);

  const body = await response.json();
  expect(body).toMatchObject({
    status: "degraded",
    mode: "demo",
    readyForPublicTraffic: false,
    checks: {
      dataStore: "ok",
      durableRateLimit: "demo-only",
      captcha: "disabled",
      notifications: "disabled",
      campaignDelivery: "disabled",
    },
  });
});
