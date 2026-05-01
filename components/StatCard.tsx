import type { LucideIcon } from "lucide-react";
import clsx from "clsx";

type StatCardProps = {
  label: string;
  value: number | string;
  Icon: LucideIcon;
  tone?: "blue" | "cyan" | "emerald" | "rose";
  helper?: string;
};

const toneClass = {
  blue: "bg-blue-50 text-blue-700 ring-blue-100",
  cyan: "bg-cyan-50 text-cyan-700 ring-cyan-100",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  rose: "bg-rose-50 text-rose-700 ring-rose-100"
} as const;

export function StatCard({ label, value, Icon, tone = "blue", helper }: StatCardProps) {
  return (
    <article className="rounded-[26px] border border-blue-100/80 bg-white/75 p-4 shadow-[0_14px_38px_rgba(29,78,216,0.08)] backdrop-blur">
      <div className={clsx("mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl ring-1", toneClass[tone])}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="text-sm font-semibold text-app-muted">{label}</div>
      <div className="mt-1 text-3xl font-bold text-app-text">{value}</div>
      {helper ? <div className="mt-1 text-xs font-medium text-app-muted">{helper}</div> : null}
    </article>
  );
}
