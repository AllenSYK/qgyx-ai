import clsx from "clsx";

type AppShellProps = {
  children: React.ReactNode;
  className?: string;
  wide?: boolean;
};

export function AppShell({ children, className, wide = false }: AppShellProps) {
  return (
    <main
      className={clsx(
        "mx-auto min-h-screen w-full px-4 py-5 pb-28 sm:px-6 lg:px-8",
        wide ? "max-w-7xl" : "max-w-[1100px]",
        className
      )}
    >
      {children}
    </main>
  );
}
