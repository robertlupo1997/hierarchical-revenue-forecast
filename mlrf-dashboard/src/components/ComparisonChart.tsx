import { useMemo } from 'react';
import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
  Legend,
  Area,
} from 'recharts';
import { format } from 'date-fns';
import { TrendingUp, TrendingDown, Equal, ArrowUpDown } from 'lucide-react';
import { cn } from '../lib/utils';

export interface ComparisonDataPoint {
  date: string;
  storeA?: number;
  storeB?: number;
  storeALower80?: number;
  storeAUpper80?: number;
  storeBLower80?: number;
  storeBUpper80?: number;
}

interface ComparisonChartProps {
  data: ComparisonDataPoint[];
  storeALabel: string;
  storeBLabel: string;
  title?: string;
  showConfidenceIntervals?: boolean;
}

interface TooltipPayload {
  dataKey: string;
  value: number;
  color: string;
  name: string;
}

function CustomTooltip({
  active,
  payload,
  label,
  storeALabel,
  storeBLabel,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
  storeALabel: string;
  storeBLabel: string;
}) {
  if (!active || !payload || !payload.length) return null;

  const formatValue = (value: number | undefined) => {
    if (value === undefined) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const storeA = payload.find((p) => p.dataKey === 'storeA')?.value;
  const storeB = payload.find((p) => p.dataKey === 'storeB')?.value;
  const delta = storeA !== undefined && storeB !== undefined ? storeA - storeB : undefined;
  const deltaPct = storeA !== undefined && storeB !== undefined && storeB !== 0
    ? ((storeA - storeB) / storeB) * 100
    : undefined;

  return (
    <div className="rounded-lg border border-border bg-popover p-3 shadow-lg">
      <p className="mb-2 text-xs font-medium text-muted-foreground">
        {label}
      </p>
      <div className="space-y-1.5">
        {storeA !== undefined && (
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-xs">
              <span className="h-2 w-2 rounded-full bg-primary" />
              {storeALabel}
            </span>
            <span className="font-mono text-sm font-medium text-foreground">
              {formatValue(storeA)}
            </span>
          </div>
        )}
        {storeB !== undefined && (
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-xs">
              <span className="h-2 w-2 rounded-full bg-accent" />
              {storeBLabel}
            </span>
            <span className="font-mono text-sm font-medium text-foreground">
              {formatValue(storeB)}
            </span>
          </div>
        )}
        {delta !== undefined && (
          <div className="mt-2 border-t border-border pt-2">
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs text-muted-foreground">Difference</span>
              <span className={cn(
                'font-mono text-sm font-medium',
                delta > 0 ? 'text-success' : delta < 0 ? 'text-destructive' : 'text-muted-foreground'
              )}>
                {delta > 0 ? '+' : ''}{formatValue(delta)}
                {deltaPct !== undefined && (
                  <span className="ml-1 text-xs">
                    ({deltaPct > 0 ? '+' : ''}{deltaPct.toFixed(1)}%)
                  </span>
                )}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function ComparisonChart({
  data,
  storeALabel,
  storeBLabel,
  title,
  showConfidenceIntervals = false,
}: ComparisonChartProps) {
  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'MMM d');
    } catch {
      return dateStr;
    }
  };

  // Calculate comparison statistics
  const stats = useMemo(() => {
    const validPoints = data.filter((d) => d.storeA !== undefined && d.storeB !== undefined);

    if (validPoints.length === 0) {
      return {
        avgA: 0,
        avgB: 0,
        totalA: 0,
        totalB: 0,
        avgDelta: 0,
        avgDeltaPct: 0,
        comparison: 'equal' as const,
      };
    }

    const sumA = validPoints.reduce((sum, p) => sum + (p.storeA ?? 0), 0);
    const sumB = validPoints.reduce((sum, p) => sum + (p.storeB ?? 0), 0);
    const avgA = sumA / validPoints.length;
    const avgB = sumB / validPoints.length;
    const avgDelta = avgA - avgB;
    const avgDeltaPct = avgB !== 0 ? ((avgA - avgB) / avgB) * 100 : 0;

    const comparison = avgDelta > 0 ? 'higher' as const : avgDelta < 0 ? 'lower' as const : 'equal' as const;

    return { avgA, avgB, totalA: sumA, totalB: sumB, avgDelta, avgDeltaPct, comparison };
  }, [data]);

  const formatCurrency = (value: number) => {
    if (Math.abs(value) >= 1_000_000) {
      return `$${(value / 1_000_000).toFixed(2)}M`;
    }
    if (Math.abs(value) >= 1_000) {
      return `$${(value / 1_000).toFixed(1)}K`;
    }
    return `$${value.toFixed(0)}`;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          {title && (
            <h3 className="text-lg font-semibold tracking-tight text-foreground">
              {title}
            </h3>
          )}
          <p className="mt-1 text-sm text-muted-foreground">
            Comparing {storeALabel} vs {storeBLabel}
          </p>
        </div>
        <div
          className={cn(
            'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
            stats.comparison === 'higher' && 'bg-success/10 text-success',
            stats.comparison === 'lower' && 'bg-destructive/10 text-destructive',
            stats.comparison === 'equal' && 'bg-muted text-muted-foreground'
          )}
        >
          {stats.comparison === 'higher' && <TrendingUp className="h-3 w-3" />}
          {stats.comparison === 'lower' && <TrendingDown className="h-3 w-3" />}
          {stats.comparison === 'equal' && <Equal className="h-3 w-3" />}
          <span>
            {stats.comparison === 'equal'
              ? 'Equal'
              : `${Math.abs(stats.avgDeltaPct).toFixed(1)}% ${stats.comparison}`}
          </span>
        </div>
      </div>

      {/* Summary Statistics */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-border bg-card/50 p-3">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-primary" />
            <span className="text-xs text-muted-foreground">{storeALabel}</span>
          </div>
          <p className="mt-1 text-lg font-semibold text-foreground">
            {formatCurrency(stats.avgA)}
          </p>
          <p className="text-xs text-muted-foreground">avg / period</p>
        </div>
        <div className="rounded-lg border border-border bg-card/50 p-3">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-accent" />
            <span className="text-xs text-muted-foreground">{storeBLabel}</span>
          </div>
          <p className="mt-1 text-lg font-semibold text-foreground">
            {formatCurrency(stats.avgB)}
          </p>
          <p className="text-xs text-muted-foreground">avg / period</p>
        </div>
        <div className="rounded-lg border border-border bg-card/50 p-3">
          <div className="flex items-center gap-1.5">
            <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Difference</span>
          </div>
          <p className={cn(
            'mt-1 text-lg font-semibold',
            stats.avgDelta > 0 ? 'text-success' : stats.avgDelta < 0 ? 'text-destructive' : 'text-foreground'
          )}>
            {stats.avgDelta > 0 ? '+' : ''}{formatCurrency(stats.avgDelta)}
          </p>
          <p className="text-xs text-muted-foreground">avg / period</p>
        </div>
        <div className="rounded-lg border border-border bg-card/50 p-3">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">% Difference</span>
          </div>
          <p className={cn(
            'mt-1 text-lg font-semibold',
            stats.avgDeltaPct > 0 ? 'text-success' : stats.avgDeltaPct < 0 ? 'text-destructive' : 'text-foreground'
          )}>
            {stats.avgDeltaPct > 0 ? '+' : ''}{stats.avgDeltaPct.toFixed(1)}%
          </p>
          <p className="text-xs text-muted-foreground">relative</p>
        </div>
      </div>

      {/* Chart */}
      <div className="chart-container">
        <ResponsiveContainer width="100%" height={350}>
          <ComposedChart
            data={data}
            margin={{ top: 20, right: 20, left: 0, bottom: 10 }}
          >
            <defs>
              <linearGradient id="storeAGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="storeBGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity={0.2} />
                <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity={0.05} />
              </linearGradient>
            </defs>

            <CartesianGrid
              strokeDasharray="3 3"
              stroke="hsl(var(--border))"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              fontSize={11}
              stroke="hsl(var(--muted-foreground))"
              tickLine={false}
              axisLine={false}
              dy={10}
            />
            <YAxis
              tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
              fontSize={11}
              stroke="hsl(var(--muted-foreground))"
              tickLine={false}
              axisLine={false}
              width={55}
              dx={-5}
            />
            <Tooltip
              content={
                <CustomTooltip
                  storeALabel={storeALabel}
                  storeBLabel={storeBLabel}
                />
              }
            />
            <Legend
              verticalAlign="top"
              height={36}
              formatter={(value: string) => (
                <span className="text-xs text-muted-foreground">{value}</span>
              )}
            />

            {/* Store A Confidence Interval */}
            {showConfidenceIntervals && (
              <Area
                type="monotone"
                dataKey="storeAUpper80"
                stroke="none"
                fill="url(#storeAGradient)"
                fillOpacity={1}
                name="Store A CI"
                legendType="none"
              />
            )}

            {/* Store B Confidence Interval */}
            {showConfidenceIntervals && (
              <Area
                type="monotone"
                dataKey="storeBUpper80"
                stroke="none"
                fill="url(#storeBGradient)"
                fillOpacity={1}
                name="Store B CI"
                legendType="none"
              />
            )}

            {/* Store A Line */}
            <Line
              type="monotone"
              dataKey="storeA"
              name={storeALabel}
              stroke="hsl(var(--primary))"
              strokeWidth={2.5}
              dot={false}
              activeDot={{
                r: 4,
                fill: 'hsl(var(--primary))',
                stroke: 'hsl(var(--card))',
                strokeWidth: 2,
              }}
            />

            {/* Store B Line */}
            <Line
              type="monotone"
              dataKey="storeB"
              name={storeBLabel}
              stroke="hsl(var(--accent))"
              strokeWidth={2.5}
              strokeDasharray="6 4"
              dot={false}
              activeDot={{
                r: 4,
                fill: 'hsl(var(--accent))',
                stroke: 'hsl(var(--card))',
                strokeWidth: 2,
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs">
        <div className="flex items-center gap-2">
          <div className="h-0.5 w-5 bg-primary" />
          <span className="text-muted-foreground">{storeALabel}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-0.5 w-5 border-t-2 border-dashed border-accent" />
          <span className="text-muted-foreground">{storeBLabel}</span>
        </div>
        {showConfidenceIntervals && (
          <>
            <div className="flex items-center gap-2">
              <div className="h-3 w-5 rounded-sm bg-primary/20" />
              <span className="text-muted-foreground">{storeALabel} CI</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-5 rounded-sm bg-accent/20" />
              <span className="text-muted-foreground">{storeBLabel} CI</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
