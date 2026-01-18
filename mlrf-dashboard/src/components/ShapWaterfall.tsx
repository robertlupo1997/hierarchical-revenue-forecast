import { useMemo } from 'react';
import { Group } from '@visx/group';
import { scaleBand, scaleLinear } from '@visx/scale';
import { Bar } from '@visx/shape';
import { AxisBottom, AxisLeft } from '@visx/axis';
import { useTooltip, TooltipWithBounds, defaultStyles } from '@visx/tooltip';
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

const tooltipStyles = {
  ...defaultStyles,
  backgroundColor: 'rgba(0,0,0,0.9)',
  color: 'white',
  padding: '8px 12px',
  borderRadius: '4px',
  fontSize: '12px',
};

export function ShapWaterfall({
  baseValue,
  features,
  prediction,
  width = 600,
  height = 400,
}: ShapWaterfallProps) {
  const margin = { top: 20, right: 30, bottom: 40, left: 140 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

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
        return '#ef4444'; // red - pushes prediction up
      case 'negative':
        return '#3b82f6'; // blue - pushes prediction down
      case 'base':
        return '#6b7280'; // gray
      case 'prediction':
        return '#10b981'; // green
      default:
        return '#6b7280';
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
      <svg width={width} height={height}>
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
                rx={2}
                className="cursor-pointer transition-opacity hover:opacity-80"
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
            stroke="#9ca3af"
            strokeWidth={1}
            strokeDasharray="4,4"
          />

          {/* Axes */}
          <AxisLeft
            scale={yScale}
            stroke="#e5e7eb"
            tickStroke="#e5e7eb"
            tickLabelProps={() => ({
              fontSize: 11,
              textAnchor: 'end',
              dy: '0.33em',
              fill: '#374151',
            })}
          />
          <AxisBottom
            scale={xScale}
            top={innerHeight}
            stroke="#e5e7eb"
            tickStroke="#e5e7eb"
            tickLabelProps={() => ({
              fontSize: 11,
              textAnchor: 'middle',
              fill: '#374151',
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
      <div className="mt-2 flex items-center justify-center gap-4 text-xs">
        <div className="flex items-center gap-1">
          <div className="h-3 w-3 rounded bg-gray-500" />
          <span>Base</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-3 w-3 rounded bg-red-500" />
          <span>Increases prediction</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-3 w-3 rounded bg-blue-500" />
          <span>Decreases prediction</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-3 w-3 rounded bg-green-500" />
          <span>Final</span>
        </div>
      </div>

      {/* Tooltip */}
      {tooltipOpen && tooltipData && (
        <TooltipWithBounds
          left={tooltipLeft}
          top={tooltipTop}
          style={tooltipStyles}
        >
          <div className="space-y-1">
            <div className="font-semibold">{tooltipData.name}</div>
            {tooltipData.originalFeature && (
              <div>
                Feature Value:{' '}
                {tooltipData.originalFeature.value?.toFixed(2) ?? 'N/A'}
              </div>
            )}
            <div>
              {tooltipData.direction === 'base' || tooltipData.direction === 'prediction'
                ? `Value: ${tooltipData.value.toFixed(2)}`
                : `SHAP: ${tooltipData.value > 0 ? '+' : ''}${tooltipData.value.toFixed(4)}`}
            </div>
          </div>
        </TooltipWithBounds>
      )}
    </div>
  );
}
