import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "InsureLead Intelligence | Lead Generation for Insurance Brokers",
  description:
    "Request product-specific insurance leads, launch targeted campaigns, and manage scored, consented prospects from one broker workspace.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-ZA" data-scroll-behavior="smooth">
      <body className="min-h-screen bg-white text-slate-800 antialiased">{children}</body>
    </html>
  );
}
