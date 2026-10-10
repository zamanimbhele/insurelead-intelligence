"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";

// Below the `lg` breakpoint the dashboard's sidebar (`<aside>` in
// DashboardLayout) is hidden entirely, so without this the mobile header row
// gave no way to reach any dashboard navigation link at all - a real gap
// given the brief's own "Mobile-first responsive design" requirement, not
// just a labeling nicety. This client component owns both the mobile header
// row and the drawer beneath it as siblings (not nested inside the header's
// flex row), so the open drawer lays out as a full-width panel rather than
// being squeezed next to the toggle button. The nav links themselves are
// rendered server-side in the layout and passed in as `children` so icon
// components never need to cross the server/client boundary as props.
export function DashboardMobileNav({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="lg:hidden">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
        <span className="text-sm font-semibold text-slate-900">InsureLead Intelligence</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-label="Toggle dashboard navigation menu"
            aria-expanded={open}
            aria-controls="dashboard-mobile-nav"
            className="rounded-md p-2 text-slate-600 hover:bg-slate-100"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <Link href="/" className="text-xs font-medium text-primary-700">Exit</Link>
        </div>
      </header>
      <div id="dashboard-mobile-nav" className={open ? "block border-b border-slate-200 bg-white" : "hidden"}>
        <nav aria-label="Dashboard" className="flex flex-col gap-1 px-4 py-3">
          {children}
        </nav>
      </div>
    </div>
  );
}
