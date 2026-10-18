import { z } from "zod";

// Password policy for /reset-password (recovery links, invite links, and
// signed-in "change password"). Length is the main control (NIST SP
// 800-63B), plus a minimal mix so a single repeated character or an
// all-digit string is rejected. Supabase's own minimum (project Auth
// settings) is enforced again server-side by updateUser().
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export const passwordUpdateSchema = z
  .object({
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`)
      .max(PASSWORD_MAX_LENGTH, `Use at most ${PASSWORD_MAX_LENGTH} characters`)
      .refine((value) => /[A-Za-z]/.test(value) && /[^A-Za-z]/.test(value), {
        message: "Include letters and at least one number or symbol",
      })
      .refine((value) => new Set(value).size >= 6, {
        message: "Use a less repetitive password",
      }),
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "The two passwords do not match",
    path: ["confirmPassword"],
  });

export function firstPasswordError(input: { password: string; confirmPassword: string }): string | null {
  const parsed = passwordUpdateSchema.safeParse(input);
  return parsed.success ? null : parsed.error.issues[0]?.message ?? "Choose a different password";
}
