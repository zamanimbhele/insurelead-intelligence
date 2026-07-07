import { cn } from "@/lib/utils";

const BAND_STYLES: Record<string, string> = {
  hot: "bg-red-50 text-red-700 border-red-200",
  warm: "bg-amber-50 text-amber-700 border-amber-200",
  nurture: "bg-blue-50 text-blue-700 border-blue-200",
  low_priority: "bg-slate-100 text-slate-600 border-slate-200",
};

const BAND_LABELS: Record<string, string> = {
  hot: "Hot",
  warm: "Warm",
  nurture: "Nurture",
  low_priority: "Low Priority",
};

export function ScoreBadge({ band, score }: { band: string; score: number }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", BAND_STYLES[band])}>
      {BAND_LABELS[band]} · {score}
    </span>
  );
}

export function StatusBadge({ status, label }: { status: string; label: string }) {
  const isTerminalGood = status === "won";
  const isTerminalBad = status === "lost" || status === "do_not_contact" || status === "archived";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        isTerminalGood && "border-green-200 bg-green-50 text-green-700",
        isTerminalBad && "border-slate-200 bg-slate-100 text-slate-600",
        !isTerminalGood && !isTerminalBad && "border-primary-200 bg-primary-50 text-primary-700"
      )}
    >
      {label}
    </span>
  );
}
