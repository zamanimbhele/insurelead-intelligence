// Supabase email links (confirm signup, reset password, invitation,
// change email): which kinds the app accepts, what the confirm page says,
// and where each goes afterwards.
export const EMAIL_LINK_TYPES = ["signup", "email", "recovery", "invite", "email_change"] as const;
export type EmailLinkType = (typeof EMAIL_LINK_TYPES)[number];

export function isEmailLinkType(value: string | null | undefined): value is EmailLinkType {
  return (EMAIL_LINK_TYPES as readonly string[]).includes(value ?? "");
}

export function emailLinkCopy(type: EmailLinkType): { title: string; body: string; button: string } {
  switch (type) {
    case "recovery":
      return { title: "Reset your password", body: "Continue to choose a new password for your InsureLead account.", button: "Choose a new password" };
    case "invite":
      return { title: "Accept your invitation", body: "Continue to set a password and join your team on InsureLead.", button: "Accept invitation" };
    case "email_change":
      return { title: "Confirm your new email address", body: "Confirm that this is the email address you want to use.", button: "Confirm new email" };
    default:
      return { title: "Confirm your email address", body: "Confirm your email to finish creating your InsureLead account.", button: "Confirm my email" };
  }
}

export function emailLinkDestination(type: string): string {
  if (type === "recovery") return "/reset-password";
  if (type === "invite") return "/reset-password?flow=invite";
  return "/login?message=email_confirmed";
}

export function emailLinkFailure(type: string): string {
  return type === "recovery" || type === "invite" ? "/forgot-password?error=link_expired" : "/login?error=confirmation_failed";
}
