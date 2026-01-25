import { cn } from '../lib/utils';

interface SkeletonProps {
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Base skeleton component for loading states.
 * Uses CSS animation for a subtle shimmer effect.
 */
export function Skeleton({ className, style }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-muted',
        className
      )}
      style={style}
    />
  );
}

/**
 * Skeleton for KPI stat cards shown at the top of the dashboard.
 */
export function StatCardSkeleton() {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <Skeleton className="h-10 w-10 rounded-lg" />
        <Skeleton className="h-5 w-12 rounded-full" />
      </div>
      <div className="mt-4 space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-3 w-20" />
      </div>
    </div>
  );
}

/**
 * Skeleton for chart containers.
 */
export function ChartSkeleton({ className }: SkeletonProps) {
  return (
    <div className={cn('space-y-4', className)}>
      {/* Chart header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-28" />
        </div>
        <Skeleton className="h-8 w-20 rounded-lg" />
      </div>
      {/* Chart area */}
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  );
}

/**
 * Skeleton for the SHAP waterfall chart.
 */
export function WaterfallSkeleton() {
  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="space-y-2">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-8 w-16 rounded-lg" />
      </div>
      {/* Waterfall bars */}
      {[...Array(8)].map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton
            className="h-6 rounded"
            style={{ width: `${Math.random() * 40 + 20}%` }}
          />
        </div>
      ))}
    </div>
  );
}

/**
 * Skeleton for hierarchy tree nodes.
 */
export function HierarchySkeleton() {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
      </div>
      {/* Tree structure */}
      <div className="space-y-2">
        {/* Root node */}
        <Skeleton className="h-12 w-full rounded-lg" />
        {/* Child nodes */}
        <div className="ml-6 space-y-2">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Skeleton for model comparison table/chart.
 */
export function ModelComparisonSkeleton() {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-4 w-48" />
      </div>
      {/* Table rows */}
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Generic loading skeleton with customizable content.
 */
export function LoadingSkeleton({ className }: SkeletonProps) {
  return (
    <div className={cn('space-y-3', className)}>
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}
