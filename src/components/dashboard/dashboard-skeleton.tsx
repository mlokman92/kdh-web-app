import { Skeleton } from '@/components/ui/skeleton'

/**
 * First-paint placeholder. Shown once on mount only — filter changes hold the previous
 * render instead, so switching zone or period never flashes a skeleton or jumps layout.
 */
export function DashboardSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Memuatkan papan pemuka eksekutif…</span>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="size-8 rounded-lg" />
            </div>
            <Skeleton className="mt-4 h-6 w-28" />
            <Skeleton className="mt-2 h-3 w-32" />
            <Skeleton className="mt-3 h-5 w-16 rounded-md" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4 2xl:grid-cols-8">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="bg-card p-3">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-3 h-5 w-14" />
            <Skeleton className="mt-2 h-2.5 w-24" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <SkeletonCard height="h-[300px]" />
        </div>
        <SkeletonCard height="h-[300px]" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <SkeletonCard height="h-[220px]" />
        <SkeletonCard height="h-[220px]" />
        <SkeletonCard height="h-[220px]" />
      </div>
    </div>
  )
}

function SkeletonCard({ height }: { height: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2.5 border-b border-border px-4 py-3.5">
        <Skeleton className="size-7 rounded-md" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-3.5 w-40" />
          <Skeleton className="h-2.5 w-56" />
        </div>
      </div>
      <div className="p-4">
        <Skeleton className={`w-full ${height}`} />
      </div>
    </div>
  )
}
