import { format } from "date-fns";
import { Section, SectionHeading } from "@/components/ui/Section";
import { getRuntimeLegalTextDocument } from "@/lib/runtime-data";
import { renderLegalTextParagraphs } from "@/lib/lead-utils";

export const metadata = { title: "Terms of Use | InsureLead Intelligence" };
export const dynamic = "force-dynamic";

// Renders the "terms_of_use" and "fsp_disclosures" legal text documents
// (project brief section 2) - see the Privacy Notice page for the same
// pattern and supabase/migrations/202610080001_legal_text_documents.sql
// for where these are configured and version-tracked.
export default async function TermsPage() {
  const [termsOfUse, fspDisclosures] = await Promise.all([
    getRuntimeLegalTextDocument("terms_of_use"),
    getRuntimeLegalTextDocument("fsp_disclosures"),
  ]);

  return (
    <Section>
      <SectionHeading eyebrow="Legal" title="Terms of Use" />
      <div className="prose mt-8 max-w-3xl space-y-4 text-sm text-slate-600">
        <p className="text-xs text-slate-400">
          Version v{termsOfUse.version} - last updated {format(new Date(termsOfUse.updatedAt), "d MMMM yyyy")}.
        </p>
        {renderLegalTextParagraphs(termsOfUse.content).map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
        <h3 className="font-semibold text-slate-900">Financial Services Provider Disclosures</h3>
        {renderLegalTextParagraphs(fspDisclosures.content).map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </div>
    </Section>
  );
}
