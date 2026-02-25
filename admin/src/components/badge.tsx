export function Badge({
  children,
  variant = "default",
  size = "sm",
}: {
  children: React.ReactNode;
  variant?: "default" | "success" | "danger" | "warning" | "info";
  size?: "xs" | "sm";
}) {
  const styles = {
    default: "badge-ghost",
    success: "badge-success text-success-content",
    danger: "badge-error text-error-content",
    warning: "badge-warning text-warning-content",
    info: "badge-info text-info-content",
  };

  const sizes = {
    xs: "badge-xs text-[10px] px-1.5",
    sm: "badge-sm text-xs px-2",
  };

  return (
    <span className={`badge font-medium gap-1 ${styles[variant]} ${sizes[size]}`}>
      {children}
    </span>
  );
}
