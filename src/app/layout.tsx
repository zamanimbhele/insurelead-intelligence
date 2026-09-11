import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "InsureLead Intelligence | Insurance Lead & Broker Platform",
  description:
    "Explore personal and business insurance products through a consent-aware, multi-broker lead intelligence platform.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-ZA" data-scroll-behavior="smooth">
      <body className="min-h-screen bg-white text-slate-800 antialiased">{children}</body>
    </html>
  );
}
