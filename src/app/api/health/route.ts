import { NextResponse } from "next/server";
import { checkRuntimeDataHealth, checkRuntimeRateLimitHealth } from "@/lib/runtime-data";
import { getCaptchaStatus } from "@/lib/security/captcha";
import { getRateLimitStatus } from "@/lib/security/rate-limit";
import { getDataMode } from "@/lib/supabase/config";
import { getLeadNotificationStatus } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export async function GET() {
  let mode: "demo" | "supabase";
  try {
    mode = getDataMode();
  } catch {
    return NextResponse.json(
      { status: "unavailable", readyForPublicTraffic: false },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const rateLimitConfig = getRateLimitStatus();
  const [dataStoreHealthy, rateLimitStoreHealthy, captcha, notifications] = await Promise.all([
    checkRuntimeDataHealth(),
    checkRuntimeRateLimitHealth(),
    Promise.resolve(getCaptchaStatus()),
    Promise.resolve(getLeadNotificationStatus()),
  ]);
  const rateLimit = mode === "demo"
    ? "demo-only"
    : rateLimitConfig !== "configured"
      ? "missing"
      : rateLimitStoreHealthy ? "configured" : "unavailable";
  const readyForPublicTraffic = mode === "supabase"
    && dataStoreHealthy
    && rateLimit === "configured"
    && captcha === "configured"
    && notifications === "configured";
  const status = !dataStoreHealthy ? "unavailable" : readyForPublicTraffic ? "ok" : "degraded";

  return NextResponse.json(
    {
      status,
      mode,
      readyForPublicTraffic,
      checks: {
        dataStore: dataStoreHealthy ? "ok" : "unavailable",
        durableRateLimit: rateLimit,
        captcha,
        notifications,
      },
    },
    {
      status: dataStoreHealthy ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
