import clsx from "clsx";

type PrimaryButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
};

export function PrimaryButton({ className, variant = "primary", type = "button", ...props }: PrimaryButtonProps) {
  return (
    <button
      type={type}
      className={clsx(variant === "primary" ? "qgyx-primary" : "qgyx-secondary", className)}
      {...props}
    />
  );
}
