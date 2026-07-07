import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "InsureLead Intelligence | Business Insurance Consultations",
  description:
    "Request a business insurance consultation. Configurable, compliant lead intelligence platform for South African business insurance brokers.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-ZA">
      <body className="min-h-screen bg-white text-slate-800 antialiased">{children}</body>
    </html>
  );
}
