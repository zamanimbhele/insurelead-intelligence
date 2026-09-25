import { Section, SectionHeading } from "@/components/ui/Section";

export const metadata = { title: "About | InsureLead Intelligence" };

export default function AboutPage() {
  return (
    <Section>
      <SectionHeading eyebrow="About" title="About InsureLead Intelligence" />
      <div className="prose mt-8 max-w-3xl text-slate-600">
        <p>
          InsureLead Intelligence is a B2B lead generation and campaign management platform for approved insurance
          brokers. Brokers define the products, markets, and lead volumes they need; InsureLead supports campaign
          execution, consent-aware enquiry capture, transparent scoring, and controlled delivery.
        </p>
        <p id="brokers" className="mt-4 scroll-mt-28">
          Approved brokers participate as separate organisations, with product appetite, geographic coverage, lead
          capacity, campaign activity, and access controls configured for each organisation. Matched leads are
          delivered to a dedicated workspace for prioritisation and follow-up.
        </p>
        <p className="mt-4">
          This instance uses placeholder branding and synthetic demonstration data. Legal entity details, financial
          services provider information, insurer names, and product wording will be configured by an authorised
          administrator before this platform is used with real clients.
        </p>
        <p className="mt-4">
          The platform does not provide automated insurance advice, premiums, or underwriting decisions. Every
          enquiry is reviewed and actioned by an appropriately authorised human broker.
        </p>
      </div>
    </Section>
  );
}
