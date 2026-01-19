import { useMemo } from 'react';
import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
  Area,
  Legend,
} from 'recharts';
import { format } from 'date-fns';
import { Target, TrendingUp, TrendingDown } from 'lucide-react';
import { formatCurrency, cn } from '../lib/utils';
import type { AccuracyDataPoint, AccuracySummary } from '../lib/api';

interface AccuracyChartProps {
  data: AccuracyDataPoint[];
  summary: AccuracySummary;
  title?: string;
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ dataKey: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload || !payload.length) return null;

  const actual = payload.find((p) => p.dataKey === 'actual')?.value;
  const predicted = payload.find((p) => p.dataKey === 'predicted')?.value;
  const error = actual !== undefined && predicted !== undefined ? actual - predicted : undefined;
  const mapeValue = actual && predicted ? Math.abs((actual - predicted) / actual * 100) : undefined;

  return (
    <div className="rounded-lg border border-border bg-popover p-3 shadow-lg">
      <p className="mb-2 text-xs font-medium text-muted-foreground">{label}</p>
      <div className="space-y-1.5">
        {actual !== undefined && (
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs text-muted-foreground">Actual</span>
            <span className="font-mono text-sm font-medium text-success">
              {formatCurrency(actual)}
            </span>
          </div>
        )}
        {predicted !== undefined && (
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs text-muted-foreground">Predicted</span>
            <span className="font-mono text-sm font-medium text-primary">
              {formatCurrency(predicted)}
            </span>
          </div>
        )}
        {error !== undefined && (
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs text-muted-foreground">Error</span>
            <span className={cn(
              'font-mono text-sm font-medium',
              error > 0 ? 'text-destructive' : 'text-success'
            )}>
              {error > 0 ? '+' : ''}{formatCurrency(error)}
            </span>
          </div>
        )}
        {mapeValue !== undefined && (
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs text-muted-foreground">MAPE</span>
            <span className="font-mono text-xs text-muted-foreground">
              {mapeValue.toFixed(2)}%
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryStats({ summary }: { summary: AccuracySummary }) {
  const correlationColor = summary.correlation >= 0.9
    ? 'text-success'
    : summary.correlation >= 0.8
      ? 'text-warning'
      : 'text-destructive';

  return (
    <div className="flex flex-wrap gap-3 sm:gap-4 text-xs sm:text-sm">
      <div className="flex items-center gap-1.5 sm:gap-2">
        <Target className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
        <span className="text-muted-foreground">Corr:</span>
        <span className={cn('font-mono font-medium', correlationColor)}>
          {summary.correlation.toFixed(3)}
        </span>
      </div>
      <div className="flex items-center gap-1.5 sm:gap-2">
        <span className="text-muted-foreground">MAPE:</span>
        <span className="font-mono font-medium text-foreground">
          {summary.mean_mape.toFixed(2)}%
        </span>
      </div>
      <div className="flex items-center gap-1.5 sm:gap-2">
        <span className="text-muted-foreground">Points:</span>
        <span className="font-mono font-medium text-foreground">
          {summary.data_points}
        </span>
      </div>
    </div>
  );
}

export function AccuracyChart({ data, summary, title = 'Model Accuracy' }: AccuracyChartProps) {
  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'MMM d');
    } catch {
      return dateStr;
    }
  };

  // Calculate trend direction based on mean error
  const trend = useMemo(() => {
    if (summary.mean_error > 0) return 'over';
    if (summary.mean_error < 0) return 'under';
    return 'accurate';
  }, [summary.mean_error]);

  // Compute error band for visualization
  const dataWithError = useMemo(() => {
    return data.map((d) => ({
      ...d,
      errorUpper: d.predicted + Math.abs(d.error),
      errorLower: d.predicted - Math.abs(d.error),
    }));
  }, [data]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base sm:text-lg font-semibold tracking-tight text-foreground">
            {title}
          </h3>
          <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
            Predicted vs actual on validation data
          </p>
        </div>
        <div
          className={cn(
            'flex items-center gap-1.5 rounded-full px-2 sm:px-2.5 py-1 text-xs font-medium w-fit shrink-0',
            trend === 'over' && 'bg-warning/10 text-warning',
            trend === 'under' && 'bg-primary/10 text-primary',
            trend === 'accurate' && 'bg-success/10 text-success'
          )}
        >
          {trend === 'over' && <TrendingUp className="h-3 w-3" />}
          {trend === 'under' && <TrendingDown className="h-3 w-3" />}
          {trend === 'accurate' && <Target className="h-3 w-3" />}
          <span className="hidden xs:inline">
            {trend === 'over'
              ? 'Tends to underpredict'
              : trend === 'under'
                ? 'Tends to overpredict'
                : 'Well calibrated'}
          </span>
          <span className="xs:hidden">
            {trend === 'over'
              ? 'Under'
              : trend === 'under'
                ? 'Over'
                : 'Calibrated'}
          </span>
        </div>
      </div>

      {/* Summary stats */}
      <SummaryStats summary={summary} />

      {/* Chart */}
      <div className="chart-container -mx-2 sm:mx-0">
        <ResponsiveContainer width="100%" height={280} className="sm:!h-[320px]">
          <ComposedChart
            data={dataWithError}
            margin={{ top: 20, right: 20, left: 0, bottom: 10 }}
          >
            <defs>
              <linearGradient id="errorGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--destructive))" stopOpacity={0.1} />
                <stop offset="100%" stopColor="hsl(var(--destructive))" stopOpacity={0.02} />
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
            <Tooltip content={<CustomTooltip />} />
            <Legend
              verticalAlign="top"
              height={36}
              formatter={(value) => (
                <span className="text-xs text-muted-foreground">{value}</span>
              )}
            />

            {/* Error band */}
            <Area
              type="monotone"
              dataKey="error"
              stroke="none"
              fill="url(#errorGradient)"
              fillOpacity={1}
              name="Error"
            />

            {/* Actual line */}
            <Line
              type="monotone"
              dataKey="actual"
              stroke="hsl(var(--success))"
              strokeWidth={2.5}
              dot={false}
              activeDot={{
                r: 4,
                fill: 'hsl(var(--success))',
                stroke: 'hsl(var(--card))',
                strokeWidth: 2,
              }}
              name="Actual"
            />

            {/* Predicted line */}
            <Line
              type="monotone"
              dataKey="predicted"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={false}
              activeDot={{
                r: 4,
                fill: 'hsl(var(--primary))',
                stroke: 'hsl(var(--card))',
                strokeWidth: 2,
              }}
              name="Predicted"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs">
        <div className="flex items-center gap-2">
          <div className="h-0.5 w-5 bg-success" />
          <span className="text-muted-foreground">Actual</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-0.5 w-5 border-t-2 border-dashed border-primary" />
          <span className="text-muted-foreground">Predicted</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-5 rounded-sm bg-destructive/10" />
          <span className="text-muted-foreground">Error Band</span>
        </div>
      </div>
    </div>
  );
}
