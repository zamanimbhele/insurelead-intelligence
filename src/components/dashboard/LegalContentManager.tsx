"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import type { LegalTextDocument, LegalTextDocumentVersion } from "@/lib/types";
import { LEGAL_TEXT_DOCUMENT_DEFINITIONS } from "@/lib/constants";
import { renderLegalTextParagraphs } from "@/lib/lead-utils";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error ?? "The request could not be completed");
  return result as T;
}

const textareaClass =
  "min-h-[140px] w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500";

function VersionHistory({ documentKey }: { documentKey: LegalTextDocument["documentKey"] }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [versions, setVersions] = useState<LegalTextDocumentVersion[] | null>(null);

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (versions) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchJson<{ versions: LegalTextDocumentVersion[] }>(`/api/legal-text/${documentKey}`);
      setVersions(result.versions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Version history could not be loaded");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => void toggle()}
        className="flex items-center gap-1 text-xs font-medium text-primary-700 hover:text-primary-800"
      >
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        Version history
      </button>
      {open && (
        <div className="mt-2 rounded-md border border-slate-100 bg-slate-50 p-3">
          {loading && (
            <p className="flex items-center gap-1.5 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading history...
            </p>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
          {versions && versions.length === 0 && <p className="text-xs text-slate-400">No saved versions yet.</p>}
          {versions && versions.length > 0 && (
            <ul className="flex flex-col gap-2">
              {versions.map((version) => (
                <li key={version.version} className="text-xs text-slate-600">
                  <span className="font-medium text-slate-700">v{version.version}</span> by {version.updatedBy} on{" "}
                  {format(new Date(version.createdAt), "d MMM yyyy, HH:mm")}
                  <p className="mt-1 whitespace-pre-wrap text-slate-500">{version.content}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function LegalTextDocumentCard({
  document,
  shownOn,
  canManage,
  onSaved,
}: {
  document: LegalTextDocument;
  shownOn: string;
  canManage: boolean;
  onSaved: () => void;
}) {
  const [content, setContent] = useState(document.content);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!content.trim()) {
      setError("Document content must not be empty");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await fetchJson(`/api/legal-text/${document.documentKey}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: content.trim() }),
      });
      setEditing(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The document could not be saved");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5" data-testid="legal-text-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">{document.title}</h2>
          <p className="text-xs text-slate-400">{shownOn}</p>
        </div>
        <span
          data-testid="legal-text-version"
          className="flex-shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500"
        >
          v{document.version}
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-400">
        Last updated by {document.updatedBy} on {format(new Date(document.updatedAt), "d MMM yyyy, HH:mm")}
      </p>

      {editing ? (
        <div className="mt-3">
          <textarea value={content} onChange={(event) => setContent(event.target.value)} className={textareaClass} />
          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-md bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save and publish
            </button>
            <button
              type="button"
              onClick={() => {
                setContent(document.content);
                setEditing(false);
                setError(null);
              }}
              disabled={saving}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-2 text-sm text-slate-600">
          {renderLegalTextParagraphs(document.content).map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
          {canManage && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="mt-1 self-start rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Edit
            </button>
          )}
        </div>
      )}

      <VersionHistory documentKey={document.documentKey} />
    </div>
  );
}

export function LegalContentManager({ documents, canManage }: { documents: LegalTextDocument[]; canManage: boolean }) {
  const router = useRouter();
  const refresh = () => router.refresh();

  return (
    <div className="flex flex-col gap-4">
      {LEGAL_TEXT_DOCUMENT_DEFINITIONS.map((definition) => {
        const document = documents.find((entry) => entry.documentKey === definition.key);
        if (!document) return null;
        return (
          <LegalTextDocumentCard
            key={definition.key}
            document={document}
            shownOn={definition.shownOn}
            canManage={canManage}
            onSaved={refresh}
          />
        );
      })}
    </div>
  );
}
