import { Section } from "@/components/ui/Section";
import { Lock, FileCheck, EyeOff, UserCheck } from "lucide-react";

const POINTS = [
  { icon: Lock, title: "Secure by design", text: "Your information is transmitted and stored securely and is never exposed in URLs, logs, or analytics tools." },
  { icon: FileCheck, title: "Clear consent", text: "We record exactly what you consented to, when, and the wording version shown to you at the time." },
  { icon: EyeOff, title: "No automated decisions", text: "No AI system makes insurance, pricing, or underwriting decisions about you. A human broker always reviews your enquiry." },
  { icon: UserCheck, title: "You're in control", text: "You can opt out of marketing or request your data be deleted at any time." },
];

export function ComplianceReassurance() {
  return (
    <Section className="bg-slate-900">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-2xl font-bold text-white sm:text-3xl">Privacy and Compliance, By Design</h2>
        <p className="mt-3 text-slate-300">
          Built to handle business insurance enquiries responsibly, from first contact through to conversion.
        </p>
      </div>
      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {POINTS.map((p) => (
          <div key={p.title} className="rounded-xl border border-white/10 bg-white/5 p-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-500/20 text-primary-300">
              <p.icon className="h-4 w-4" />
            </span>
            <h3 className="mt-3 text-sm font-semibold text-white">{p.title}</h3>
            <p className="mt-2 text-xs text-slate-400">{p.text}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}
