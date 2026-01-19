import { useMemo } from 'react';
import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  ComposedChart,
  ReferenceLine,
} from 'recharts';
import { format } from 'date-fns';
import { TrendingUp, TrendingDown, Activity, Download } from 'lucide-react';
import { formatCurrency, cn } from '../lib/utils';

export interface ForecastDataPoint {
  date: string;
  actual?: number;
  forecast?: number;
  lower_80?: number;
  upper_80?: number;
  lower_95?: number;
  upper_95?: number;
}

interface ForecastChartProps {
  data: ForecastDataPoint[];
  title?: string;
  showConfidenceIntervals?: boolean;
  onExport?: () => void;
  exportEnabled?: boolean;
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

  const formatValue = (value: number | undefined) => {
    if (value === undefined) return 'N/A';
    return formatCurrency(value);
  };

  const actual = payload.find((p) => p.dataKey === 'actual')?.value;
  const forecast = payload.find((p) => p.dataKey === 'forecast')?.value;
  const upper95 = payload.find((p) => p.dataKey === 'upper_95')?.value;
  const lower95 = payload.find((p) => p.dataKey === 'lower_95')?.value;

  return (
    <div className="rounded-lg border border-border bg-popover p-3 shadow-lg">
      <p className="mb-2 text-xs font-medium text-muted-foreground">
        {label}
      </p>
      <div className="space-y-1.5">
        {actual !== undefined && (
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs text-muted-foreground">Actual</span>
            <span className="font-mono text-sm font-medium text-foreground">
              {formatValue(actual)}
            </span>
          </div>
        )}
        {forecast !== undefined && (
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs text-muted-foreground">Forecast</span>
            <span className="font-mono text-sm font-medium text-primary">
              {formatValue(forecast)}
            </span>
          </div>
        )}
        {upper95 !== undefined && lower95 !== undefined && (
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs text-muted-foreground">95% CI</span>
            <span className="font-mono text-xs text-muted-foreground">
              {formatValue(lower95)} - {formatValue(upper95)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export function ForecastChart({
  data,
  title,
  showConfidenceIntervals = true,
  onExport,
  exportEnabled = false,
}: ForecastChartProps) {
  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'MMM d');
    } catch {
      return dateStr;
    }
  };

  // Calculate statistics
  const stats = useMemo(() => {
    const actuals = data.filter((d) => d.actual !== undefined).map((d) => d.actual!);
    const forecasts = data.filter((d) => d.forecast !== undefined).map((d) => d.forecast!);

    const avgActual = actuals.length > 0
      ? actuals.reduce((a, b) => a + b, 0) / actuals.length
      : 0;
    const avgForecast = forecasts.length > 0
      ? forecasts.reduce((a, b) => a + b, 0) / forecasts.length
      : 0;

    const trend = avgForecast > avgActual ? 'up' : avgForecast < avgActual ? 'down' : 'stable';
    const trendPercent = avgActual > 0
      ? Math.abs(((avgForecast - avgActual) / avgActual) * 100)
      : 0;

    return { avgActual, avgForecast, trend, trendPercent };
  }, [data]);

  // Find the transition point between historical and forecast
  const transitionIndex = data.findIndex(
    (d) => d.actual === undefined && d.forecast !== undefined
  );
  const transitionDate =
    transitionIndex > 0 ? data[transitionIndex - 1]?.date : null;

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
        </div>
        <div className="flex items-center gap-2">
          <div
            className={cn(
              'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
              stats.trend === 'up' && 'bg-success/10 text-success',
              stats.trend === 'down' && 'bg-destructive/10 text-destructive',
              stats.trend === 'stable' && 'bg-muted text-muted-foreground'
            )}
          >
            {stats.trend === 'up' && <TrendingUp className="h-3 w-3" />}
            {stats.trend === 'down' && <TrendingDown className="h-3 w-3" />}
            {stats.trend === 'stable' && <Activity className="h-3 w-3" />}
            <span>
              {stats.trend === 'stable'
                ? 'Stable'
                : `${stats.trendPercent.toFixed(1)}% ${stats.trend}`}
            </span>
          </div>
          {onExport && (
            <button
              onClick={onExport}
              disabled={!exportEnabled}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5',
                'text-xs font-medium',
                'bg-secondary text-secondary-foreground',
                'transition-all duration-200',
                'hover:bg-secondary/80',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
              title={exportEnabled ? 'Export to CSV' : 'No data to export'}
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export</span>
            </button>
          )}
        </div>
      </div>

      {/* Chart */}
      <div className="chart-container">
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart
            data={data}
            margin={{ top: 20, right: 20, left: 0, bottom: 10 }}
          >
            <defs>
              <linearGradient id="ci95Gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.15} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="ci80Gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.1} />
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

            {/* Transition line */}
            {transitionDate && (
              <ReferenceLine
                x={transitionDate}
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="4 4"
                strokeOpacity={0.5}
                label={{
                  value: 'Forecast',
                  position: 'insideTopRight',
                  fontSize: 10,
                  fill: 'hsl(var(--muted-foreground))',
                  dy: -5,
                }}
              />
            )}

            {/* 95% Confidence interval */}
            {showConfidenceIntervals && (
              <>
                <Area
                  type="monotone"
                  dataKey="upper_95"
                  stroke="none"
                  fill="url(#ci95Gradient)"
                  fillOpacity={1}
                />
                <Area
                  type="monotone"
                  dataKey="lower_95"
                  stroke="none"
                  fill="hsl(var(--card))"
                  fillOpacity={1}
                />
              </>
            )}

            {/* 80% Confidence interval */}
            {showConfidenceIntervals && (
              <>
                <Area
                  type="monotone"
                  dataKey="upper_80"
                  stroke="none"
                  fill="url(#ci80Gradient)"
                  fillOpacity={1}
                />
                <Area
                  type="monotone"
                  dataKey="lower_80"
                  stroke="none"
                  fill="hsl(var(--card))"
                  fillOpacity={1}
                />
              </>
            )}

            {/* Actual values */}
            <Line
              type="monotone"
              dataKey="actual"
              stroke="hsl(var(--foreground))"
              strokeWidth={2}
              dot={false}
              connectNulls={false}
              activeDot={{
                r: 4,
                fill: 'hsl(var(--foreground))',
                stroke: 'hsl(var(--card))',
                strokeWidth: 2,
              }}
            />

            {/* Forecast values */}
            <Line
              type="monotone"
              dataKey="forecast"
              stroke="hsl(var(--primary))"
              strokeWidth={2.5}
              strokeDasharray="6 4"
              dot={false}
              connectNulls={false}
              activeDot={{
                r: 4,
                fill: 'hsl(var(--primary))',
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
          <div className="h-0.5 w-5 bg-foreground" />
          <span className="text-muted-foreground">Historical</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-0.5 w-5 border-t-2 border-dashed border-primary" />
          <span className="text-muted-foreground">Forecast</span>
        </div>
        {showConfidenceIntervals && (
          <>
            <div className="flex items-center gap-2">
              <div className="h-3 w-5 rounded-sm bg-primary/30" />
              <span className="text-muted-foreground">80% CI</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-5 rounded-sm bg-primary/15" />
              <span className="text-muted-foreground">95% CI</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
