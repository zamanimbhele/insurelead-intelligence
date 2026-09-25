import { LinkButton } from "@/components/ui/Button";
import { ArrowRight } from "lucide-react";

export function BrokerCTA() {
  return (
    <section className="bg-primary-700 px-4 py-16 sm:px-6">
      <div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-8 lg:flex-row lg:items-center">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary-100">Build your lead pipeline</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Ready to Request Your Next Insurance Leads?
          </h2>
          <p className="mt-4 text-primary-100">
            Define the products and markets you serve, then manage campaigns, allocations, and scored leads from one workspace.
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <LinkButton href="/dashboard/campaigns" className="bg-white text-primary-700 hover:bg-primary-50">
            Request Leads <ArrowRight className="h-4 w-4" />
          </LinkButton>
          <LinkButton href="/contact#broker-enquiry" variant="secondary" className="border-white/30 bg-transparent text-white hover:bg-white/10">
            Contact the Platform Team
          </LinkButton>
        </div>
      </div>
    </section>
  );
}
