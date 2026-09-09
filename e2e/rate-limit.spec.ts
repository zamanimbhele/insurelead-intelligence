import { test, expect } from "@playwright/test";

test("public lead endpoint rate limits repeated malformed submissions", async ({ request }) => {
  const headers = {
    "content-type": "application/json",
    "x-forwarded-for": "203.0.113.50",
  };

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await request.post("/api/leads", { headers, data: {} });
    expect(response.status()).toBe(400);
  }

  const limitedResponse = await request.post("/api/leads", { headers, data: {} });
  expect(limitedResponse.status()).toBe(429);
  expect(limitedResponse.headers()["retry-after"]).toBe("60");
});
