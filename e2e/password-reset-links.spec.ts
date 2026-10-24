import { expect, test } from "@playwright/test";

// Supabase's default reset email ("{{ .ConfirmationURL }}") can land on
// the home page carrying ?code= or an error. The proxy hands those to
// /auth/confirm instead of silently showing the marketing page.
test.describe("Password reset links", () => {
  test("a reset link that lands on the home page is forwarded to /auth/confirm", async ({ page }) => {
    await page.goto("/?code=not-a-real-code");
    await expect(page).not.toHaveURL(/127\.0\.0\.1:\d+\/\?code=/);
    // Demo mode has no Supabase session to exchange, so the code is refused.
    await expect(page).toHaveURL(/\/(login\?error=confirmation_failed|forgot-password\?error=link_expired)/);
  });

  test("an expired reset link lands on the request-a-new-link page", async ({ page }) => {
    await page.goto("/?error=access_denied&error_code=otp_expired");
    await expect(page).toHaveURL(/\/forgot-password\?error=link_expired/);
    await expect(page.getByText("That link is invalid or has expired")).toBeVisible();
  });

  test("the home page itself is unaffected", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);
  });

  test("admins who forgot their password return to the admin sign-in", async ({ page }) => {
    await page.goto("/admin/login");
    await page.goto("/forgot-password?portal=admin");
    await expect(page.getByRole("link", { name: "Back to sign in" })).toHaveAttribute("href", "/admin/login");
  });
});
