import { useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { TrendingUp, Award, ChevronDown } from 'lucide-react';
import type { ModelMetric } from '../lib/api';
import { cn, formatNumber } from '../lib/utils';

type MetricKey = 'rmsle' | 'mape' | 'rmse';

interface ModelComparisonProps {
  data: ModelMetric[];
  initialMetric?: MetricKey;
}

const metricLabels: Record<MetricKey, string> = {
  rmsle: 'RMSLE',
  mape: 'MAPE',
  rmse: 'RMSE',
};

const metricDescriptions: Record<MetricKey, string> = {
  rmsle: 'Root Mean Squared Logarithmic Error (lower is better)',
  mape: 'Mean Absolute Percentage Error (lower is better)',
  rmse: 'Root Mean Squared Error (lower is better)',
};

export function ModelComparison({
  data,
  initialMetric = 'rmsle',
}: ModelComparisonProps) {
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>(initialMetric);

  const sortedData = [...data].sort(
    (a, b) => a[selectedMetric] - b[selectedMetric]
  );

  // Theme-aware colors
  const getBarColor = (index: number) => {
    if (index === 0) return 'hsl(var(--success))'; // Best model
    if (index === sortedData.length - 1) return 'hsl(var(--destructive))'; // Worst
    return 'hsl(var(--accent))'; // Others
  };

  const bestModel = sortedData[0];
  const improvement = sortedData.length > 1
    ? ((sortedData[sortedData.length - 1][selectedMetric] - bestModel[selectedMetric]) /
        sortedData[sortedData.length - 1][selectedMetric]) *
      100
    : 0;

  return (
    <div className="space-y-5">
      {/* Header with metric selector */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold tracking-tight text-foreground">
            Model Performance
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            {metricDescriptions[selectedMetric]}
          </p>
        </div>
        <div className="relative">
          <select
            value={selectedMetric}
            onChange={(e) => setSelectedMetric(e.target.value as MetricKey)}
            className={cn(
              'appearance-none rounded-lg border border-border bg-card px-4 py-2 pr-9 text-sm font-medium',
              'text-foreground cursor-pointer',
              'focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring',
              'transition-colors duration-200'
            )}
          >
            {Object.entries(metricLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        </div>
      </div>

      {/* Chart */}
      <div className="rounded-xl border border-border/50 bg-card/30 p-4">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart
            data={sortedData}
            layout="vertical"
            margin={{ top: 5, right: 20, left: 100, bottom: 5 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              horizontal
              vertical={false}
              stroke="hsl(var(--border))"
            />
            <XAxis
              type="number"
              tickFormatter={(value) => formatNumber(value, 3)}
              fontSize={11}
              stroke="hsl(var(--muted-foreground))"
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              dataKey="model"
              type="category"
              width={95}
              fontSize={11}
              tickLine={false}
              axisLine={false}
              stroke="hsl(var(--muted-foreground))"
            />
            <Tooltip
              formatter={(value: number) => [
                formatNumber(value, 4),
                metricLabels[selectedMetric],
              ]}
              labelFormatter={(label) => `Model: ${label}`}
              contentStyle={{
                backgroundColor: 'hsl(var(--popover))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                fontSize: '12px',
                color: 'hsl(var(--popover-foreground))',
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
              }}
              cursor={{ fill: 'hsl(var(--muted) / 0.3)' }}
            />
            <Bar dataKey={selectedMetric} radius={[0, 6, 6, 0]}>
              {sortedData.map((_, index) => (
                <Cell key={`cell-${index}`} fill={getBarColor(index)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Best model highlight */}
      {bestModel && (
        <div className="rounded-xl bg-success/10 border border-success/20 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-success/20 border border-success/30">
              <Award className="h-5 w-5 text-success" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-success flex items-center gap-2">
                Best Model
                <span className="font-mono text-foreground">
                  {bestModel.model}
                </span>
              </div>
              <div className="mt-1 text-sm text-success/80">
                {metricLabels[selectedMetric]}:{' '}
                <span className="font-mono font-medium">
                  {formatNumber(bestModel[selectedMetric], 4)}
                </span>
                {improvement > 0 && (
                  <span className="ml-2 inline-flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" />
                    {formatNumber(improvement, 1)}% better than worst
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* All metrics table */}
      <div className="overflow-hidden rounded-xl border border-border">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Model
              </th>
              {Object.entries(metricLabels).map(([key, label]) => (
                <th
                  key={key}
                  className={cn(
                    'px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider transition-colors',
                    key === selectedMetric
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground'
                  )}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-card">
            {sortedData.map((model, index) => (
              <tr
                key={model.model}
                className={cn(
                  'transition-colors',
                  index === 0 && 'bg-success/5'
                )}
              >
                <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-foreground">
                  <div className="flex items-center gap-2">
                    {model.model}
                    {index === 0 && (
                      <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-success/20 text-success">
                        <Award className="h-3 w-3" />
                      </span>
                    )}
                  </div>
                </td>
                {(['rmsle', 'mape', 'rmse'] as const).map((metric) => (
                  <td
                    key={metric}
                    className={cn(
                      'whitespace-nowrap px-4 py-3 text-right text-sm font-mono transition-colors',
                      metric === selectedMetric
                        ? 'bg-primary/10 font-medium text-primary'
                        : 'text-muted-foreground'
                    )}
                  >
                    {formatNumber(model[metric], 4)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
