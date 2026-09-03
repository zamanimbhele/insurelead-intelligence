import { Section, SectionHeading } from "@/components/ui/Section";

export const metadata = { title: "Privacy Notice | InsureLead Intelligence" };

// PRODUCTION NOTE: This text is a configurable placeholder. In production it
// is edited by the Compliance Admin role via application_settings and
// versioned, with each lead recording the consent wording version shown to
// them at submission time (see lib/constants.ts CONSENT_WORDING_VERSION).
export default function PrivacyPage() {
  return (
    <Section>
      <SectionHeading eyebrow="Legal" title="Privacy Notice" />
      <div className="prose mt-8 max-w-3xl space-y-4 text-sm text-slate-600">
        <p>Version: v2.0 - Last updated 3 September 2026 (placeholder - to be reviewed by Compliance Admin).</p>
        <p>
          This Privacy Notice explains how InsureLead Intelligence (the &quot;Platform&quot;) collects, uses, and protects
          information you submit when requesting a business insurance consultation.
        </p>
        <h3 className="font-semibold text-slate-900">What we collect</h3>
        <p>
          We collect business details (such as business name, industry, and location), your insurance needs, and
          contact person details (name, role, email, mobile number) that you provide in the consultation form. We do
          not collect ID numbers, banking details, payment card details, or medical information through this form.
        </p>
        <h3 className="font-semibold text-slate-900">How we use your information</h3>
        <p>
          Your information is used to respond to your enquiry and, when you give partner-sharing consent, match it
          to no more than the number of approved insurance partners you selected. Optional marketing consent is
          separate and is not required. We record your campaign source, recipient limit and consent wording.
        </p>
        <h3 className="font-semibold text-slate-900">Your rights</h3>
        <p>
          You may request access to, correction of, or deletion of your information, or ask to be marked Do Not
          Contact, at any time via our Contact Us page. We will action opt-out and deletion requests in line with
          our data retention policy.
        </p>
        <h3 className="font-semibold text-slate-900">Data retention</h3>
        <p>
          [Configure retention periods per data category - to be set by Compliance Admin before go-live.]
        </p>
        <h3 className="font-semibold text-slate-900">Contact</h3>
        <p>For privacy queries, contact compliance@[configure-domain].co.za.</p>
      </div>
    </Section>
  );
}
