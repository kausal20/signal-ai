import { cn } from "@/lib/utils";

const Bar = ({ className }: { className?: string }) => <div className={cn("ed-skeleton", className)} />;

/** Mirrors EditorialStory's box model so the real story swaps in with no shift. */
export function SkeletonStory({ withImage = true, className }: { withImage?: boolean; className?: string }) {
  return (
    <div className={cn("space-y-3", className)} aria-hidden="true">
      {withImage && <Bar className="aspect-[16/10] w-full rounded-xl" />}
      <Bar className="h-3 w-28" />
      <Bar className="h-8 w-full" />
      <Bar className="h-8 w-4/5" />
      <Bar className="h-4 w-full" />
      <Bar className="h-4 w-3/5" />
    </div>
  );
}

export function SkeletonRow({ numbered = false, thumb = false }: { numbered?: boolean; thumb?: boolean }) {
  return (
    <div className="flex gap-4 border-b border-ed-border py-4" aria-hidden="true">
      {numbered && <Bar className="h-6 w-7 shrink-0" />}
      <div className="min-w-0 flex-1 space-y-2.5">
        <Bar className="h-5 w-full" />
        <Bar className="h-5 w-2/3" />
        <Bar className="h-3 w-40" />
      </div>
      {thumb && <Bar className="h-16 w-16 shrink-0 rounded-md" />}
    </div>
  );
}

/** Stacked rows — used by Search results, Saved, and the Home lists. */
export function SkeletonList({ count = 5, numbered, thumb }: { count?: number; numbered?: boolean; thumb?: boolean }) {
  return (
    <div role="status" aria-label="Loading" className="border-t border-ed-border">
      {Array.from({ length: count }).map((_, i) => <SkeletonRow key={i} numbered={numbered} thumb={thumb} />)}
    </div>
  );
}

export function HomeSkeleton() {
  return (
    <div role="status" aria-label="Loading today's stories" className="pt-6">
      <Bar className="h-3 w-40" />
      <Bar className="mt-4 h-9 w-72 max-w-full" />
      <Bar className="mt-3 h-4 w-64 max-w-full" />
      <Bar className="mt-6 h-[52px] w-full rounded-xl" />
      <Bar className="mt-6 h-11 w-full" />
      <div className="mt-8 lg:grid lg:grid-cols-12 lg:gap-12">
        <SkeletonStory className="lg:col-span-7" />
        <div className="mt-10 lg:col-span-5 lg:mt-0">
          <Bar className="h-3 w-28" />
          <div className="mt-4"><SkeletonList count={4} numbered /></div>
        </div>
      </div>
    </div>
  );
}
