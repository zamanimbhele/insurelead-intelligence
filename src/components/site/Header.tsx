"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/solutions", label: "Business Insurance Solutions" },
  { href: "/industries", label: "Industry Solutions" },
  { href: "/about", label: "About" },
  { href: "/faq", label: "FAQs" },
  { href: "/contact", label: "Contact" },
];

export function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-600 text-white">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <span className="text-lg font-semibold tracking-tight text-slate-900">
            InsureLead <span className="text-primary-600">Intelligence</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-8 lg:flex">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="text-sm font-medium text-slate-600 hover:text-primary-700">
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <Link href="/dashboard" className="text-sm font-medium text-slate-600 hover:text-primary-700">
            Broker Login
          </Link>
          <Link
            href="/consultation"
            className="rounded-md bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700"
          >
            Request a Consultation
          </Link>
        </div>

        <button className="lg:hidden" onClick={() => setOpen((v) => !v)} aria-label="Toggle navigation menu">
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      <div className={cn("border-t border-slate-200 bg-white lg:hidden", open ? "block" : "hidden")}>
        <nav className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-3">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="rounded-md px-2 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              {link.label}
            </Link>
          ))}
          <Link href="/dashboard" className="rounded-md px-2 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Broker Login
          </Link>
          <Link href="/consultation" className="mt-2 rounded-md bg-primary-600 px-4 py-2 text-center text-sm font-semibold text-white">
            Request a Consultation
          </Link>
        </nav>
      </div>
    </header>
  );
}
