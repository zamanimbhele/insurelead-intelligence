import Link from "next/link";
import { redirect } from "next/navigation";
import { LayoutDashboard, Users, BarChart3, ShieldCheck, ArrowLeft, Store, LogOut, Building2, ClipboardList, Settings, Megaphone, Database, History, FileText, Wrench } from "lucide-react";
import { canViewCompliance, getDashboardIdentity, isBrokerUser, isComplianceAuditor, isPlatformAdmin } from "@/lib/auth";
import { signOut } from "@/app/(auth)/login/actions";
import { DemoRoleSwitcher } from "@/components/dashboard/DemoRoleSwitcher";
import { DashboardMobileNav } from "@/components/dashboard/DashboardMobileNav";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const identity = await getDashboardIdentity();
  if (!identity.authenticated) redirect("/login");
  if (!identity.accessAllowed) redirect("/access-denied");

  const nav = [
    { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
    { href: "/dashboard/leads", label: "Leads", icon: Users },
    ...(isPlatformAdmin(identity)
      ? [{ href: "/dashboard/marketplace", label: "Lead Marketplace", icon: Store }]
      : []),
    ...(isPlatformAdmin(identity) || isComplianceAuditor(identity)
      ? [{ href: "/dashboard/brokers", label: "Broker Directory", icon: Building2 }]
      : []),
    { href: "/dashboard/allocations", label: "Allocations", icon: ClipboardList },
    { href: "/dashboard/campaigns", label: "Campaigns", icon: Megaphone },
    ...(isBrokerUser(identity)
      ? [{ href: "/dashboard/broker-profile", label: "Broker Profile", icon: Settings }]
      : []),
    { href: "/dashboard/market-intelligence", label: "Market Intelligence", icon: BarChart3 },
    ...(canViewCompliance(identity)
      ? [
          { href: "/dashboard/compliance", label: "Compliance", icon: ShieldCheck },
          { href: "/dashboard/data-sources", label: "Data Sources", icon: Database },
          { href: "/dashboard/legal-content", label: "Legal Content", icon: FileText },
          { href: "/dashboard/audit-log", label: "Audit Log", icon: History },
        ]
      : []),
    // Demo-mode, platform-admin-only: matches /dashboard/demo-tools's own
    // page-level gate exactly, so the link is never shown to a role that
    // would just bounce off an access-denied redirect.
    ...(identity.mode === "demo" && isPlatformAdmin(identity)
      ? [{ href: "/dashboard/demo-tools", label: "Demo Tools", icon: Wrench }]
      : []),
  ];

  // Rendered once and reused in both the desktop sidebar and the mobile
  // drawer so the two can never quietly drift apart.
  const navLinks = nav.map((item) => (
    <Link
      key={item.href}
      href={item.href}
      className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-primary-50 hover:text-primary-700"
    >
      <item.icon className="h-4 w-4" />
      {item.label}
    </Link>
  ));

  return (
    <div className="flex min-h-screen bg-slate-50">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to main content
      </a>
      <aside className="hidden w-64 flex-shrink-0 border-r border-slate-200 bg-white lg:flex lg:flex-col">
        <div className="flex items-center gap-2 border-b border-slate-200 px-6 py-5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600 text-white">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <span className="text-sm font-semibold text-slate-900">InsureLead Intelligence</span>
        </div>
        <nav aria-label="Dashboard" className="flex-1 space-y-1 px-3 py-4">
          {navLinks}
        </nav>
        <div className="border-t border-slate-200 p-4">
          <Link href="/" className="flex items-center gap-2 text-xs font-medium text-slate-500 hover:text-primary-700">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to public site
          </Link>
          <p className="mt-3 text-xs text-slate-400">
            {identity.displayName && <>{identity.displayName}<br /></>}
            {identity.organisationName}<br />{identity.role.replace(/_/g, " ")}
          </p>
          {identity.mode === "supabase" ? (
            <form action={signOut} className="mt-3">
              <button type="submit" className="flex items-center gap-2 text-xs font-medium text-slate-500 hover:text-primary-700">
                <LogOut className="h-3.5 w-3.5" /> Sign out
              </button>
            </form>
          ) : (
            <>
              <p className="mt-2 text-xs font-medium text-amber-600">Synthetic data only</p>
              <DemoRoleSwitcher currentRole={identity.role} />
            </>
          )}
        </div>
      </aside>
      <div className="flex-1">
        <DashboardMobileNav>{navLinks}</DashboardMobileNav>
        <main id="main-content" className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
