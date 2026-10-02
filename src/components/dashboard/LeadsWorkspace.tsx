"use client";

import { useState } from "react";
import { LayoutGrid, Table2 } from "lucide-react";
import type { Lead } from "@/lib/types";
import { LeadsTable } from "./LeadsTable";
import { LeadKanbanBoard } from "./LeadKanbanBoard";

type View = "table" | "kanban";

export function LeadsWorkspace({ leads, demoMode, canEdit }: { leads: Lead[]; demoMode: boolean; canEdit: boolean }) {
  const [view, setView] = useState<View>("table");

  return (
    <div className="flex flex-col gap-4">
      <div
        role="tablist"
        aria-label="Leads view"
        className="flex w-fit gap-1 rounded-lg border border-slate-200 bg-white p-1"
      >
        <ViewButton icon={Table2} label="Table" active={view === "table"} onClick={() => setView("table")} />
        <ViewButton icon={LayoutGrid} label="Kanban" active={view === "kanban"} onClick={() => setView("kanban")} />
      </div>

      {view === "table" ? (
        <LeadsTable leads={leads} demoMode={demoMode} />
      ) : (
        <LeadKanbanBoard leads={leads} canEdit={canEdit} />
      )}
    </div>
  );
}

function ViewButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: typeof Table2;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        active ? "bg-primary-50 text-primary-700" : "text-slate-500 hover:text-slate-700"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
