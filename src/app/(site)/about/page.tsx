import { Section, SectionHeading } from "@/components/ui/Section";

export const metadata = { title: "About | InsureLead Intelligence" };

export default function AboutPage() {
  return (
    <Section>
      <SectionHeading eyebrow="About" title="About InsureLead Intelligence" />
      <div className="prose mt-8 max-w-3xl text-slate-600">
        <p>
          InsureLead Intelligence is a configurable, white-label business insurance lead intelligence platform. It
          helps a business insurance broker attract, capture, qualify, and convert business insurance enquiries
          responsibly, while giving management team visibility into demand trends across industries and regions.
        </p>
        <p className="mt-4">
          This instance uses placeholder branding and synthetic demonstration data. Legal entity details, financial
          services provider information, insurer names, and product wording will be configured by an authorised
          administrator before this platform is used with real clients.
        </p>
        <p className="mt-4">
          The platform does not provide automated insurance advice, premiums, or underwriting decisions. Every
          enquiry is reviewed and actioned by a licensed human broker.
        </p>
      </div>
    </Section>
  );
}
