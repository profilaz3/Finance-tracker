import React from 'react';
import clsx from 'clsx';

/**
 * Progress ring. `ratio` 0..1 (clamped), colour defaults to the accent.
 * Pass `children` to centre a label inside the ring.
 */
export const Ring: React.FC<{
  ratio: number;
  radius: number;
  stroke: number;
  color?: string;
  track?: string;
  className?: string;
  children?: React.ReactNode;
}> = ({ ratio, radius, stroke, color = 'rgb(var(--accent-rgb))', track = 'var(--paper-chip)', className, children }) => {
  const size = radius * 2 + stroke;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, ratio));
  const svg = (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className={clsx('shrink-0 -rotate-90', !children && className)}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={track} strokeWidth={stroke} />
      {clamped > 0 && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(circumference * clamped).toFixed(1)} ${circumference.toFixed(1)}`}
        />
      )}
    </svg>
  );
  if (!children) return svg;
  return (
    <span className={clsx('relative inline-flex shrink-0 items-center justify-center', className)} style={{ width: size, height: size }}>
      {svg}
      <span className="absolute inset-0 flex items-center justify-center">{children}</span>
    </span>
  );
};
