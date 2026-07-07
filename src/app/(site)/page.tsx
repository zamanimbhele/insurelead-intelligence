import { Hero } from "@/components/site/Hero";
import { InsuranceCategories } from "@/components/site/InsuranceCategories";
import { IndustryCategories } from "@/components/site/IndustryCategories";
import { WhyReview } from "@/components/site/WhyReview";
import { Checklist } from "@/components/site/Checklist";
import { FAQSection } from "@/components/site/FAQSection";
import { ComplianceReassurance } from "@/components/site/ComplianceReassurance";

export default function HomePage() {
  return (
    <>
      <Hero />
      <InsuranceCategories />
      <IndustryCategories />
      <WhyReview />
      <Checklist />
      <FAQSection />
      <ComplianceReassurance />
    </>
  );
}
