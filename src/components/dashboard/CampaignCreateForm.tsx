"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { PROVINCES } from "@/lib/constants";
import type { BrokerSendingIdentity, InsuranceProduct } from "@/lib/types";

// Broker-side "new campaign draft" form, shown on /dashboard/campaigns to
// anyone canManageCampaigns() allows (auth.ts). Mirrors the Campaign
// Orchestration MCP server's create_campaign_draft tool one-for-one:
// this only ever creates a "draft" - no content, no approval, no send.
// Deliberately restricts the product checklist to the tenant's own
// approved appetite (approvedProducts) rather than the full catalogue,
// so a broker can never even attempt to draft a campaign the
// product_permission validation issue would just reject later.
const OBJECTIVES: { value: string; label: string }[] = [
  { value: "awareness", label: "Awareness" },
  { value: "renewal_reminder", label: "Renewal reminder" },
  { value: "cross_sell", label: "Cross-sell" },
  { value: "quote_follow_up", label: "Quote follow-up" },
  { value: "seasonal", label: "Seasonal" },
];

export function CampaignCreateForm({
  approvedProducts,
  sendingIdentities,
  campaignsEnabled = true,
}: {
  // The broker's approved products that are offered today (with labels).
  approvedProducts: { value: InsuranceProduct; label: string }[];
  sendingIdentities: BrokerSendingIdentity[];
  campaignsEnabled?: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [objective, setObjective] = useState("awareness");
  const [products, setProducts] = useState<InsuranceProduct[]>([]);
  const [sendingIdentityId, setSendingIdentityId] = useState(sendingIdentities[0]?.id ?? "");
  const [provinces, setProvinces] = useState<string[]>([]);
  const [minimumScore, setMinimumScore] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const availableProducts = approvedProducts;

  function toggleProduct(value: InsuranceProduct) {
    setProducts((prev) => (prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]));
  }

  function toggleProvince(value: string) {
    setProvinces((prev) => (prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]));
  }

  async function submit() {
    if (name.trim().length < 3) {
      setError("A campaign name of at least 3 characters is required");
      return;
    }
    if (products.length === 0) {
      setError("Select at least one insurance product");
      return;
    }
    if (!sendingIdentityId) {
      setError("Select a sending identity");
      return;
    }
    const score = minimumScore.trim() === "" ? undefined : Number(minimumScore);
    if (score !== undefined && (!Number.isInteger(score) || score < 0 || score > 100)) {
      setError("Minimum lead score must be a whole number from 0 to 100");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          objective,
          insuranceProducts: products,
          sendingIdentityId,
          provinces: provinces.length ? provinces : undefined,
          minimumScore: score,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "The campaign could not be created");
      setNotice(`Draft "${body.campaign?.name ?? name.trim()}" created below. Open it to write content and request approval.`);
      setName("");
      setProducts([]);
      setProvinces([]);
      setMinimumScore("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The campaign could not be created");
    } finally {
      setBusy(false);
    }
  }

  // An approved tenant with no product appetite (no buyer_preferences
  // products yet) would otherwise render an empty checklist that can never
  // pass the "select at least one product" check. Explain it instead.
  if (availableProducts.length === 0 || !campaignsEnabled) {
    return (
      <div className="mt-4 rounded-lg border border-dashed border-amber-300 bg-amber-50 p-4 text-xs text-amber-900" data-testid="campaign-create-form">
        <p className="font-semibold">Campaign drafting is not available yet</p>
        <p className="mt-1">
          {availableProducts.length === 0
            ? "Your broker has no approved insurance products yet."
            : "Campaigns are not enabled for your broker yet."}{" "}
          A platform administrator can set your approved appetite and enable campaigns in the Broker Directory.
        </p>
      </div>
    );
  }

  if (sendingIdentities.length === 0) {
    return (
      <div className="mt-4 rounded-lg border border-dashed border-slate-300 p-4 text-xs text-slate-500" data-testid="campaign-create-form">
        Add a sending identity on your broker profile before drafting a campaign.
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-lg border border-dashed border-slate-300 p-4" data-testid="campaign-create-form">
      <h3 className="text-sm font-semibold text-slate-900">New campaign draft</h3>
      <p className="mt-1 text-xs text-slate-500">
        Creates a draft only. Content, validation, and approval happen separately, on the campaign&apos;s own page.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
          Campaign name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Spring motor cover review"
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
          Objective
          <select
            value={objective}
            onChange={(event) => setObjective(event.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
          >
            {OBJECTIVES.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
          Sending identity
          <select
            value={sendingIdentityId}
            onChange={(event) => setSendingIdentityId(event.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
          >
            {sendingIdentities.map((identity) => (
              <option key={identity.id} value={identity.id}>{identity.fromName} ({identity.status})</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
          Minimum lead score (optional)
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            step={1}
            value={minimumScore}
            onChange={(event) => setMinimumScore(event.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
          />
        </label>
      </div>

      <fieldset className="mt-3">
        <legend className="text-xs font-medium text-slate-500">Insurance products (your tenant&apos;s approved appetite only)</legend>
        <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
          {availableProducts.map((product) => (
            <label key={product.value} className="flex items-center gap-2 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={products.includes(product.value)}
                onChange={() => toggleProduct(product.value)}
                className="h-3.5 w-3.5 rounded border-slate-300 text-primary-600"
              />
              {product.label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-3">
        <legend className="text-xs font-medium text-slate-500">Province segment (optional - leave blank for all provinces)</legend>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {PROVINCES.map((province) => (
            <label key={province} className="flex items-center gap-1.5 rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={provinces.includes(province)}
                onChange={() => toggleProvince(province)}
                className="h-3 w-3 rounded border-slate-300 text-primary-600"
              />
              {province}
            </label>
          ))}
        </div>
      </fieldset>

      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        Create draft
      </button>
      {error ? <p className="mt-2 text-xs text-red-600" role="alert">{error}</p> : null}
      {notice ? <p className="mt-2 text-xs text-emerald-700" role="status">{notice}</p> : null}
    </div>
  );
}
