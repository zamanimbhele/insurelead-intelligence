"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function AllocateLeadButton({ leadId, buyerId }: { leadId: string; buyerId: string }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  async function allocate() {
    setBusy(true); setError(null);
    const response = await fetch("/api/marketplace/allocations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leadId, buyerId, priceCents: 75000, exclusive: true }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { setError(body.error ?? "Allocation failed"); setBusy(false); return; }
    router.refresh(); setBusy(false);
  }
  return <div><button type="button" onClick={allocate} disabled={busy} className="rounded-md bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">{busy ? "Reserving…" : "Reserve exclusive lead"}</button>{error && <p className="mt-2 max-w-xs text-xs text-red-600">{error}</p>}</div>;
}
