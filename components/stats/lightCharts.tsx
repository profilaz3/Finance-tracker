import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { formatNumber } from '../../utils/locale';
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
  // Keep a zero baseline at zero: all-positive data never shows a negative tick (and vice versa).
  return {
    min: includeZero && min === 0 ? 0 : min - pad,
    max: includeZero && max === 0 ? 0 : max + pad,
  };
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

/** Pixel size of the chart box, so the SVG draws 1:1 and 11px labels stay 11px on a phone. */
const useBoxSize = () => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () => {
      const rect = node.getBoundingClientRect();
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);
      if (width <= 0 || height <= 0) return;
      setSize(prev => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
    };
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return [ref, size] as const;
};

/** One value under the finger, and one cell of the screen-reader table. */
interface ReadoutItem {
  label: string;
  value: string;
  color: string;
}

/** The chart as data: the readout and the visually hidden table read from it. */
interface ChartData {
  /** Accessible name; also the hidden table's caption. */
  ariaLabel?: string;
  /** Values for the x position at `index`, in series order. */
  itemsAt: (index: number) => ReadoutItem[];
}

/**
 * Touch and screen-reader access to the values, which otherwise live only in the drawing:
 * tap (or drag across, or hover with a mouse) to see the values at a position; a visually hidden
 * table lists every value. Same pattern as the rates chart's scrub readout.
 */
const useChartReadout = (count: number) => {
  const [active, setActive] = useState<number | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  // A readout from a tap stays until the next tap elsewhere.
  useEffect(() => {
    if (active === null) return;
    const clear = (event: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setActive(null);
    };
    document.addEventListener('pointerdown', clear);
    return () => document.removeEventListener('pointerdown', clear);
  }, [active]);

  useEffect(() => {
    setActive(prev => (prev !== null && prev >= count ? null : prev));
  }, [count]);

  return { active, setActive, boxRef };
};

const ChartSurface: React.FC<{
  width?: number;
  height?: number;
  min: number;
  max: number;
  yTickFormatter?: (value: number) => string;
  xLabels: string[];
  data?: ChartData;
  children: (plot: ReturnType<typeof getPlot>) => React.ReactNode;
}> = ({ width: fallbackWidth = DEFAULT_WIDTH, height: fallbackHeight = DEFAULT_HEIGHT, min, max, yTickFormatter, xLabels, data, children }) => {
  const [sizeRef, box] = useBoxSize();
  const { active, setActive, boxRef } = useChartReadout(xLabels.length);
  const width = box?.width ?? fallbackWidth;
  const height = box?.height ?? fallbackHeight;
  const plot = getPlot(width, height);
  const count = xLabels.length;
  const setBoxRef = (node: HTMLDivElement | null) => {
    sizeRef.current = node;
    boxRef.current = node;
  };
  // The SVG is drawn 1:1 with its box, so client x maps straight onto the plot.
  const pick = (clientX: number, element: HTMLElement) => {
    if (!data || count === 0) return;
    const x = clientX - element.getBoundingClientRect().left - plot.left;
    const index = count <= 1 ? 0 : Math.round(x / (plot.innerWidth / (count - 1)));
    setActive(clamp(index, 0, count - 1));
  };
  const activeX = active !== null ? scaleX(active, count, plot.innerWidth) : 0;
  const columnWidth = Math.min(48, plot.innerWidth / Math.max(count, 1));
  const columnX = clamp(activeX - columnWidth / 2, 0, Math.max(0, plot.innerWidth - columnWidth));
  const activeItems = active !== null && data ? data.itemsAt(active) : [];
  const ticks = buildLinearTicks(min, max, 4);
  // Thin the x labels so they never collide on a narrow phone chart (~64px per label).
  const lastIndex = xLabels.length - 1;
  const labelStep = Math.max(1, Math.ceil(xLabels.length / Math.max(2, Math.floor(plot.innerWidth / 64))));
  const showXLabel = (index: number) => (
    index % labelStep === 0
      ? index === lastIndex || lastIndex - index >= labelStep / 2 || lastIndex % labelStep === 0
      : index === lastIndex
  );

  return (
    <div
      ref={setBoxRef}
      className="relative h-full w-full touch-pan-y"
      data-no-swipe
      onPointerDown={data ? event => pick(event.clientX, event.currentTarget) : undefined}
      onPointerMove={data ? event => {
        if (event.pointerType === 'mouse' || event.buttons > 0) pick(event.clientX, event.currentTarget);
      } : undefined}
      onPointerLeave={data ? event => {
        if (event.pointerType === 'mouse') setActive(null);
      } : undefined}
    >
      <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full overflow-visible" role="img" aria-hidden="true">
        <g transform={`translate(${plot.left}, ${plot.top})`}>
          {active !== null && (
            <rect
              x={formatSvgNumber(columnX)}
              y={0}
              width={formatSvgNumber(columnWidth)}
              height={formatSvgNumber(plot.innerHeight)}
              rx={8}
              fill="var(--paper-chip, rgb(var(--md-sys-color-surface-container-high)))"
            />
          )}
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
            !showXLabel(index) ? null :
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
      {active !== null && activeItems.length > 0 && (
        <div
          aria-hidden="true"
          data-chart-readout
          className="pointer-events-none absolute top-0 z-[1] flex -translate-x-1/2 flex-col gap-0.5 whitespace-nowrap rounded-[14px] bg-on-surface px-2.5 py-1.5 text-[12px] font-semibold tabular-nums text-surface shadow-md"
          style={{ left: `clamp(84px, ${plot.left + activeX}px, calc(100% - 84px))` }}
        >
          <span className="opacity-70">{xLabels[active]}</span>
          {activeItems.map(item => (
            <span key={item.label || 'value'} className="flex items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: item.color }} />
              {item.label && <span className="font-medium opacity-80">{item.label}</span>}
              <span>{item.value}</span>
            </span>
          ))}
        </div>
      )}
      {data && count > 0 && (
        // A table ignores width: 1px, so the wrapper is what hides and clips it.
        <div className="sr-only">
          <table>
            {data.ariaLabel && <caption>{data.ariaLabel}</caption>}
            <tbody>
              {xLabels.map((label, index) => (
                <tr key={`${label}-${index}`}>
                  <th scope="row">{label}</th>
                  {data.itemsAt(index).map(item => (
                    <td key={item.label || 'value'}>{item.label ? `${item.label}: ${item.value}` : item.value}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
  /** Names the chart for screen readers (caption of the hidden value table). */
  ariaLabel?: string;
  /** What the values are ("Expense"), shown in the tap readout. */
  seriesLabel?: string;
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
  ariaLabel,
  seriesLabel = '',
}) => {
  const values = rows.map((row) => Number(row[valueKey] ?? 0));
  const extraValues = referenceLine ? [...values, referenceLine.value] : values;
  const domain = resolveDomain(extraValues, { includeZero });
  const gradientId = `area-${React.useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  // Every point gets a dot on short series; long ones only mark the latest value.
  const dotAll = rows.length <= 12;

  return (
    <ChartSurface
      min={domain.min}
      max={domain.max}
      yTickFormatter={yTickFormatter}
      xLabels={rows.map((row) => String(row[labelKey] ?? ''))}
      data={{ ariaLabel, itemsAt: index => [{ label: seriesLabel, value: valueFormatter(values[index] ?? 0), color: stroke }] }}
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
            <defs>
              <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={fill} stopOpacity={0.34} />
                <stop offset="100%" stopColor={fill} stopOpacity={0} />
              </linearGradient>
            </defs>
            <path d={areaPath} fill={`url(#${gradientId})`} />
            <path
              d={points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${formatSvgNumber(point.x)} ${formatSvgNumber(point.y)}`).join(' ')}
              fill="none"
              stroke={stroke}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {points.map((point, index) => {
              const last = index === points.length - 1;
              return (
                <g key={`${point.x}-${point.y}`}>
                  {last && <circle cx={point.x} cy={point.y} r={7} fill={stroke} opacity={0.18} />}
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={last ? 4 : dotAll ? 3 : 6}
                    fill={dotAll || last ? stroke : 'transparent'}
                    stroke={dotAll || last ? 'var(--paper-tile, rgb(var(--md-sys-color-surface)))' : 'none'}
                    strokeWidth={dotAll || last ? 1.5 : 0}
                  >
                    <title>{`${rows[index][labelKey]}: ${valueFormatter(values[index])}`}</title>
                  </circle>
                </g>
              );
            })}
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
  ariaLabel?: string;
}> = ({ rows, labelKey, series, valueFormatter, yTickFormatter, ariaLabel }) => {
  const values = rows.flatMap((row) => series.map((item) => Number(row[item.key] ?? 0)));
  const domain = resolveDomain(values, { includeZero: true });

  return (
    <ChartSurface
      min={domain.min}
      max={domain.max}
      yTickFormatter={yTickFormatter}
      xLabels={rows.map((row) => String(row[labelKey] ?? ''))}
      data={{
        ariaLabel,
        itemsAt: index => series.map(item => ({ label: item.label, value: valueFormatter(Number(rows[index]?.[item.key] ?? 0)), color: item.color })),
      }}
    >
      {(plot) => {
        const columnWidth = rows.length > 0 ? plot.innerWidth / rows.length : plot.innerWidth;
        // Slim bars with a small gap read better than wide blocks on a phone.
        const barGap = 3;
        const groupWidth = Math.min(36, columnWidth * 0.6);
        const barWidth = Math.max(5, (groupWidth - (series.length - 1) * barGap) / Math.max(series.length, 1));
        const zeroY = scaleY(0, domain.min, domain.max, plot.innerHeight);

        return (
          <>
            {rows.map((row, rowIndex) => {
              const center = scaleX(rowIndex, rows.length, plot.innerWidth);
              // Keep edge groups inside the plot so they never sit under the y-axis labels.
              const startX = clamp(center - groupWidth / 2, 0, Math.max(0, plot.innerWidth - groupWidth));

              return series.map((item, seriesIndex) => {
                const value = Number(row[item.key] ?? 0);
                const barHeight = Math.abs(scaleY(value, domain.min, domain.max, plot.innerHeight) - zeroY);
                const x = startX + seriesIndex * (barWidth + barGap);
                const y = value >= 0 ? zeroY - barHeight : zeroY;
                const radius = Math.min(6, barWidth / 2);

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
  ariaLabel?: string;
}> = ({ rows, labelKey, series, valueFormatter, yTickFormatter, ariaLabel }) => {
  const numericRows = rows.map((row) => Object.fromEntries(series.map((item) => [item.key, Number(row[item.key] ?? 0)])));
  const domain = buildStackedBarDomain(numericRows, series.map((item) => item.key));

  return (
    <ChartSurface
      min={domain.min}
      max={domain.max}
      yTickFormatter={yTickFormatter}
      xLabels={rows.map((row) => String(row[labelKey] ?? ''))}
      data={{
        ariaLabel,
        itemsAt: index => series.map(item => ({ label: item.label, value: valueFormatter(numericRows[index]?.[item.key] ?? 0), color: item.color })),
      }}
    >
      {(plot) => {
        const zeroY = scaleY(0, domain.min, domain.max, plot.innerHeight);
        const columnWidth = rows.length > 0 ? plot.innerWidth / rows.length : plot.innerWidth;
        const barWidth = Math.min(42, columnWidth * 0.5);

        return (
          <>
            <line x1={0} x2={plot.innerWidth} y1={zeroY} y2={zeroY} stroke="rgb(var(--md-sys-color-outline) / 0.65)" strokeDasharray="4 6" />
            {rows.map((row, rowIndex) => {
              const x = clamp(scaleX(rowIndex, rows.length, plot.innerWidth) - barWidth / 2, 0, Math.max(0, plot.innerWidth - barWidth));
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
    <div className="space-y-3.5">
      {rows.map((row) => {
        const percent = maxValue > 0 ? clamp((row.value / maxValue) * 100, 0, 100) : 0;
        return (
          <div key={row.id} className="min-w-0 space-y-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-[15px] font-semibold">{row.label}</span>
              <span className="flex-none text-[14px] font-semibold tabular-nums text-muted">{valueFormatter(row.value)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-chip">
              <div
                className="h-full rounded-full"
                style={{ width: `${percent}%`, minWidth: percent > 0 ? '8px' : '0px', backgroundColor: row.color }}
                title={`${row.label}: ${valueFormatter(row.value)}`}
              />
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
  /** Formats slice values (tooltips); defaults to a locale number. */
  valueFormatter?: (value: number) => string;
}> = ({ rows, centerLabel, valueFormatter = (value) => formatNumber(value, { maximumFractionDigits: 0 }) }) => {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  const cx = 120;
  const cy = 120;
  const outerRadius = 88;
  const innerRadius = 58;
  let angle = -90;

  return (
    <div className="relative h-[220px] w-full sm:h-[260px]" data-no-swipe>
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
          fill="var(--paper-chip, rgb(var(--md-sys-color-surface-container-high)))"
        />
        {rows.map((row) => {
          // A single 100% slice would start and end on the same point and draw nothing.
          const slice = total > 0 ? Math.min((row.value / total) * 360, 359.999) : 0;
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
              stroke="var(--paper-tile, rgb(var(--md-sys-color-surface)))"
              strokeWidth="2"
            >
              <title>{`${row.label}: ${valueFormatter(row.value)}`}</title>
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
  ariaLabel?: string;
}> = ({ rows, labelKey, areaKeys, lineKey, lineLabel, lineColor, valueFormatter, yTickFormatter, ariaLabel }) => {
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
      data={{
        ariaLabel,
        itemsAt: index => [
          ...areaKeys.map(area => ({ label: area.label, value: valueFormatter(Number(rows[index]?.[area.key] ?? 0)), color: area.color })),
          { label: lineLabel, value: valueFormatter(Number(rows[index]?.[lineKey] ?? 0)), color: lineColor },
        ],
      }}
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
