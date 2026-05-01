import type { LucideIcon } from "lucide-react";
import clsx from "clsx";

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  Icon?: LucideIcon;
  actions?: React.ReactNode;
  className?: string;
};

export function PageHeader({ eyebrow, title, subtitle, Icon, actions, className }: PageHeaderProps) {
  return (
    <header
      className={clsx(
        "mb-6 flex flex-col gap-4 rounded-[30px] border border-blue-100/80 bg-white/75 p-4 shadow-glass backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        {Icon ? (
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-700 text-white shadow-lg shadow-blue-700/20">
            <Icon className="h-6 w-6" />
          </span>
        ) : null}
        <div className="min-w-0">
          {eyebrow ? <div className="qgyx-chip mb-1">{eyebrow}</div> : null}
          <h1 className="text-2xl font-bold tracking-normal text-app-text sm:text-3xl">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm leading-6 text-app-muted">{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
