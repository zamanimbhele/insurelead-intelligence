import { cn } from "@/lib/utils";

export function Field({
  label,
  htmlFor,
  error,
  optional,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  optional?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-slate-700">
        {label} {optional && <span className="font-normal text-slate-400">(optional)</span>}
      </label>
      {children}
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

// Field's <label htmlFor> only works when a single form control shares that
// id - for a group of radio buttons or checkboxes, pointing a <label> at an
// id nothing in the group actually has is an orphaned `for` reference: it
// looks fine visually but gives assistive tech no programmatic association
// between the group's name and its controls. A <fieldset>/<legend> is the
// correct native grouping element for exactly this case (WCAG 1.3.1 Info
// and Relationships), so radio/checkbox-group fields use this instead of
// Field - see "Who needs insurance?", "Insurance products of interest", and
// "Business cover areas" in the consultation form.
export function FieldGroup({
  legend,
  error,
  optional,
  children,
  className,
}: {
  legend: string;
  error?: string;
  optional?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <fieldset className={cn("flex flex-col gap-1.5 border-0 p-0 m-0", className)}>
      <legend className="text-sm font-medium text-slate-700">
        {legend} {optional && <span className="font-normal text-slate-400">(optional)</span>}
      </legend>
      {children}
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
    </fieldset>
  );
}

export const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500";
