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
            A multi-product lead intelligence and campaign orchestration platform connecting consented enquiries
            with participating insurance brokers.
          </p>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-slate-900">Platform</h3>
          <ul className="mt-3 space-y-2 text-sm text-slate-500">
            <li><Link href="/solutions" className="hover:text-primary-700">Insurance Products</Link></li>
            <li><Link href="/industries" className="hover:text-primary-700">For Businesses</Link></li>
            <li><Link href="/consultation" className="hover:text-primary-700">Find Insurance Options</Link></li>
            <li><Link href="/faq" className="hover:text-primary-700">FAQs</Link></li>
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
            Submitting an enquiry does not create insurance cover, a binding quote, or advice of any kind. A licensed
            participating broker may contact you about the products selected. Financial services provider details
            will be shown for each participating broker once configured by an authorised administrator.
          </p>
        </div>
      </div>
      <div className="border-t border-slate-200 py-4 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} InsureLead Intelligence. Multi-broker platform pilot.
      </div>
    </footer>
  );
}
