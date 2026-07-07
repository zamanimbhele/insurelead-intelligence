import { Section } from "@/components/ui/Section";
import { LinkButton } from "@/components/ui/Button";
import { CheckCircle2 } from "lucide-react";

export const metadata = { title: "Thank You | InsureLead Intelligence" };

export default function ThankYouPage() {
  return (
    <Section>
      <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary-50 text-primary-600">
          <CheckCircle2 className="h-7 w-7" />
        </span>
        <h1 className="mt-6 text-2xl font-bold text-slate-900">Thank you for your enquiry</h1>
        <p className="mt-3 text-slate-600">
          We've received your business insurance consultation request. A licensed broker will review the details and
          contact you using your preferred channel, typically within 1 business day.
        </p>
        <p className="mt-3 text-sm text-slate-500">
          This confirmation does not create insurance cover, a binding quote, or advice. No details from your
          submission are shown or stored in this page's web address.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <LinkButton href="/">Return to Home</LinkButton>
          <LinkButton href="/faq" variant="secondary">Read our FAQs</LinkButton>
        </div>
      </div>
    </Section>
  );
}
