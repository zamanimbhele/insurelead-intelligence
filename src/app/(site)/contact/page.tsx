import { Section, SectionHeading } from "@/components/ui/Section";
import { LinkButton } from "@/components/ui/Button";
import { Mail, Phone, ShieldOff } from "lucide-react";

export const metadata = { title: "Contact Us | InsureLead Intelligence" };

export default function ContactPage() {
  return (
    <Section>
      <SectionHeading eyebrow="Get In Touch" title="Contact Us" />
      <div className="mt-10 grid gap-8 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 p-6">
          <Mail className="h-5 w-5 text-primary-600" />
          <h3 className="mt-3 text-sm font-semibold text-slate-900">General Enquiries</h3>
          <p className="mt-2 text-sm text-slate-600">enquiries@[configure-domain].co.za</p>
        </div>
        <div className="rounded-xl border border-slate-200 p-6">
          <Phone className="h-5 w-5 text-primary-600" />
          <h3 className="mt-3 text-sm font-semibold text-slate-900">Broker Line</h3>
          <p className="mt-2 text-sm text-slate-600">[Configure phone number]</p>
        </div>
        <div className="rounded-xl border border-slate-200 p-6">
          <ShieldOff className="h-5 w-5 text-primary-600" />
          <h3 className="mt-3 text-sm font-semibold text-slate-900">Opt-Out / Data Requests</h3>
          <p className="mt-2 text-sm text-slate-600">compliance@[configure-domain].co.za</p>
        </div>
      </div>
      <p className="mt-10 max-w-2xl text-sm text-slate-500">
        To request a business insurance consultation, please use the{" "}
        <LinkButton href="/consultation" variant="ghost" className="px-0 underline">
          consultation form
        </LinkButton>{" "}
        so we can route your enquiry correctly.
      </p>
    </Section>
  );
}
