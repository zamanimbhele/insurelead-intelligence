"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { WORKSPACE_TYPES, WORKSPACE_TYPE_LABELS, type WorkspaceType } from "@/lib/workspace";

// Platform admins: change how an organisation is presented. The API route
// and set_workspace_type() re-check permission.
export function WorkspaceTypeControl({ organisationId, current }: { organisationId: string; current: WorkspaceType }) {
  const router = useRouter();
  const [value, setValue] = useState<WorkspaceType>(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change(next: WorkspaceType) {
    setValue(next);
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/admin/organisations/${organisationId}/workspace-type`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceType: next }),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setValue(current);
      setError(body.error ?? "The workspace type could not be changed");
      return;
    }
    router.refresh();
  }

  return (
    <label className="flex items-center gap-2 text-xs text-slate-500">
      Workspace
      <select
        value={value}
        disabled={busy}
        onChange={(event) => void change(event.target.value as WorkspaceType)}
        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700"
      >
        {WORKSPACE_TYPES.map((type) => <option key={type} value={type}>{WORKSPACE_TYPE_LABELS[type]}</option>)}
      </select>
      {error && <span role="alert" className="text-red-600">{error}</span>}
    </label>
  );
}
