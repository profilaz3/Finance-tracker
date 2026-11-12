import React from 'react';
import {
  buildLinearTicks,
  buildPolylinePoints,
  describeDonutArc,
  getStackedAreaPolygons,
} from './chartPrimitives';

const DEFAULT_WIDTH = 720;
const DEFAULT_HEIGHT = 260;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const getPlot = (width: number, height: number) => ({
  width,
  height,
  top: 16,
  right: 16,
  bottom: 40,
  left: 56,
  innerWidth: width - 72,
  innerHeight: height - 56,
});

const scaleY = (value: number, min: number, max: number, height: number) => {
  const range = max - min || 1;
  const ratio = (value - min) / range;
  return height - ratio * height;
};

const scaleX = (index: number, count: number, width: number) => {
  if (count <= 1) {
    return 0;
  }

  return (width / (count - 1)) * index;
};

const resolveDomain = (values: number[], options?: { includeZero?: boolean; padRatio?: number }) => {
  const includeZero = options?.includeZero ?? true;
  const padRatio = options?.padRatio ?? 0.08;

  if (values.length === 0) {
    return { min: 0, max: 1 };
  }

  let min = Math.min(...values);
  let max = Math.max(...values);

  if (includeZero) {
    min = Math.min(min, 0);
    max = Math.max(max, 0);
  }

  if (min === max) {
    const fallback = Math.abs(min || 1);
    return { min: min - fallback * 0.5, max: max + fallback * 0.5 };
  }

  const pad = (max - min) * padRatio;
  return { min: min - pad, max: max + pad };
};

const formatSvgNumber = (value: number) => Number(value.toFixed(3));

const buildAreaPath = (points: Array<{ x: number; y: number }>, baseline: number) => {
  if (!points.length) {
    return '';
  }

  const start = points[0];
  const end = points[points.length - 1];
  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${formatSvgNumber(point.x)} ${formatSvgNumber(point.y)}`).join(' ');
  return `${line} L ${formatSvgNumber(end.x)} ${formatSvgNumber(baseline)} L ${formatSvgNumber(start.x)} ${formatSvgNumber(baseline)} Z`;
};

const buildStackedBarDomain = (rows: Array<Record<string, number>>, keys: string[]) => {
  const values: number[] = [];

  rows.forEach((row) => {
    let positive = 0;
    let negative = 0;

    keys.forEach((key) => {
      const value = row[key] ?? 0;
      if (value >= 0) {
        positive += value;
      } else {
        negative += value;
      }
    });

    values.push(positive, negative);
  });

  return resolveDomain(values, { includeZero: true, padRatio: 0.1 });
};

const ChartSurface: React.FC<{
  width?: number;
  height?: number;
  min: number;
  max: number;
  yTickFormatter?: (value: number) => string;
  xLabels: string[];
  children: (plot: ReturnType<typeof getPlot>) => React.ReactNode;
}> = ({ width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT, min, max, yTickFormatter, xLabels, children }) => {
  const plot = getPlot(width, height);
  const ticks = buildLinearTicks(min, max, 4);

  return (
    <div className="h-full w-full">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full overflow-visible" role="img" aria-hidden="true">
        <g transform={`translate(${plot.left}, ${plot.top})`}>
          {ticks.map((tick) => {
            const y = scaleY(tick, min, max, plot.innerHeight);
            return (
              <g key={tick} transform={`translate(0, ${formatSvgNumber(y)})`}>
                <line
                  x1={0}
                  x2={plot.innerWidth}
                  y1={0}
                  y2={0}
                  stroke="rgb(var(--md-sys-color-outline-variant) / 0.35)"
                  strokeDasharray="3 8"
                />
                <text
                  x={-10}
                  y={4}
                  textAnchor="end"
                  fill="rgb(var(--md-sys-color-on-surface-variant) / 0.8)"
                  fontSize="11"
                >
                  {yTickFormatter ? yTickFormatter(tick) : tick.toFixed(0)}
                </text>
              </g>
            );
          })}
          {children(plot)}
          {xLabels.map((label, index) => (
            <text
              key={`${label}-${index}`}
              x={formatSvgNumber(scaleX(index, xLabels.length, plot.innerWidth))}
              y={plot.innerHeight + 26}
              textAnchor={index === 0 ? 'start' : index === xLabels.length - 1 ? 'end' : 'middle'}
              fill="rgb(var(--md-sys-color-on-surface-variant) / 0.8)"
              fontSize="11"
            >
              {label}
            </text>
          ))}
        </g>
      </svg>
    </div>
  );
};

export const LineAreaChart: React.FC<{
  rows: Array<Record<string, number | string>>;
  labelKey: string;
  valueKey: string;
  stroke: string;
  fill: string;
  valueFormatter: (value: number) => string;
  yTickFormatter?: (value: number) => string;
  referenceLine?: { value: number; color: string; dashed?: boolean };
  includeZero?: boolean;
}> = ({
  rows,
  labelKey,
  valueKey,
  stroke,
  fill,
  valueFormatter,
  yTickFormatter,
  referenceLine,
  includeZero = true,
}) => {
  const values = rows.map((row) => Number(row[valueKey] ?? 0));
  const extraValues = referenceLine ? [...values, referenceLine.value] : values;
  const domain = resolveDomain(extraValues, { includeZero });

  return (
    <ChartSurface
      min={domain.min}
      max={domain.max}
      yTickFormatter={yTickFormatter}
      xLabels={rows.map((row) => String(row[labelKey] ?? ''))}
    >
      {(plot) => {
        const points = buildPolylinePoints(values, {
          width: plot.innerWidth,
          height: plot.innerHeight,
          min: domain.min,
          max: domain.max,
        });
        const areaPath = buildAreaPath(points, scaleY(Math.max(domain.min, includeZero ? 0 : domain.min), domain.min, domain.max, plot.innerHeight));

        return (
          <>
            {referenceLine && (
              <line
                x1={0}
                x2={plot.innerWidth}
                y1={scaleY(referenceLine.value, domain.min, domain.max, plot.innerHeight)}
                y2={scaleY(referenceLine.value, domain.min, domain.max, plot.innerHeight)}
                stroke={referenceLine.color}
                strokeDasharray={referenceLine.dashed ? '4 6' : undefined}
              />
            )}
            <path d={areaPath} fill={fill} opacity={0.18} />
            <path
              d={points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${formatSvgNumber(point.x)} ${formatSvgNumber(point.y)}`).join(' ')}
              fill="none"
              stroke={stroke}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {points.map((point, index) => (
              <g key={`${point.x}-${point.y}`}>
                <circle cx={point.x} cy={point.y} r={3.5} fill={stroke}>
                  <title>{`${rows[index][labelKey]}: ${valueFormatter(values[index])}`}</title>
                </circle>
              </g>
            ))}
          </>
        );
      }}
    </ChartSurface>
  );
};

export const GroupedBarChart: React.FC<{
  rows: Array<Record<string, number | string>>;
  labelKey: string;
  series: Array<{ key: string; label: string; color: string }>;
  valueFormatter: (value: number) => string;
  yTickFormatter?: (value: number) => string;
}> = ({ rows, labelKey, series, valueFormatter, yTickFormatter }) => {
  const values = rows.flatMap((row) => series.map((item) => Number(row[item.key] ?? 0)));
  const domain = resolveDomain(values, { includeZero: true });

  return (
    <ChartSurface
      min={domain.min}
      max={domain.max}
      yTickFormatter={yTickFormatter}
      xLabels={rows.map((row) => String(row[labelKey] ?? ''))}
    >
      {(plot) => {
        const columnWidth = rows.length > 0 ? plot.innerWidth / rows.length : plot.innerWidth;
        const groupWidth = Math.min(56, columnWidth * 0.72);
        const barWidth = Math.max(10, (groupWidth - (series.length - 1) * 8) / Math.max(series.length, 1));
        const zeroY = scaleY(0, domain.min, domain.max, plot.innerHeight);

        return (
          <>
            {rows.map((row, rowIndex) => {
              const center = scaleX(rowIndex, rows.length, plot.innerWidth);
              const startX = center - groupWidth / 2;

              return series.map((item, seriesIndex) => {
                const value = Number(row[item.key] ?? 0);
                const barHeight = Math.abs(scaleY(value, domain.min, domain.max, plot.innerHeight) - zeroY);
                const x = startX + seriesIndex * (barWidth + 8);
                const y = value >= 0 ? zeroY - barHeight : zeroY;
                const radius = 10;

                return (
                  <g key={`${String(row[labelKey])}-${item.key}`}>
                    <rect
                      x={formatSvgNumber(x)}
                      y={formatSvgNumber(y)}
                      width={formatSvgNumber(barWidth)}
                      height={formatSvgNumber(Math.max(barHeight, 1))}
                      rx={radius}
                      fill={item.color}
                      opacity={0.92}
                    >
                      <title>{`${item.label} • ${row[labelKey]}: ${valueFormatter(value)}`}</title>
                    </rect>
                  </g>
                );
              });
            })}
          </>
        );
      }}
    </ChartSurface>
  );
};

export const StackedSignedBarChart: React.FC<{
  rows: Array<Record<string, number | string>>;
  labelKey: string;
  series: Array<{ key: string; label: string; color: string }>;
  valueFormatter: (value: number) => string;
  yTickFormatter?: (value: number) => string;
}> = ({ rows, labelKey, series, valueFormatter, yTickFormatter }) => {
  const numericRows = rows.map((row) => Object.fromEntries(series.map((item) => [item.key, Number(row[item.key] ?? 0)])));
  const domain = buildStackedBarDomain(numericRows, series.map((item) => item.key));

  return (
    <ChartSurface
      min={domain.min}
      max={domain.max}
      yTickFormatter={yTickFormatter}
      xLabels={rows.map((row) => String(row[labelKey] ?? ''))}
    >
      {(plot) => {
        const zeroY = scaleY(0, domain.min, domain.max, plot.innerHeight);
        const columnWidth = rows.length > 0 ? plot.innerWidth / rows.length : plot.innerWidth;
        const barWidth = Math.min(42, columnWidth * 0.5);

        return (
          <>
            <line x1={0} x2={plot.innerWidth} y1={zeroY} y2={zeroY} stroke="rgb(var(--md-sys-color-outline) / 0.65)" strokeDasharray="4 6" />
            {rows.map((row, rowIndex) => {
              const x = scaleX(rowIndex, rows.length, plot.innerWidth) - barWidth / 2;
              let positiveStack = 0;
              let negativeStack = 0;

              return (
                <g key={String(row[labelKey])}>
                  {series.map((item) => {
                    const value = Number(row[item.key] ?? 0);
                    const start = value >= 0 ? positiveStack : negativeStack;
                    const end = start + value;
                    const y1 = scaleY(start, domain.min, domain.max, plot.innerHeight);
                    const y2 = scaleY(end, domain.min, domain.max, plot.innerHeight);
                    const y = Math.min(y1, y2);
                    const height = Math.max(Math.abs(y2 - y1), 1);

                    if (value >= 0) {
                      positiveStack = end;
                    } else {
                      negativeStack = end;
                    }

                    return (
                      <rect
                        key={`${String(row[labelKey])}-${item.key}`}
                        x={formatSvgNumber(x)}
                        y={formatSvgNumber(y)}
                        width={formatSvgNumber(barWidth)}
                        height={formatSvgNumber(height)}
                        rx={10}
                        fill={item.color}
                        opacity={0.92}
                      >
                        <title>{`${item.label} • ${row[labelKey]}: ${valueFormatter(value)}`}</title>
                      </rect>
                    );
                  })}
                </g>
              );
            })}
          </>
        );
      }}
    </ChartSurface>
  );
};

export const HorizontalBarChart: React.FC<{
  rows: Array<{ id: string; label: string; value: number; color: string }>;
  valueFormatter: (value: number) => string;
}> = ({ rows, valueFormatter }) => {
  const maxValue = Math.max(...rows.map((row) => row.value), 0);

  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const percent = maxValue > 0 ? clamp((row.value / maxValue) * 100, 0, 100) : 0;
        return (
          <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-center">
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate text-on-surface">{row.label}</span>
                <span className="font-mono text-xs text-on-surface-variant">{valueFormatter(row.value)}</span>
              </div>
              <div className="h-3 rounded-full bg-surface-container-high overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${percent}%`, minWidth: percent > 0 ? '10px' : '0px', backgroundColor: row.color }}
                  title={`${row.label}: ${valueFormatter(row.value)}`}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export const DonutChart: React.FC<{
  rows: Array<{ label: string; value: number; color: string }>;
  centerLabel?: React.ReactNode;
}> = ({ rows, centerLabel }) => {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  const cx = 120;
  const cy = 120;
  const outerRadius = 88;
  const innerRadius = 58;
  let angle = -90;

  return (
    <div className="relative h-[260px] w-full">
      <svg viewBox="0 0 240 240" className="h-full w-full" role="img" aria-hidden="true">
        <path
          d={describeDonutArc({
            cx,
            cy,
            innerRadius,
            outerRadius,
            startAngle: 0,
            endAngle: 359.999,
          })}
          fill="rgb(var(--md-sys-color-surface-container-high))"
        />
        {rows.map((row) => {
          const slice = total > 0 ? (row.value / total) * 360 : 0;
          const startAngle = angle;
          const endAngle = angle + slice;
          angle = endAngle;

          if (slice <= 0) {
            return null;
          }

          return (
            <path
              key={row.label}
              d={describeDonutArc({ cx, cy, innerRadius, outerRadius, startAngle, endAngle })}
              fill={row.color}
              stroke="rgb(var(--md-sys-color-surface))"
              strokeWidth="2"
            >
              <title>{`${row.label}: ${row.value.toFixed(2)}`}</title>
            </path>
          );
        })}
      </svg>
      {centerLabel ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          {centerLabel}
        </div>
      ) : null}
    </div>
  );
};

export const StackedAreaLineChart: React.FC<{
  rows: Array<Record<string, number | string>>;
  labelKey: string;
  areaKeys: Array<{ key: string; label: string; color: string }>;
  lineKey: string;
  lineLabel: string;
  lineColor: string;
  valueFormatter: (value: number) => string;
  yTickFormatter?: (value: number) => string;
}> = ({ rows, labelKey, areaKeys, lineKey, lineLabel, lineColor, valueFormatter, yTickFormatter }) => {
  const domains: number[] = [];

  rows.forEach((row) => {
    let positive = 0;
    let negative = 0;

    areaKeys.forEach((area) => {
      const value = Number(row[area.key] ?? 0);
      if (value >= 0) {
        positive += value;
      } else {
        negative += value;
      }
    });

    domains.push(positive, negative, Number(row[lineKey] ?? 0));
  });

  const domain = resolveDomain(domains, { includeZero: true, padRatio: 0.1 });

  return (
    <ChartSurface
      height={320}
      min={domain.min}
      max={domain.max}
      yTickFormatter={yTickFormatter}
      xLabels={rows.map((row) => String(row[labelKey] ?? ''))}
    >
      {(plot) => {
        const polygons = getStackedAreaPolygons({
          rows: rows.map((row) =>
            Object.fromEntries(areaKeys.map((area) => [area.key, Number(row[area.key] ?? 0)]))
          ),
          keys: areaKeys.map((area) => area.key),
          width: plot.innerWidth,
          height: plot.innerHeight,
          min: domain.min,
          max: domain.max,
        });
        const linePoints = buildPolylinePoints(
          rows.map((row) => Number(row[lineKey] ?? 0)),
          {
            width: plot.innerWidth,
            height: plot.innerHeight,
            min: domain.min,
            max: domain.max,
          }
        );
        const zeroY = scaleY(0, domain.min, domain.max, plot.innerHeight);

        return (
          <>
            <line x1={0} x2={plot.innerWidth} y1={zeroY} y2={zeroY} stroke="rgb(var(--md-sys-color-outline) / 0.65)" strokeDasharray="4 6" />
            {areaKeys.map((area) => (
              <path key={area.key} d={`M ${polygons[area.key]} Z`.replace('M ', 'M ')} fill={area.color} opacity={0.2}>
                <title>{area.label}</title>
              </path>
            ))}
            {areaKeys.map((area) => {
              const points = rows.map((row, index) => {
                const x = scaleX(index, rows.length, plot.innerWidth);
                const stackedValue =
                  Number(row[area.key] ?? 0) +
                  areaKeys
                    .slice(0, areaKeys.findIndex((candidate) => candidate.key === area.key))
                    .reduce((sum, candidate) => sum + Math.max(Number(row[candidate.key] ?? 0), 0), 0);
                return { x, y: scaleY(stackedValue, domain.min, domain.max, plot.innerHeight) };
              });

              return (
                <path
                  key={`${area.key}-line`}
                  d={points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${formatSvgNumber(point.x)} ${formatSvgNumber(point.y)}`).join(' ')}
                  fill="none"
                  stroke={area.color}
                  strokeWidth={1.5}
                  opacity={0.75}
                />
              );
            })}
            <path
              d={linePoints.map((point, index) => `${index === 0 ? 'M' : 'L'} ${formatSvgNumber(point.x)} ${formatSvgNumber(point.y)}`).join(' ')}
              fill="none"
              stroke={lineColor}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {linePoints.map((point, index) => (
              <circle key={`${point.x}-${point.y}`} cx={point.x} cy={point.y} r={3.5} fill={lineColor}>
                <title>{`${lineLabel} • ${rows[index][labelKey]}: ${valueFormatter(Number(rows[index][lineKey] ?? 0))}`}</title>
              </circle>
            ))}
          </>
        );
      }}
    </ChartSurface>
  );
};
