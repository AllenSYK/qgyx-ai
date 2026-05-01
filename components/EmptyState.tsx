import type { LucideIcon } from "lucide-react";

type EmptyStateProps = {
  title: string;
  description?: string;
  Icon: LucideIcon;
  action?: React.ReactNode;
};

export function EmptyState({ title, description, Icon, action }: EmptyStateProps) {
  return (
    <section className="rounded-[30px] border border-blue-100/80 bg-white/75 p-8 text-center shadow-glass backdrop-blur-xl">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
        <Icon className="h-7 w-7" />
      </div>
      <h2 className="text-xl font-bold text-app-text">{title}</h2>
      {description ? <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-app-muted">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </section>
  );
}
