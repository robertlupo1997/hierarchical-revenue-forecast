import { useMemo } from 'react';
import { Group } from '@visx/group';
import { scaleBand, scaleLinear } from '@visx/scale';
import { Bar } from '@visx/shape';
import { AxisBottom, AxisLeft } from '@visx/axis';
import { useTooltip, TooltipWithBounds } from '@visx/tooltip';
import { ArrowUp, ArrowDown, Target, Baseline } from 'lucide-react';
import type { WaterfallFeature } from '../lib/api';

interface ChartDataItem {
  name: string;
  start: number;
  end: number;
  value: number;
  direction: 'positive' | 'negative' | 'base' | 'prediction';
  originalFeature?: WaterfallFeature;
}

interface ShapWaterfallProps {
  baseValue: number;
  features: WaterfallFeature[];
  prediction: number;
  width?: number;
  height?: number;
}

export function ShapWaterfall({
  baseValue,
  features,
  prediction,
  width = 600,
  height = 400,
}: ShapWaterfallProps) {
  const margin = { top: 20, right: 30, bottom: 50, left: 140 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  // Theme-aware colors (using CSS variables, no memo needed)
  const colors = {
    positive: 'hsl(var(--destructive))', // red - pushes prediction up
    negative: 'hsl(var(--accent))', // cyan - pushes prediction down
    base: 'hsl(var(--muted-foreground))', // gray
    prediction: 'hsl(var(--success))', // green
    axis: 'hsl(var(--border))',
    text: 'hsl(var(--muted-foreground))',
    zeroLine: 'hsl(var(--muted-foreground))',
  };

  const {
    tooltipOpen,
    tooltipData,
    tooltipLeft,
    tooltipTop,
    showTooltip,
    hideTooltip,
  } = useTooltip<ChartDataItem>();

  const chartData = useMemo(() => {
    const data: ChartDataItem[] = [];

    // Base value bar
    data.push({
      name: 'Base Value',
      start: 0,
      end: baseValue,
      value: baseValue,
      direction: 'base',
    });

    // Feature contributions
    let cumulative = baseValue;
    for (const f of features) {
      const start = cumulative;
      cumulative += f.shap_value;
      data.push({
        name: f.name,
        start: Math.min(start, cumulative),
        end: Math.max(start, cumulative),
        value: f.shap_value,
        direction: f.direction,
        originalFeature: f,
      });
    }

    // Final prediction
    data.push({
      name: 'Prediction',
      start: 0,
      end: prediction,
      value: prediction,
      direction: 'prediction',
    });

    return data;
  }, [baseValue, features, prediction]);

  const yScale = scaleBand({
    domain: chartData.map((d) => d.name),
    range: [0, innerHeight],
    padding: 0.3,
  });

  const xMin = Math.min(...chartData.map((d) => Math.min(d.start, d.end)), 0);
  const xMax = Math.max(...chartData.map((d) => Math.max(d.start, d.end)));
  const xPadding = Math.abs(xMax - xMin) * 0.1;

  const xScale = scaleLinear({
    domain: [xMin - xPadding, xMax + xPadding],
    range: [0, innerWidth],
    nice: true,
  });

  const getBarColor = (direction: string) => {
    switch (direction) {
      case 'positive':
        return colors.positive;
      case 'negative':
        return colors.negative;
      case 'base':
        return colors.base;
      case 'prediction':
        return colors.prediction;
      default:
        return colors.base;
    }
  };

  const handleMouseEnter = (
    event: React.MouseEvent<SVGRectElement>,
    datum: ChartDataItem
  ) => {
    const coords = { x: event.clientX, y: event.clientY };
    showTooltip({
      tooltipData: datum,
      tooltipLeft: coords.x,
      tooltipTop: coords.y,
    });
  };

  return (
    <div className="relative">
      <svg width={width} height={height} className="overflow-visible">
        <Group left={margin.left} top={margin.top}>
          {/* Bars */}
          {chartData.map((d) => {
            const barY = yScale(d.name) ?? 0;
            const barHeight = yScale.bandwidth();
            const x1 = xScale(d.start);
            const x2 = xScale(d.end);
            const barX = Math.min(x1, x2);
            const barWidth = Math.abs(x2 - x1);

            return (
              <Bar
                key={d.name}
                x={barX}
                y={barY}
                width={Math.max(barWidth, 1)}
                height={barHeight}
                fill={getBarColor(d.direction)}
                rx={4}
                className="cursor-pointer transition-all duration-150 hover:opacity-80"
                style={{
                  filter: tooltipData?.name === d.name ? 'brightness(1.1)' : undefined,
                }}
                onMouseEnter={(e) => handleMouseEnter(e, d)}
                onMouseLeave={hideTooltip}
              />
            );
          })}

          {/* Zero line */}
          <line
            x1={xScale(0)}
            x2={xScale(0)}
            y1={0}
            y2={innerHeight}
            stroke={colors.zeroLine}
            strokeWidth={1}
            strokeDasharray="4,4"
            strokeOpacity={0.5}
          />

          {/* Axes */}
          <AxisLeft
            scale={yScale}
            stroke={colors.axis}
            tickStroke={colors.axis}
            tickLabelProps={() => ({
              fontSize: 11,
              textAnchor: 'end',
              dy: '0.33em',
              fill: colors.text,
              fontFamily: 'inherit',
            })}
          />
          <AxisBottom
            scale={xScale}
            top={innerHeight}
            stroke={colors.axis}
            tickStroke={colors.axis}
            tickLabelProps={() => ({
              fontSize: 11,
              textAnchor: 'middle',
              fill: colors.text,
              fontFamily: 'var(--font-mono, ui-monospace)',
            })}
            tickFormat={(value) => {
              const num = value as number;
              if (Math.abs(num) >= 1000) {
                return `${(num / 1000).toFixed(1)}k`;
              }
              return num.toFixed(0);
            }}
          />
        </Group>
      </svg>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="flex h-5 w-5 items-center justify-center rounded bg-muted-foreground/20">
            <Baseline className="h-3 w-3 text-muted-foreground" />
          </div>
          <span>Base</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex h-5 w-5 items-center justify-center rounded bg-destructive/20">
            <ArrowUp className="h-3 w-3 text-destructive" />
          </div>
          <span>Increases prediction</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex h-5 w-5 items-center justify-center rounded bg-accent/20">
            <ArrowDown className="h-3 w-3 text-accent" />
          </div>
          <span>Decreases prediction</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex h-5 w-5 items-center justify-center rounded bg-success/20">
            <Target className="h-3 w-3 text-success" />
          </div>
          <span>Final</span>
        </div>
      </div>

      {/* Tooltip */}
      {tooltipOpen && tooltipData && (
        <TooltipWithBounds
          left={tooltipLeft}
          top={tooltipTop}
          style={{
            position: 'absolute',
            backgroundColor: 'hsl(var(--popover))',
            color: 'hsl(var(--popover-foreground))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '8px',
            padding: '10px 14px',
            fontSize: '12px',
            boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
            zIndex: 50,
          }}
        >
          <div className="space-y-1.5">
            <div className="font-semibold text-foreground">{tooltipData.name}</div>
            {tooltipData.originalFeature && (
              <div className="text-muted-foreground">
                Feature Value:{' '}
                <span className="font-mono font-medium text-foreground">
                  {tooltipData.originalFeature.value?.toFixed(2) ?? 'N/A'}
                </span>
              </div>
            )}
            <div className="text-muted-foreground">
              {tooltipData.direction === 'base' || tooltipData.direction === 'prediction' ? (
                <>
                  Value:{' '}
                  <span className="font-mono font-medium text-foreground">
                    {tooltipData.value.toFixed(2)}
                  </span>
                </>
              ) : (
                <>
                  SHAP:{' '}
                  <span className={`font-mono font-medium ${
                    tooltipData.value > 0 ? 'text-destructive' : 'text-accent'
                  }`}>
                    {tooltipData.value > 0 ? '+' : ''}{tooltipData.value.toFixed(4)}
                  </span>
                </>
              )}
            </div>
          </div>
        </TooltipWithBounds>
      )}
    </div>
  );
}
