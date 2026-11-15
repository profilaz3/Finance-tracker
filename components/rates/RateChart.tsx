import React, { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { buildLinearTicks } from '../stats/chartPrimitives';
import type { RatePoint } from '../../utils/nbsRates';

interface RateChartProps {
  points: readonly RatePoint[];
  height?: number;
  /** Y tick labels (rates need decimals, so not the compact money format). */
  formatTick: (value: number) => string;
  formatDateLabel: (date: string) => string;
  /** Called with the point under the finger or pointer, and null when the scrub ends. */
  onScrub?: (point: RatePoint | null) => void;
  ariaLabel: string;
  /** Sparkline mode: no axes, no scrub. */
  bare?: boolean;
  /** Value text for the scrub bubble and the low/high markers; without it neither shows. */
  formatValue?: (value: number) => string;
}

const PAD = { top: 10, right: 6, bottom: 22, left: 46 };
const BARE_PAD = { top: 4, right: 2, bottom: 4, left: 2 };

const useWidth = () => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () => setWidth(Math.round(node.getBoundingClientRect().width));
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
};

const r = (value: number) => Number(value.toFixed(2));

/**
 * Line chart for one exchange rate. Rates never start at zero: the domain hugs the data with a
 * little padding so a 0.5% move is visible. Drag or hover to read any day.
 */
export const RateChart: React.FC<RateChartProps> = ({ points, height = 180, formatTick, formatDateLabel, onScrub, ariaLabel, bare = false, formatValue }) => {
  const [boxRef, width] = useWidth();
  const [active, setActive] = useState<number | null>(null);
  const gradientId = useId();
  const pad = bare ? BARE_PAD : PAD;
  const innerW = Math.max(1, width - pad.left - pad.right);
  const innerH = Math.max(1, height - pad.top - pad.bottom);

  const geometry = useMemo(() => {
    if (points.length === 0) return null;
    const values = points.map(([, value]) => value);
    let min = Math.min(...values);
    let max = Math.max(...values);
    if (min === max) {
      const spread = Math.max(Math.abs(min) * 0.001, 0.01);
      min -= spread;
      max += spread;
    }
    const span = max - min;
    min -= span * 0.08;
    max += span * 0.08;
    const x = (index: number) => (points.length <= 1 ? innerW : (innerW / (points.length - 1)) * index);
    const y = (value: number) => innerH - ((value - min) / (max - min)) * innerH;
    const coords = points.map(([, value], index) => ({ x: r(x(index)), y: r(y(value)) }));
    const line = coords.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`).join(' ');
    const area = `${line} L${coords[coords.length - 1].x} ${innerH} L${coords[0].x} ${innerH} Z`;
    const lowIndex = values.indexOf(Math.min(...values));
    const highIndex = values.indexOf(Math.max(...values));
    return { min, max, y, coords, line, area, lowIndex, highIndex, ticks: buildLinearTicks(min + span * 0.08, max - span * 0.08, 3) };
  }, [points, innerW, innerH]);

  const scrubTo = (clientX: number, target: Element) => {
    if (!geometry || points.length === 0) return;
    const rect = target.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left - pad.left) / innerW));
    const index = Math.round(ratio * (points.length - 1));
    setActive(index);
    onScrub?.(points[index]);
  };
  const endScrub = () => {
    setActive(null);
    onScrub?.(null);
  };

  const activePoint = active !== null && geometry ? geometry.coords[active] : null;
  const last = geometry?.coords[geometry.coords.length - 1];
  const showMarkers = !bare && Boolean(formatValue) && points.length > 2 && geometry && geometry.lowIndex !== geometry.highIndex;
  // Keeps a marker label inside the plot near either edge.
  const anchorFor = (x: number) => (x < 36 ? 'start' : x > innerW - 36 ? 'end' : 'middle');

  const marker = (index: number, kind: 'low' | 'high') => {
    if (!geometry) return null;
    const point = geometry.coords[index];
    const labelY = kind === 'high' ? point.y - 8 : point.y + 15;
    return (
      <g key={kind} aria-hidden="true">
        <circle cx={point.x} cy={point.y} r={3.5} className="fill-tile stroke-accent" strokeWidth={1.75} />
        <text
          x={point.x}
          y={Math.min(innerH - 2, Math.max(9, labelY))}
          textAnchor={anchorFor(point.x)}
          className="fill-muted"
          fontSize={10.5}
          fontWeight={600}
        >
          {formatValue?.(points[index][1])}
        </text>
      </g>
    );
  };

  return (
    <div ref={boxRef} className="relative w-full" style={{ height }} data-no-swipe>
      {width > 0 && geometry && (
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={ariaLabel}
          className="block touch-pan-y select-none"
          onPointerDown={bare ? undefined : (event) => scrubTo(event.clientX, event.currentTarget)}
          onPointerMove={bare ? undefined : (event) => {
            if (event.pointerType === 'mouse' || event.buttons > 0) scrubTo(event.clientX, event.currentTarget);
          }}
          onPointerLeave={bare ? undefined : endScrub}
          onPointerUp={bare ? undefined : (event) => { if (event.pointerType !== 'mouse') endScrub(); }}
          onPointerCancel={bare ? undefined : endScrub}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.22} />
              <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <g transform={`translate(${pad.left}, ${pad.top})`}>
            {!bare && geometry.ticks.map((tick) => (
              <g key={tick} transform={`translate(0, ${r(geometry.y(tick))})`}>
                <line x1={0} x2={innerW} y1={0} y2={0} className="stroke-hair" strokeDasharray="3 6" />
                <text x={-8} y={4} textAnchor="end" className="fill-muted" fontSize={11}>{formatTick(tick)}</text>
              </g>
            ))}
            <path d={geometry.area} fill={`url(#${gradientId})`} />
            <path d={geometry.line} fill="none" className="stroke-accent" strokeWidth={bare ? 1.75 : 2.25} strokeLinejoin="round" strokeLinecap="round" />
            {!bare && points.length > 1 && (
              <>
                <text x={0} y={innerH + 17} textAnchor="start" className="fill-muted" fontSize={11}>{formatDateLabel(points[0][0])}</text>
                <text x={innerW} y={innerH + 17} textAnchor="end" className="fill-muted" fontSize={11}>{formatDateLabel(points[points.length - 1][0])}</text>
              </>
            )}
            {showMarkers && !activePoint && geometry && (
              <>
                {marker(geometry.highIndex, 'high')}
                {marker(geometry.lowIndex, 'low')}
              </>
            )}
            {activePoint ? (
              <>
                <line x1={activePoint.x} x2={activePoint.x} y1={0} y2={innerH} className="stroke-muted" strokeWidth={1} strokeDasharray="2 4" />
                <circle cx={activePoint.x} cy={activePoint.y} r={5} className="fill-accent stroke-tile" strokeWidth={2} />
              </>
            ) : (
              last && <circle cx={last.x} cy={last.y} r={bare ? 2.5 : 3.5} className="fill-accent" />
            )}
          </g>
        </svg>
      )}
      {!bare && formatValue && activePoint && active !== null && (
        <span
          className="pointer-events-none absolute top-0 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-on-surface px-2.5 py-1 text-[11px] font-semibold tabular-nums text-surface shadow-sm"
          style={{ left: `clamp(56px, ${pad.left + activePoint.x}px, ${Math.max(56, width - 56)}px)` }}
          aria-hidden="true"
        >
          <span className="opacity-70">{formatDateLabel(points[active][0])}</span>
          {formatValue(points[active][1])}
        </span>
      )}
    </div>
  );
};
