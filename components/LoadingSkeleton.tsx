import clsx from "clsx";

export function LoadingSkeleton({ className }: { className?: string }) {
  return (
    <div className={clsx("animate-pulse rounded-2xl bg-blue-100/70", className)} />
  );
}
