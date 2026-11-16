import React, { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { m } from 'motion/react';
import type { RatePoint } from '../../utils/nbsRates';

interface RateChartProps {
  points: readonly RatePoint[];
  height?: number;
  formatDateLabel: (date: string) => string;
  /** Value text for the keyboard and screen reader read-out. */
  formatValue: (value: number) => string;
  /** Called with the point under the finger, pointer or keyboard, and null when the scrub ends. */
  onScrub?: (point: RatePoint | null) => void;
  ariaLabel: string;
  /** Changing it draws the line in again (a new currency or range). */
  drawKey?: string;
}

const PAD = { top: 12, right: 8, bottom: 22, left: 8 };

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
 * Line chart for one exchange rate, drawn in white for a coloured header (the header shows the
 * value under the finger, so the chart has no axis or bubble). Rates never start at zero: the
 * domain hugs the data with a little padding so a 0.5% move is visible. Drag or hover to read any
 * day, or focus it and use the arrow keys (Shift for bigger steps, Home and End, Esc lets go).
 */
export const RateChart: React.FC<RateChartProps> = ({ points, height = 140, formatDateLabel, formatValue, onScrub, ariaLabel, drawKey }) => {
  const [boxRef, width] = useWidth();
  const [active, setActive] = useState<number | null>(null);
  const gradientId = useId();
  const innerW = Math.max(1, width - PAD.left - PAD.right);
  const innerH = Math.max(1, height - PAD.top - PAD.bottom);
  const interactive = points.length > 1;

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
    return { coords, line, area };
  }, [points, innerW, innerH]);

  const select = (index: number | null) => {
    setActive(index);
    onScrub?.(index === null ? null : points[index]);
  };
  const scrubTo = (clientX: number, target: Element) => {
    if (points.length === 0) return;
    const rect = target.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left - PAD.left) / innerW));
    select(Math.round(ratio * (points.length - 1)));
  };
  const endScrub = () => select(null);

  const onKeyDown = (event: React.KeyboardEvent) => {
    const last = points.length - 1;
    const from = active ?? last;
    // A bigger step for long ranges, so 5 years is not 1,250 presses.
    const step = event.shiftKey ? Math.max(1, Math.round(points.length / 12)) : 1;
    const next =
      event.key === 'ArrowLeft' ? Math.max(0, from - step)
      : event.key === 'ArrowRight' ? Math.min(last, from + step)
      : event.key === 'Home' ? 0
      : event.key === 'End' ? last
      : null;
    if (next !== null) {
      event.preventDefault();
      event.stopPropagation();
      select(next);
    } else if (event.key === 'Escape' && active !== null) {
      // Esc lets go of the day first; the next one closes the sheet.
      event.preventDefault();
      event.stopPropagation();
      endScrub();
    }
  };

  const activePoint = active !== null && geometry ? geometry.coords[active] : null;
  const last = geometry?.coords[geometry.coords.length - 1];
  const shownIndex = active ?? points.length - 1;
  const valueText = points.length > 0 ? `${formatDateLabel(points[shownIndex][0])}: ${formatValue(points[shownIndex][1])}` : undefined;

  return (
    <div
      ref={boxRef}
      className="relative w-full"
      style={{ height }}
      data-no-swipe
      // In a sheet's header a scrub must not start pulling the sheet down.
      onTouchStart={(event) => event.stopPropagation()}
    >
      {width > 0 && geometry && (
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role={interactive ? 'slider' : 'img'}
          aria-label={ariaLabel}
          aria-valuemin={interactive ? 0 : undefined}
          aria-valuemax={interactive ? points.length - 1 : undefined}
          aria-valuenow={interactive ? shownIndex : undefined}
          aria-valuetext={interactive ? valueText : undefined}
          tabIndex={interactive ? 0 : undefined}
          onKeyDown={interactive ? onKeyDown : undefined}
          onBlur={interactive ? endScrub : undefined}
          className="block touch-pan-y select-none rounded-xl outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
          onPointerDown={interactive ? (event) => scrubTo(event.clientX, event.currentTarget) : undefined}
          onPointerMove={interactive ? (event) => {
            if (event.pointerType === 'mouse' || event.buttons > 0) scrubTo(event.clientX, event.currentTarget);
          } : undefined}
          onPointerLeave={interactive ? endScrub : undefined}
          onPointerUp={interactive ? (event) => { if (event.pointerType !== 'mouse') endScrub(); } : undefined}
          onPointerCancel={interactive ? endScrub : undefined}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fff" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#fff" stopOpacity={0} />
            </linearGradient>
          </defs>
          <g transform={`translate(${PAD.left}, ${PAD.top})`}>
            <m.path
              key={`area-${drawKey ?? ''}`}
              d={geometry.area}
              fill={`url(#${gradientId})`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.25 }}
            />
            <m.path
              key={`line-${drawKey ?? ''}`}
              d={geometry.line}
              fill="none"
              className="stroke-white"
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            />
            {points.length > 1 && (
              <>
                <text x={0} y={innerH + 17} textAnchor="start" className="fill-white/65" fontSize={11} fontWeight={600}>
                  {formatDateLabel(points[0][0])}
                </text>
                <text x={innerW} y={innerH + 17} textAnchor="end" className="fill-white/65" fontSize={11} fontWeight={600}>
                  {formatDateLabel(points[points.length - 1][0])}
                </text>
              </>
            )}
            {activePoint ? (
              <>
                <line x1={activePoint.x} x2={activePoint.x} y1={0} y2={innerH} className="stroke-white/55" strokeWidth={1} strokeDasharray="2 4" />
                <circle cx={activePoint.x} cy={activePoint.y} r={5.5} className="fill-white stroke-black/10" strokeWidth={2} />
              </>
            ) : (
              last && (
                <>
                  <circle
                    cx={last.x}
                    cy={last.y}
                    r={4}
                    className="origin-center animate-ping fill-white/60 [transform-box:fill-box] motion-reduce:hidden"
                    aria-hidden="true"
                  />
                  <circle cx={last.x} cy={last.y} r={4} className="fill-white" />
                </>
              )
            )}
          </g>
        </svg>
      )}
    </div>
  );
};
