// Demo-mode store for practitioner authorisations (data/practitioner-
// authorisations.json). When the file is missing, the seed below is used:
// every demo organisation is verified for the categories its approved
// appetite needs, and the solo advisor also has an investments claim
// awaiting review, so the admin queue has something in it.
import fs from "fs";
import path from "path";
import type { AuthorisationStatus, EvidenceType, PractitionerAuthorisation } from "./authorisations.ts";

const FILE = path.join(process.cwd(), "data", "practitioner-authorisations.json");

export const DEMO_AUTHORISATION_SEED: PractitionerAuthorisation[] = [
  {
    id: "auth_demo_gauteng_short_term", profileId: "demo:broker_admin", holderName: "Johan van der Merwe",
    organisationId: "buyer_gauteng_commercial", categoryId: "short_term_insurance", evidenceType: "fsp_licence",
    referenceNumber: "FSP-DEMO-001", status: "verified", submittedAt: "2026-09-01T08:00:00.000Z",
    reviewedAt: "2026-09-02T08:00:00.000Z", holderActive: true,
  },
  {
    id: "auth_demo_sme_short_term", profileId: "demo:sme_key_individual", holderName: "Demo key individual",
    organisationId: "buyer_sme_national", categoryId: "short_term_insurance", evidenceType: "fsp_licence",
    referenceNumber: "FSP-DEMO-002", status: "verified", submittedAt: "2026-09-01T08:00:00.000Z",
    reviewedAt: "2026-09-02T08:00:00.000Z", holderActive: true,
  },
  {
    id: "auth_demo_personal_short_term", profileId: "demo:personal_key_individual", holderName: "Demo key individual",
    organisationId: "buyer_personal_lines", categoryId: "short_term_insurance", evidenceType: "fsp_licence",
    referenceNumber: "FSP-DEMO-003", status: "verified", submittedAt: "2026-09-01T08:00:00.000Z",
    reviewedAt: "2026-09-02T08:00:00.000Z", holderActive: true,
  },
  {
    id: "auth_demo_solo_long_term", profileId: "demo:solo_advisor", holderName: "Lerato Ndlovu",
    organisationId: "buyer_solo_advisor", categoryId: "long_term_insurance", evidenceType: "representative_appointment",
    referenceNumber: "FSP-DEMO-104", providerName: "Example Life Financial Services (demo)", status: "verified",
    expiresOn: "2027-06-30", submittedAt: "2026-09-10T08:00:00.000Z", reviewedAt: "2026-09-11T08:00:00.000Z", holderActive: true,
  },
  {
    id: "auth_demo_solo_investments", profileId: "demo:solo_advisor", holderName: "Lerato Ndlovu",
    organisationId: "buyer_solo_advisor", categoryId: "investments", evidenceType: "representative_appointment",
    referenceNumber: "FSP-DEMO-104", providerName: "Example Life Financial Services (demo)",
    evidenceNote: "Appointment letter dated 1 October 2026 (demo).", status: "pending",
    submittedAt: "2026-10-20T08:00:00.000Z", holderActive: true,
  },
];

export function getDemoAuthorisations(): PractitionerAuthorisation[] {
  try {
    const raw = fs.readFileSync(FILE, "utf-8");
    return raw.trim() ? (JSON.parse(raw) as PractitionerAuthorisation[]) : DEMO_AUTHORISATION_SEED;
  } catch {
    return DEMO_AUTHORISATION_SEED;
  }
}

function save(list: PractitionerAuthorisation[]) {
  fs.writeFileSync(FILE, JSON.stringify(list, null, 2));
}

export function submitDemoAuthorisation(input: {
  profileId: string;
  holderName: string;
  organisationId: string;
  categoryId: string;
  evidenceType: EvidenceType;
  referenceNumber: string;
  providerName?: string;
  evidenceNote?: string;
  expiresOn?: string;
}): PractitionerAuthorisation {
  const list = getDemoAuthorisations();
  if (list.some((item) => item.profileId === input.profileId && item.categoryId === input.categoryId && ["pending", "verified"].includes(item.status))) {
    throw new Error("You already have a pending or verified authorisation for this category");
  }
  const created: PractitionerAuthorisation = {
    id: `auth_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    ...input,
    status: "pending",
    submittedAt: new Date().toISOString(),
    holderActive: true,
  };
  save([created, ...list]);
  return created;
}

export function updateDemoAuthorisation(id: string, changes: { status: AuthorisationStatus; reviewNote?: string; expiresOn?: string; reviewed?: boolean }) {
  const list = getDemoAuthorisations();
  const index = list.findIndex((item) => item.id === id);
  if (index === -1) throw new Error("Authorisation not found");
  list[index] = {
    ...list[index],
    status: changes.status,
    reviewNote: changes.reviewNote ?? list[index].reviewNote,
    expiresOn: changes.expiresOn ?? list[index].expiresOn,
    reviewedAt: changes.reviewed ? new Date().toISOString() : list[index].reviewedAt,
  };
  save(list);
  return list[index];
}
