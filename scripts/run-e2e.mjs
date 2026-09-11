import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const playwrightCli = require.resolve("@playwright/test/cli");

const child = spawn(process.execPath, [playwrightCli, "test", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: {
    ...process.env,
    INSURELEAD_DATA_MODE: "demo",
    INSURELEAD_CAPTCHA_MODE: "off",
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: "",
    TURNSTILE_SECRET_KEY: "",
    LEAD_NOTIFICATION_WEBHOOK_URL: "",
    LEAD_NOTIFICATION_WEBHOOK_TOKEN: "",
    INSURELEAD_CAMPAIGN_DELIVERY_MODE: "disabled",
    RESEND_API_KEY: "",
    CAMPAIGN_UNSUBSCRIBE_SECRET: "",
  },
});

child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
