import Link from "next/link";
import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, AnchorHTMLAttributes } from "react";

const base =
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed";
const variants = {
  primary: "bg-primary-600 text-white hover:bg-primary-700 px-5 py-3",
  secondary: "bg-white text-primary-700 border border-primary-200 hover:bg-primary-50 px-5 py-3",
  ghost: "text-primary-700 hover:bg-primary-50 px-3 py-2",
};

export function Button({
  className,
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof variants }) {
  return <button className={cn(base, variants[variant], className)} {...props} />;
}

export function LinkButton({
  className,
  variant = "primary",
  href,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: keyof typeof variants; href: string }) {
  return <Link href={href} className={cn(base, variants[variant], className)} {...props} />;
}
