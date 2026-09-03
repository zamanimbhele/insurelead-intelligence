import Link from "next/link";
import { LayoutDashboard, Users, BarChart3, ShieldCheck, ArrowLeft, Store } from "lucide-react";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/leads", label: "Leads", icon: Users },
  { href: "/dashboard/marketplace", label: "Lead Marketplace", icon: Store },
  { href: "/dashboard/market-intelligence", label: "Market Intelligence", icon: BarChart3 },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="hidden w-64 flex-shrink-0 border-r border-slate-200 bg-white lg:flex lg:flex-col">
        <div className="flex items-center gap-2 border-b border-slate-200 px-6 py-5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600 text-white">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <span className="text-sm font-semibold text-slate-900">InsureLead Intelligence</span>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-primary-50 hover:text-primary-700"
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-slate-200 p-4">
          <Link href="/" className="flex items-center gap-2 text-xs font-medium text-slate-500 hover:text-primary-700">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to public site
          </Link>
          <p className="mt-3 text-xs text-slate-400">
            Demo session - Broker Manager role<br />Synthetic data only
          </p>
        </div>
      </aside>
      <div className="flex-1">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4 lg:hidden">
          <span className="text-sm font-semibold text-slate-900">InsureLead Intelligence</span>
          <Link href="/" className="text-xs font-medium text-primary-700">Exit</Link>
        </header>
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{children}</div>
      </div>
    </div>
  );
}
