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
import { formatCurrency } from '../lib/utils';

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
}

export function ForecastChart({
  data,
  title,
  showConfidenceIntervals = true,
}: ForecastChartProps) {
  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'MMM d');
    } catch {
      return dateStr;
    }
  };

  const formatValue = (value: number | undefined) => {
    if (value === undefined) return 'N/A';
    return formatCurrency(value);
  };

  // Find the transition point between historical and forecast
  const transitionIndex = data.findIndex(
    (d) => d.actual === undefined && d.forecast !== undefined
  );
  const transitionDate =
    transitionIndex > 0 ? data[transitionIndex - 1]?.date : null;

  return (
    <div className="space-y-2">
      {title && <h3 className="font-semibold text-gray-900">{title}</h3>}

      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart
          data={data}
          margin={{ top: 10, right: 30, left: 10, bottom: 10 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            fontSize={11}
            stroke="#9ca3af"
            tickLine={false}
          />
          <YAxis
            tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
            fontSize={11}
            stroke="#9ca3af"
            tickLine={false}
            width={60}
          />
          <Tooltip
            labelFormatter={(label) => `Date: ${label}`}
            formatter={(value: number, name: string) => {
              const labels: Record<string, string> = {
                actual: 'Actual',
                forecast: 'Forecast',
                upper_95: '95% Upper',
                lower_95: '95% Lower',
                upper_80: '80% Upper',
                lower_80: '80% Lower',
              };
              return [formatValue(value), labels[name] || name];
            }}
            contentStyle={{
              backgroundColor: 'rgba(255,255,255,0.95)',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              fontSize: '12px',
            }}
          />

          {/* Transition line */}
          {transitionDate && (
            <ReferenceLine
              x={transitionDate}
              stroke="#9ca3af"
              strokeDasharray="4 4"
              label={{
                value: 'Forecast Start',
                position: 'top',
                fontSize: 10,
                fill: '#6b7280',
              }}
            />
          )}

          {/* 95% Confidence interval */}
          {showConfidenceIntervals && (
            <Area
              type="monotone"
              dataKey="upper_95"
              stroke="none"
              fill="#bfdbfe"
              fillOpacity={0.3}
            />
          )}
          {showConfidenceIntervals && (
            <Area
              type="monotone"
              dataKey="lower_95"
              stroke="none"
              fill="#ffffff"
              fillOpacity={1}
            />
          )}

          {/* 80% Confidence interval */}
          {showConfidenceIntervals && (
            <Area
              type="monotone"
              dataKey="upper_80"
              stroke="none"
              fill="#93c5fd"
              fillOpacity={0.4}
            />
          )}
          {showConfidenceIntervals && (
            <Area
              type="monotone"
              dataKey="lower_80"
              stroke="none"
              fill="#ffffff"
              fillOpacity={1}
            />
          )}

          {/* Actual values */}
          <Line
            type="monotone"
            dataKey="actual"
            stroke="#1f2937"
            strokeWidth={2}
            dot={false}
            connectNulls={false}
          />

          {/* Forecast values */}
          <Line
            type="monotone"
            dataKey="forecast"
            stroke="#3b82f6"
            strokeWidth={2}
            strokeDasharray="4 4"
            dot={false}
            connectNulls={false}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 text-xs">
        <div className="flex items-center gap-2">
          <div className="h-0.5 w-4 bg-gray-900" />
          <span>Historical</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-0.5 w-4 border-t-2 border-dashed border-blue-500" />
          <span>Forecast</span>
        </div>
        {showConfidenceIntervals && (
          <>
            <div className="flex items-center gap-2">
              <div className="h-3 w-4 rounded bg-blue-200 opacity-50" />
              <span>80% CI</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-4 rounded bg-blue-100 opacity-50" />
              <span>95% CI</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
