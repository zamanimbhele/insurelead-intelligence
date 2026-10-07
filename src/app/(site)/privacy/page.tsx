import { format } from "date-fns";
import { Section, SectionHeading } from "@/components/ui/Section";
import { getRuntimeLegalTextDocument } from "@/lib/runtime-data";
import { renderLegalTextParagraphs } from "@/lib/lead-utils";

export const metadata = { title: "Privacy Notice | InsureLead Intelligence" };
export const dynamic = "force-dynamic";

// This page renders the "privacy_notice" and "data_retention_policy" legal
// text documents (project brief section 2), editable with version history
// by a platform or compliance admin at /dashboard/legal-content - see
// supabase/migrations/202610080001_legal_text_documents.sql. Nothing on
// this page is hardcoded any more: a published edit there appears here on
// the next request.
export default async function PrivacyPage() {
  const [privacyNotice, dataRetentionPolicy] = await Promise.all([
    getRuntimeLegalTextDocument("privacy_notice"),
    getRuntimeLegalTextDocument("data_retention_policy"),
  ]);

  return (
    <Section>
      <SectionHeading eyebrow="Legal" title="Privacy Notice" />
      <div className="prose mt-8 max-w-3xl space-y-4 text-sm text-slate-600">
        <p className="text-xs text-slate-400">
          Version v{privacyNotice.version} - last updated {format(new Date(privacyNotice.updatedAt), "d MMMM yyyy")}.
        </p>
        {renderLegalTextParagraphs(privacyNotice.content).map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
        <h3 className="font-semibold text-slate-900">Data retention</h3>
        {renderLegalTextParagraphs(dataRetentionPolicy.content).map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </div>
    </Section>
  );
}
