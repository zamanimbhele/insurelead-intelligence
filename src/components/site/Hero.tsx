import { LinkButton } from "@/components/ui/Button";
import { ShieldCheck, Clock, Lock } from "lucide-react";

export function Hero() {
  return (
    <div className="relative overflow-hidden bg-slate-900">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(36,69,228,0.25),_transparent_55%)]" />
      <div className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8 lg:py-32">
        <div className="max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-slate-200">
            <ShieldCheck className="h-3.5 w-3.5" /> Compliant lead intake for business insurance brokers
          </span>
          <h1 className="mt-6 text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
            Protect Your Business With Insurance That Fits Your Needs
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-slate-300">
            Tell us about your business and the cover you're considering. A licensed broker will review your enquiry
            and get in touch to discuss your options - no obligation, no binding quote.
          </p>
          <div className="mt-10 flex flex-col gap-4 sm:flex-row">
            <LinkButton href="/consultation" className="px-6 py-3.5 text-base">
              Request a Business Insurance Consultation
            </LinkButton>
            <LinkButton href="/solutions" variant="secondary" className="bg-white/5 text-white border-white/20 hover:bg-white/10 px-6 py-3.5 text-base">
              Explore Business Insurance Solutions
            </LinkButton>
          </div>
          <div className="mt-12 flex flex-wrap gap-8 text-sm text-slate-300">
            <span className="flex items-center gap-2"><Lock className="h-4 w-4 text-primary-400" /> POPIA-aware data handling</span>
            <span className="flex items-center gap-2"><Clock className="h-4 w-4 text-primary-400" /> Typical response within 1 business day</span>
            <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary-400" /> No cover created by submitting this form</span>
          </div>
        </div>
      </div>
    </div>
  );
}
