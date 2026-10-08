import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { canManageCompliance, canViewCompliance, getDashboardIdentity } from "@/lib/auth";
import { getDashboardLegalTextDocumentVersions, updateDashboardLegalTextDocument } from "@/lib/dashboard-data";
import { LEGAL_TEXT_DOCUMENT_DEFINITIONS } from "@/lib/constants";
import type { LegalTextDocumentKey } from "@/lib/types";

const DOCUMENT_KEYS = LEGAL_TEXT_DOCUMENT_DEFINITIONS.map((definition) => definition.key) as [
  LegalTextDocumentKey,
  ...LegalTextDocumentKey[],
];

const schema = z.object({
  content: z.string().trim().min(1).max(20000),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!DOCUMENT_KEYS.includes(key as LegalTextDocumentKey)) {
    return NextResponse.json({ error: "Unknown legal text document key" }, { status: 404 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Document content must not be empty" }, { status: 400 });
  }

  const identity = await getDashboardIdentity();
  if (!identity.authenticated) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!identity.accessAllowed || !canManageCompliance(identity)) {
    return NextResponse.json({ error: "Only a platform or compliance administrator may update legal text" }, { status: 403 });
  }

  const actor = identity.displayName ?? identity.organisationName;

  try {
    const updated = await updateDashboardLegalTextDocument(key as LegalTextDocumentKey, parsed.data.content, actor);
    return NextResponse.json({ ok: true, document: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The document could not be updated";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!DOCUMENT_KEYS.includes(key as LegalTextDocumentKey)) {
    return NextResponse.json({ error: "Unknown legal text document key" }, { status: 404 });
  }

  const identity = await getDashboardIdentity();
  if (!identity.authenticated) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!identity.accessAllowed || !canViewCompliance(identity)) {
    return NextResponse.json({ error: "Only a platform admin, compliance admin, or compliance auditor may view legal text history" }, { status: 403 });
  }

  const versions = await getDashboardLegalTextDocumentVersions(key as LegalTextDocumentKey);
  return NextResponse.json({ ok: true, versions });
}
