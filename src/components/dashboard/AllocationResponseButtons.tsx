"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AllocationResponseButtons({ allocationId }: { allocationId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"accepted" | "released" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function respond(decision: "accepted" | "released") {
    setBusy(decision);
    setError(null);
    const response = await fetch(`/api/allocations/${allocationId}/response`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error ?? "The allocation response could not be recorded");
      setBusy(null);
      return;
    }
    router.refresh();
    setBusy(null);
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => respond("accepted")}
          disabled={busy !== null}
          className="rounded-md bg-primary-600 px-3 py-2 text-xs font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {busy === "accepted" ? "Accepting…" : "Accept lead"}
        </button>
        <button
          type="button"
          onClick={() => respond("released")}
          disabled={busy !== null}
          className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {busy === "released" ? "Releasing…" : "Release"}
        </button>
      </div>
      {error && <p className="mt-2 max-w-xs text-xs text-red-600">{error}</p>}
    </div>
  );
}
