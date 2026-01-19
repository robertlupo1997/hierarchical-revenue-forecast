import { useState, useCallback, useMemo } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Fuel,
  Tag,
  Calendar,
  TrendingUp,
  TrendingDown,
  RotateCcw,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { fetchWhatIf } from '../lib/api';
import { cn } from '../lib/utils';

interface WhatIfAnalysisProps {
  storeNbr: number;
  family: string;
  date: string;
  horizon: number;
}

interface SliderConfig {
  key: string;
  label: string;
  icon: React.ElementType;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  format: (value: number) => string;
  isBinary?: boolean;
  isDay?: boolean;
}

const sliderConfigs: SliderConfig[] = [
  {
    key: 'oil_price',
    label: 'Oil Price',
    icon: Fuel,
    min: 0.5,
    max: 2.0,
    step: 0.1,
    defaultValue: 1.0,
    format: (v) => `${(v * 100 - 100).toFixed(0)}%`,
  },
  {
    key: 'onpromotion',
    label: 'Promotion',
    icon: Tag,
    min: 0,
    max: 1,
    step: 1,
    defaultValue: 0,
    format: (v) => (v === 1 ? 'Yes' : 'No'),
    isBinary: true,
  },
  {
    key: 'day_of_week',
    label: 'Day of Week',
    icon: Calendar,
    min: 0,
    max: 6,
    step: 1,
    defaultValue: 3,
    format: (v) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][v] || '',
    isDay: true,
  },
];

function formatCurrency(value: number): string {
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(2)}M`;
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(1)}K`;
  }
  return `$${value.toFixed(0)}`;
}

function formatDelta(value: number): string {
  const sign = value >= 0 ? '+' : '';
  if (Math.abs(value) >= 1_000_000) {
    return `${sign}$${(value / 1_000_000).toFixed(2)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${sign}$${(value / 1_000).toFixed(1)}K`;
  }
  return `${sign}$${value.toFixed(0)}`;
}

export function WhatIfAnalysis({
  storeNbr,
  family,
  date,
  horizon,
}: WhatIfAnalysisProps) {
  const [adjustments, setAdjustments] = useState<Record<string, number>>(
    () => {
      const initial: Record<string, number> = {};
      sliderConfigs.forEach((config) => {
        initial[config.key] = config.defaultValue;
      });
      return initial;
    }
  );

  // Track if user has made any changes
  const hasChanges = useMemo(() => {
    return sliderConfigs.some(
      (config) => adjustments[config.key] !== config.defaultValue
    );
  }, [adjustments]);

  const mutation = useMutation({
    mutationFn: () =>
      fetchWhatIf(storeNbr, family, date, horizon, adjustments),
  });

  const handleSliderChange = useCallback(
    (key: string, value: number) => {
      setAdjustments((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const handleReset = useCallback(() => {
    const initial: Record<string, number> = {};
    sliderConfigs.forEach((config) => {
      initial[config.key] = config.defaultValue;
    });
    setAdjustments(initial);
    mutation.reset();
  }, [mutation]);

  const handleAnalyze = useCallback(() => {
    mutation.mutate();
  }, [mutation]);

  const result = mutation.data;
  const isLoading = mutation.isPending;
  const error = mutation.error;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            What-If Analysis
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Explore how changes affect predictions
          </p>
        </div>
        <button
          onClick={handleReset}
          disabled={!hasChanges && !result}
          className={cn(
            'flex items-center gap-1.5 rounded-lg px-3 py-1.5',
            'text-sm font-medium text-muted-foreground',
            'hover:bg-secondary hover:text-foreground',
            'transition-colors duration-200',
            'disabled:opacity-50 disabled:pointer-events-none'
          )}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset
        </button>
      </div>

      {/* Sliders */}
      <div className="space-y-4">
        {sliderConfigs.map((config) => {
          const Icon = config.icon;
          const value = adjustments[config.key];
          const isDefault = value === config.defaultValue;

          return (
            <div key={config.key} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      'flex h-6 w-6 items-center justify-center rounded',
                      isDefault
                        ? 'bg-muted text-muted-foreground'
                        : 'bg-primary/10 text-primary'
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <span className="text-sm font-medium text-foreground">
                    {config.label}
                  </span>
                </div>
                <span
                  className={cn(
                    'text-sm font-mono',
                    isDefault ? 'text-muted-foreground' : 'text-primary'
                  )}
                >
                  {config.format(value)}
                </span>
              </div>

              {config.isBinary ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleSliderChange(config.key, 0)}
                    className={cn(
                      'flex-1 rounded-lg py-2 text-sm font-medium transition-all',
                      value === 0
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                    )}
                  >
                    No
                  </button>
                  <button
                    onClick={() => handleSliderChange(config.key, 1)}
                    className={cn(
                      'flex-1 rounded-lg py-2 text-sm font-medium transition-all',
                      value === 1
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                    )}
                  >
                    Yes
                  </button>
                </div>
              ) : config.isDay ? (
                <div className="flex gap-1">
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSliderChange(config.key, idx)}
                      className={cn(
                        'flex-1 rounded py-1.5 text-xs font-medium transition-all',
                        value === idx
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                      )}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="relative">
                  <input
                    type="range"
                    min={config.min}
                    max={config.max}
                    step={config.step}
                    value={value}
                    onChange={(e) =>
                      handleSliderChange(config.key, parseFloat(e.target.value))
                    }
                    className={cn(
                      'w-full h-2 rounded-full appearance-none cursor-pointer',
                      'bg-secondary',
                      '[&::-webkit-slider-thumb]:appearance-none',
                      '[&::-webkit-slider-thumb]:w-4',
                      '[&::-webkit-slider-thumb]:h-4',
                      '[&::-webkit-slider-thumb]:rounded-full',
                      '[&::-webkit-slider-thumb]:bg-primary',
                      '[&::-webkit-slider-thumb]:cursor-pointer',
                      '[&::-webkit-slider-thumb]:transition-transform',
                      '[&::-webkit-slider-thumb]:hover:scale-110',
                      '[&::-moz-range-thumb]:w-4',
                      '[&::-moz-range-thumb]:h-4',
                      '[&::-moz-range-thumb]:rounded-full',
                      '[&::-moz-range-thumb]:bg-primary',
                      '[&::-moz-range-thumb]:border-0',
                      '[&::-moz-range-thumb]:cursor-pointer'
                    )}
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>{config.format(config.min)}</span>
                    <span>{config.format(config.max)}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Analyze button */}
      <button
        onClick={handleAnalyze}
        disabled={isLoading}
        className={cn(
          'w-full rounded-lg py-2.5',
          'bg-primary text-primary-foreground',
          'text-sm font-medium',
          'transition-all duration-200',
          'hover:bg-primary/90',
          'disabled:opacity-50 disabled:pointer-events-none',
          'flex items-center justify-center gap-2'
        )}
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Analyzing...
          </>
        ) : (
          'Analyze Impact'
        )}
      </button>

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          <span>Analysis unavailable. Connect API server for results.</span>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-3 rounded-lg border border-border bg-card/50 p-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Baseline</p>
              <p className="text-lg font-semibold text-foreground">
                {formatCurrency(result.original)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Adjusted</p>
              <p className="text-lg font-semibold text-foreground">
                {formatCurrency(result.adjusted)}
              </p>
            </div>
          </div>

          <div className="border-t border-border pt-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {result.delta >= 0 ? (
                  <TrendingUp className="h-5 w-5 text-success" />
                ) : (
                  <TrendingDown className="h-5 w-5 text-destructive" />
                )}
                <span className="text-sm font-medium text-foreground">
                  Impact
                </span>
              </div>
              <div className="text-right">
                <span
                  className={cn(
                    'text-lg font-semibold',
                    result.delta >= 0 ? 'text-success' : 'text-destructive'
                  )}
                >
                  {formatDelta(result.delta)}
                </span>
                <span
                  className={cn(
                    'ml-2 text-sm',
                    result.delta_pct >= 0 ? 'text-success' : 'text-destructive'
                  )}
                >
                  ({result.delta_pct >= 0 ? '+' : ''}
                  {result.delta_pct.toFixed(1)}%)
                </span>
              </div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground text-right">
            Computed in {result.latency_ms.toFixed(1)}ms
          </p>
        </div>
      )}
    </div>
  );
}
