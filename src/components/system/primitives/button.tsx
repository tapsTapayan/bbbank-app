import { clsx } from "clsx";

type ButtonVariant =
  | "primary"
  | "secondary"
  | "soft"
  | "vault"
  | "ghost"
  | "success"
  | "danger"
  | "danger-outline"
  | "ink";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  block?: boolean;
};

const VARIANT: Record<ButtonVariant, string> = {
  primary: "rl-btn-primary",
  secondary: "rl-btn-secondary",
  soft: "rl-btn-soft",
  vault: "rl-btn-vault",
  ghost: "rl-btn-ghost",
  success: "rl-btn-success",
  danger: "rl-btn-danger",
  "danger-outline": "rl-btn-danger-outline",
  ink: "rl-btn-ink",
};

export function Button({
  variant = "primary",
  size = "md",
  block,
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={clsx(
        "rl-btn",
        VARIANT[variant],
        size === "sm" && "rl-btn-sm",
        size === "lg" && "rl-btn-lg",
        block && "rl-btn-block",
        className,
      )}
      {...props}
    />
  );
}
