import Link from "next/link";
import { ShieldCheck } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-slate-50">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-4 lg:px-8">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600 text-white">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <span className="font-semibold text-slate-900">InsureLead Intelligence</span>
          </div>
          <p className="mt-3 max-w-xs text-sm text-slate-500">
            A B2B lead generation and campaign management platform for approved insurance brokers.
          </p>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-slate-900">Platform</h3>
          <ul className="mt-3 space-y-2 text-sm text-slate-500">
            <li><Link href="/#how-it-works" className="hover:text-primary-700">How It Works</Link></li>
            <li><Link href="/#lead-categories" className="hover:text-primary-700">Lead Categories</Link></li>
            <li><Link href="/#campaigns" className="hover:text-primary-700">Campaign Management</Link></li>
            <li><Link href="/dashboard" className="hover:text-primary-700">Broker Sign In</Link></li>
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-slate-900">Legal</h3>
          <ul className="mt-3 space-y-2 text-sm text-slate-500">
            <li><Link href="/privacy" className="hover:text-primary-700">Privacy Notice</Link></li>
            <li><Link href="/terms" className="hover:text-primary-700">Terms of Use</Link></li>
            <li><Link href="/contact" className="hover:text-primary-700">Contact Us</Link></li>
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-slate-900">Disclaimer</h3>
          <p className="mt-3 text-sm text-slate-500">
            InsureLead generates and routes consented enquiries. It does not provide insurance advice, quotations,
            premiums, or underwriting decisions. These remain the responsibility of appropriately authorised brokers.
          </p>
        </div>
      </div>
      <div className="border-t border-slate-200 py-4 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} InsureLead Intelligence. Broker lead generation and campaign platform.
      </div>
    </footer>
  );
}
