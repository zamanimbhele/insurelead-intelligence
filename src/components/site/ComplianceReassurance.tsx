import { Section } from "@/components/ui/Section";
import { Lock, FileCheck, EyeOff, UserCheck } from "lucide-react";

const POINTS = [
  { icon: Lock, title: "Tenant-level access", text: "Broker organisations only access leads and campaign data allocated to their approved workspace." },
  { icon: FileCheck, title: "Consent evidence", text: "Each lead retains the consent wording, timestamp, product context, and campaign source captured at submission." },
  { icon: EyeOff, title: "No automated advice", text: "Lead scoring supports prioritisation and never replaces human advice, pricing, or underwriting decisions." },
  { icon: UserCheck, title: "Controlled allocation", text: "Product appetite, geography, capacity, and contact restrictions are respected before leads reach a broker." },
];

export function ComplianceReassurance() {
  return (
    <Section className="bg-slate-900">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-2xl font-bold text-white sm:text-3xl">Privacy and Compliance, By Design</h2>
        <p className="mt-3 text-slate-300">
          Built to support responsible lead generation from campaign response through to broker allocation and follow-up.
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
