"use client";

// Demo-mode-only "viewing as" control, rendered in the dashboard sidebar
// (see dashboard/layout.tsx). Lets anyone exploring the prototype see
// exactly what each of the 6 seeded DEMO_ROLE_ACCOUNTS (src/lib/
// constants.ts) can and cannot do - the RBAC matrix the project brief
// defines in section 4 - without a real sign-in. Auto-submits on change
// (via requestSubmit()) rather than needing a separate "Switch" button;
// the server action itself (setDemoRole, dashboard/actions.ts) re-checks
// the role value and getDataMode() rather than trusting this selection.
import { useRef } from "react";
import { setDemoRole } from "@/app/(dashboard)/dashboard/actions";
import { DEMO_ROLE_ACCOUNTS } from "@/lib/constants";

export function DemoRoleSwitcher({ currentRole }: { currentRole: string }) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={setDemoRole} className="mt-3">
      <label htmlFor="demo-role-select" className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        Viewing as (demo role)
      </label>
      <select
        id="demo-role-select"
        name="role"
        defaultValue={currentRole}
        onChange={() => formRef.current?.requestSubmit()}
        className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 focus:border-primary-500 focus:outline-none"
      >
        {DEMO_ROLE_ACCOUNTS.map((account) => (
          <option key={account.role} value={account.role}>
            {account.label}
          </option>
        ))}
      </select>
    </form>
  );
}
