import { Section, SectionHeading } from "@/components/ui/Section";
import { LinkButton } from "@/components/ui/Button";
import { Mail, Phone, ShieldOff } from "lucide-react";

export const metadata = { title: "Contact Us | InsureLead Intelligence" };

export default function ContactPage() {
  return (
    <Section>
      <div id="broker-enquiry" className="scroll-mt-28">
        <SectionHeading
          eyebrow="Broker Enquiries"
          title="Talk to the InsureLead Platform Team"
          description="Discuss your product appetite, service areas, lead-volume requirements, and broker onboarding needs."
        />
      </div>
      <div className="mt-10 grid gap-8 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 p-6">
          <Mail className="h-5 w-5 text-primary-600" />
          <h3 className="mt-3 text-sm font-semibold text-slate-900">Broker Onboarding</h3>
          <p className="mt-2 text-sm text-slate-600">enquiries@[configure-domain].co.za</p>
        </div>
        <div className="rounded-xl border border-slate-200 p-6">
          <Phone className="h-5 w-5 text-primary-600" />
          <h3 className="mt-3 text-sm font-semibold text-slate-900">Platform Support</h3>
          <p className="mt-2 text-sm text-slate-600">[Configure phone number]</p>
        </div>
        <div className="rounded-xl border border-slate-200 p-6">
          <ShieldOff className="h-5 w-5 text-primary-600" />
          <h3 className="mt-3 text-sm font-semibold text-slate-900">Opt-Out / Data Requests</h3>
          <p className="mt-2 text-sm text-slate-600">compliance@[configure-domain].co.za</p>
        </div>
      </div>
      <p className="mt-10 max-w-2xl text-sm text-slate-500">
        Responding to an InsureLead campaign as a prospective insurance customer? Use the{" "}
        <LinkButton href="/consultation" variant="ghost" className="px-0 underline">
          consultation form
        </LinkButton>{" "}
        so we can route your enquiry correctly.
      </p>
    </Section>
  );
}
