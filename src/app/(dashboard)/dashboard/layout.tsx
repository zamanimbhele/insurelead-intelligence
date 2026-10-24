import Link from "next/link";
import { redirect } from "next/navigation";
import { LayoutDashboard, Users, BarChart3, ShieldCheck, ArrowLeft, Store, LogOut, Building2, ClipboardList, Settings, Megaphone, Database, History, FileText, Wrench, KeyRound, Home } from "lucide-react";
import { canViewCompliance, getDashboardIdentity, isBrokerUser, isComplianceAuditor, isPlatformAdmin } from "@/lib/auth";
import { signOut } from "@/app/(auth)/login/actions";
import { DemoRoleSwitcher } from "@/components/dashboard/DemoRoleSwitcher";
import { DashboardMobileNav } from "@/components/dashboard/DashboardMobileNav";
import { ADMIN_HOME, isPlatformStaffRole, portalBadge } from "@/lib/portal";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const identity = await getDashboardIdentity();
  if (!identity.authenticated) redirect("/login");
  if (!identity.accessAllowed) redirect("/access-denied");

  // Platform staff get the admin portal: its own home, dark sidebar and an
  // amber band on every page, so cross-broker access is never mistaken for
  // a broker's own workspace. Permissions are unchanged - every page still
  // checks the role itself.
  const admin = isPlatformStaffRole(identity.role);
  const badge = portalBadge(identity.role);

  const nav = [
    ...(admin ? [{ href: ADMIN_HOME, label: "Admin home", icon: Home }] : []),
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
    // Supabase mode only: /reset-password also serves signed-in users, so
    // this is the "change password" entry point on desktop and mobile.
    ...(identity.mode === "supabase"
      ? [{ href: "/reset-password", label: "Change password", icon: KeyRound }]
      : []),
  ];

  // Rendered once and reused in both the desktop sidebar and the mobile
  // drawer so the two can never quietly drift apart.
  const navLinks = nav.map((item) => (
    <Link
      key={item.href}
      href={item.href}
      className={admin
        ? "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-amber-300"
        : "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-primary-50 hover:text-primary-700"}
    >
      <item.icon className="h-4 w-4" />
      {item.label}
    </Link>
  ));

  return (
    <div className={`flex min-h-screen ${admin ? "bg-slate-100" : "bg-slate-50"}`} data-portal={admin ? "admin" : "broker"}>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to main content
      </a>
      <aside className={`hidden w-64 flex-shrink-0 border-r lg:flex lg:flex-col ${admin ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white"}`}>
        <div className={`flex items-center gap-2 border-b px-6 py-5 ${admin ? "border-slate-800" : "border-slate-200"}`}>
          <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${admin ? "bg-amber-400 text-slate-900" : "bg-primary-600 text-white"}`}>
            <ShieldCheck className="h-4 w-4" />
          </span>
          <span className={`text-sm font-semibold ${admin ? "text-white" : "text-slate-900"}`}>
            {admin ? "InsureLead Admin" : "InsureLead Intelligence"}
          </span>
        </div>
        <nav aria-label="Dashboard" className="flex-1 space-y-1 px-3 py-4">
          {navLinks}
        </nav>
        <div className={`border-t p-4 ${admin ? "border-slate-800" : "border-slate-200"}`}>
          <Link href="/" className={`flex items-center gap-2 text-xs font-medium ${admin ? "text-slate-400 hover:text-amber-300" : "text-slate-500 hover:text-primary-700"}`}>
            <ArrowLeft className="h-3.5 w-3.5" /> Back to public site
          </Link>
          <p className="mt-3 text-xs text-slate-400">
            {identity.displayName && <>{identity.displayName}<br /></>}
            {identity.organisationName}<br />{identity.role.replace(/_/g, " ")}
          </p>
          {identity.mode === "supabase" ? (
            <form action={signOut} className="mt-3">
              <button type="submit" className={`flex items-center gap-2 text-xs font-medium ${admin ? "text-slate-400 hover:text-amber-300" : "text-slate-500 hover:text-primary-700"}`}>
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
        <DashboardMobileNav admin={admin}>{navLinks}</DashboardMobileNav>
        {badge && (
          <div
            role="note"
            data-testid="admin-portal-band"
            className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-amber-300 bg-amber-400 px-4 py-2 text-slate-900 sm:px-6 lg:px-8"
          >
            <span className="rounded bg-slate-900 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-amber-300">Admin</span>
            <span className="text-sm font-semibold">{badge.label}</span>
            <span className="text-xs font-medium text-slate-800">{badge.note}</span>
          </div>
        )}
        <main id="main-content" className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
