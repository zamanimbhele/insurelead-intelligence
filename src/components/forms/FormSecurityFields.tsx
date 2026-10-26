"use client";

import { useCallback, useState } from "react";
import { TurnstileWidget } from "./TurnstileWidget";
import { HONEYPOT_FIELD } from "@/lib/security/public-forms-shared";

// Drops into a plain server-action <form>: the Turnstile challenge (its
// token travels as "captchaToken") and a hidden honeypot field that
// people never see or fill in.
export function FormSecurityFields({ siteKey, action }: { siteKey?: string; action: "account_signup" | "password_reset" }) {
  const [token, setToken] = useState("");
  const onToken = useCallback((value: string | null) => setToken(value ?? ""), []);
  return (
    <>
      <div aria-hidden="true" className="absolute left-[-10000px] top-auto h-px w-px overflow-hidden">
        <label>
          Company website
          <input type="text" name={HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>
      {siteKey && (
        <>
          <TurnstileWidget siteKey={siteKey} onToken={onToken} resetSignal={0} action={action} />
          <input type="hidden" name="captchaToken" value={token} />
        </>
      )}
    </>
  );
}
