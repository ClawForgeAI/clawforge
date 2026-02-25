export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`skeleton rounded-lg ${className}`} />
  );
}

export function CardSkeleton() {
  return (
    <div className="card bg-base-100 border border-base-300/50 p-5 space-y-3">
      <div className="skeleton h-4 w-1/3" />
      <div className="skeleton h-3 w-full" />
      <div className="skeleton h-3 w-2/3" />
    </div>
  );
}

export function StatSkeleton() {
  return (
    <div className="card bg-base-100 border border-base-300/50 p-4 space-y-2">
      <div className="skeleton h-3 w-20" />
      <div className="skeleton h-7 w-16" />
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="card bg-base-100 border border-base-300/50 p-5 space-y-3">
      <div className="skeleton h-4 w-1/4 mb-2" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4">
          <div className="skeleton h-3 w-1/6" />
          <div className="skeleton h-3 w-1/4" />
          <div className="skeleton h-3 w-1/5" />
          <div className="skeleton h-3 w-1/6" />
        </div>
      ))}
    </div>
  );
}
