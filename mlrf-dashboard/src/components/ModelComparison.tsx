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
import { TrendingUp } from 'lucide-react';
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

  const getBarColor = (index: number) => {
    if (index === 0) return '#10b981'; // Best model - green
    if (index === sortedData.length - 1) return '#ef4444'; // Worst - red
    return '#3b82f6'; // Others - blue
  };

  const bestModel = sortedData[0];
  const improvement = sortedData.length > 1
    ? ((sortedData[sortedData.length - 1][selectedMetric] - bestModel[selectedMetric]) /
        sortedData[sortedData.length - 1][selectedMetric]) *
      100
    : 0;

  return (
    <div className="space-y-4">
      {/* Header with metric selector */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Model Performance</h3>
          <p className="text-sm text-gray-500">
            {metricDescriptions[selectedMetric]}
          </p>
        </div>
        <select
          value={selectedMetric}
          onChange={(e) => setSelectedMetric(e.target.value as MetricKey)}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {Object.entries(metricLabels).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={250}>
        <BarChart
          data={sortedData}
          layout="vertical"
          margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} />
          <XAxis
            type="number"
            tickFormatter={(value) => formatNumber(value, 3)}
            fontSize={11}
          />
          <YAxis
            dataKey="model"
            type="category"
            width={90}
            fontSize={11}
            tickLine={false}
          />
          <Tooltip
            formatter={(value: number) => [
              formatNumber(value, 4),
              metricLabels[selectedMetric],
            ]}
            labelFormatter={(label) => `Model: ${label}`}
            contentStyle={{
              backgroundColor: 'rgba(255,255,255,0.95)',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              fontSize: '12px',
            }}
          />
          <Bar dataKey={selectedMetric} radius={[0, 4, 4, 0]}>
            {sortedData.map((_, index) => (
              <Cell key={`cell-${index}`} fill={getBarColor(index)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Best model highlight */}
      {bestModel && (
        <div className="rounded-lg bg-green-50 p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-green-100 p-2">
              <TrendingUp className="h-4 w-4 text-green-600" />
            </div>
            <div>
              <div className="font-medium text-green-800">
                Best Model: {bestModel.model}
              </div>
              <div className="mt-1 text-sm text-green-700">
                {metricLabels[selectedMetric]}:{' '}
                {formatNumber(bestModel[selectedMetric], 4)}
                {improvement > 0 && (
                  <span className="ml-2">
                    ({formatNumber(improvement, 1)}% better than worst)
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* All metrics table */}
      <div className="overflow-hidden rounded-lg border">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">
                Model
              </th>
              {Object.entries(metricLabels).map(([key, label]) => (
                <th
                  key={key}
                  className={cn(
                    'px-4 py-2 text-right text-xs font-medium uppercase',
                    key === selectedMetric
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-500'
                  )}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {sortedData.map((model, index) => (
              <tr
                key={model.model}
                className={index === 0 ? 'bg-green-50' : undefined}
              >
                <td className="whitespace-nowrap px-4 py-2 text-sm font-medium text-gray-900">
                  {model.model}
                  {index === 0 && (
                    <span className="ml-2 text-green-600">★</span>
                  )}
                </td>
                {(['rmsle', 'mape', 'rmse'] as const).map((metric) => (
                  <td
                    key={metric}
                    className={cn(
                      'whitespace-nowrap px-4 py-2 text-right text-sm',
                      metric === selectedMetric
                        ? 'bg-blue-50 font-medium text-blue-700'
                        : 'text-gray-600'
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
