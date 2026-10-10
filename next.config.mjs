/** @type {import('next').NextConfig} */
const securityHeaders = [
  // Brief section 11: "Security headers." These are conservative, broadly
  // safe defaults for a server-rendered Next.js app with no iframe embedding
  // use case; they do not include a Content-Security-Policy because a safe
  // CSP has to enumerate every script/style/connect origin this app and its
  // dependencies (Supabase, Turnstile, Resend-sent email links, etc.) use,
  // which needs verifying against the real deployment rather than guessing
  // here - see the Security Review Checklist (SECURITY_REVIEW_CHECKLIST.md)
  // for that as a tracked follow-up rather than a silently incomplete policy.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};
export default nextConfig;
