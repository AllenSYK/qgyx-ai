import clsx from "clsx";

type GlassCardProps = {
  children: React.ReactNode;
  className?: string;
  as?: "section" | "article" | "div";
};

export function GlassCard({ children, className, as: Component = "section" }: GlassCardProps) {
  return (
    <Component
      className={clsx(
        "rounded-[30px] border border-blue-100/80 bg-white/75 shadow-glass backdrop-blur-xl",
        className
      )}
    >
      {children}
    </Component>
  );
}
