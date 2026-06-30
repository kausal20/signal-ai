// Premium skeleton loading states (shimmer). Replaces blank/loading flashes.

export function FeedCardSkeleton({ index = 0 }: { index?: number }) {
  return (
    <div className="premium-card p-5 sm:p-6 animate-fade-up" style={{ animationDelay: `${Math.min(index, 8) * 70}ms` }}>
      <div className="flex items-center gap-2 mb-4">
        <div className="skeleton h-5 w-5 rounded-md" />
        <div className="skeleton h-3 w-28" />
      </div>
      <div className="skeleton h-5 w-[85%] mb-2.5" />
      <div className="skeleton h-5 w-[60%] mb-4" />
      <div className="skeleton h-14 w-full rounded-xl mb-4" />
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <div className="skeleton h-5 w-16 rounded-full" />
          <div className="skeleton h-5 w-12 rounded-full" />
        </div>
        <div className="skeleton h-7 w-7 rounded-lg" />
      </div>
    </div>
  );
}

export function FeedSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => <FeedCardSkeleton key={i} index={i} />)}
    </div>
  );
}

export function BriefSkeleton() {
  return (
    <div className="flex gap-3 overflow-hidden pb-1">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="skeleton h-28 w-[70%] shrink-0 rounded-2xl" />
      ))}
    </div>
  );
}
