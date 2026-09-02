// Local, file-based demo data store for the MVP prototype.
//
// PRODUCTION NOTE: This module exists only so the prototype is runnable
// without a hosted database. In production this is replaced entirely by
// Supabase (PostgreSQL + Row Level Security) as specified in the platform
// architecture - see README "Moving to Production".
import fs from "fs";
import path from "path";
import type { Lead, ConsentRecord, AuditLogEntry } from "./types.ts";

const DATA_DIR = path.join(process.cwd(), "data");
const LEADS_FILE = path.join(DATA_DIR, "leads.json");
const CONSENTS_FILE = path.join(DATA_DIR, "consents.json");
const AUDIT_FILE = path.join(DATA_DIR, "audit-log.json");

function readJson<T>(file: string, fallback: T): T {
  try {
    if (!fs.existsSync(file)) return fallback;
    const raw = fs.readFileSync(file, "utf-8");
    return raw.trim() ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

export function getLeads(): Lead[] {
  return readJson<Lead[]>(LEADS_FILE, []);
}

export function getLeadById(id: string): Lead | undefined {
  return getLeads().find((l) => l.id === id);
}

export function updateLead(id: string, changes: Partial<Lead>): Lead | undefined {
  const leads = getLeads();
  const index = leads.findIndex((lead) => lead.id === id);
  if (index === -1) return undefined;

  const updated = { ...leads[index], ...changes, id: leads[index].id };
  leads[index] = updated;
  writeJson(LEADS_FILE, leads);
  return updated;
}

export function saveLead(lead: Lead) {
  const leads = getLeads();
  leads.unshift(lead);
  writeJson(LEADS_FILE, leads);
}

export function findPossibleDuplicate(email: string, businessName: string): Lead | undefined {
  const windowMs = 1000 * 60 * 60 * 24; // 24 hours
  const now = Date.now();
  return getLeads().find(
    (l) =>
      l.contactEmail.toLowerCase() === email.toLowerCase() &&
      l.businessName.toLowerCase() === businessName.toLowerCase() &&
      now - new Date(l.createdAt).getTime() < windowMs
  );
}

export function saveConsent(record: ConsentRecord) {
  const consents = readJson<ConsentRecord[]>(CONSENTS_FILE, []);
  consents.unshift(record);
  writeJson(CONSENTS_FILE, consents);
}

export function getConsentByLeadId(leadId: string): ConsentRecord | undefined {
  return readJson<ConsentRecord[]>(CONSENTS_FILE, []).find((record) => record.leadId === leadId);
}

export function appendAuditLog(entry: Omit<AuditLogEntry, "id" | "timestamp">) {
  const log = readJson<AuditLogEntry[]>(AUDIT_FILE, []);
  const fullEntry: AuditLogEntry = {
    ...entry,
    id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
  };
  log.unshift(fullEntry);
  writeJson(AUDIT_FILE, log);
  return fullEntry;
}

export function getAuditLog(): AuditLogEntry[] {
  return readJson<AuditLogEntry[]>(AUDIT_FILE, []);
}
