export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`card bg-base-100 shadow-sm border border-base-300/50 animate-fade-in-up ${className}`}
    >
      <div className="card-body p-5">
        {children}
      </div>
    </div>
  );
}

export function CardTitle({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <h3 className={`text-base font-semibold text-base-content mb-3 ${className}`}>{children}</h3>;
}

export function StatCard({
  label,
  value,
  variant = "default",
  icon,
}: {
  label: string;
  value: string | number;
  variant?: "default" | "success" | "danger" | "warning";
  icon?: React.ReactNode;
}) {
  const colors = {
    default: "text-base-content",
    success: "text-success",
    danger: "text-error",
    warning: "text-warning",
  };

  const bgAccents = {
    default: "bg-primary/5",
    success: "bg-success/5",
    danger: "bg-error/5",
    warning: "bg-warning/5",
  };

  const iconBg = {
    default: "bg-primary/10 text-primary",
    success: "bg-success/10 text-success",
    danger: "bg-error/10 text-error",
    warning: "bg-warning/10 text-warning",
  };

  return (
    <div
      className={`stat-card card bg-base-100 shadow-sm border border-base-300/50 animate-fade-in-up ${bgAccents[variant]}`}
    >
      <div className="card-body p-4 gap-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-base-content/50 uppercase tracking-wider">{label}</p>
          {icon && (
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconBg[variant]}`}>
              {icon}
            </div>
          )}
        </div>
        <p className={`text-2xl font-bold tabular-nums ${colors[variant]}`}>
          {typeof value === "number" ? value.toLocaleString() : value}
        </p>
      </div>
    </div>
  );
}
