import { redirect } from "next/navigation";

// "Insurance Review Request" routes into the same compliant consultation
// flow, pre-framed as a review rather than a new enquiry.
export default function ReviewRequestPage() {
  redirect("/consultation?intent=review");
}
