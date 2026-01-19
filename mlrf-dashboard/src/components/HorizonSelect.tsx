import { BarChart3 } from 'lucide-react';
import { cn } from '../lib/utils';

export type ForecastHorizon = 15 | 30 | 60 | 90;

interface HorizonSelectProps {
  value: ForecastHorizon;
  onChange: (horizon: ForecastHorizon) => void;
  className?: string;
}

const HORIZON_OPTIONS: { value: ForecastHorizon; label: string }[] = [
  { value: 15, label: '15 days' },
  { value: 30, label: '30 days' },
  { value: 60, label: '60 days' },
  { value: 90, label: '90 days' },
];

/**
 * Dropdown selector for forecast horizon.
 * Allows users to select 15, 30, 60, or 90 day forecast periods.
 */
export function HorizonSelect({ value, onChange, className }: HorizonSelectProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2',
        className
      )}
    >
      <BarChart3 className="h-4 w-4 text-muted-foreground" />
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value) as ForecastHorizon)}
        className={cn(
          'bg-transparent text-sm focus:outline-none',
          'cursor-pointer appearance-none pr-6',
          'text-foreground'
        )}
        aria-label="Forecast horizon"
      >
        {HORIZON_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
