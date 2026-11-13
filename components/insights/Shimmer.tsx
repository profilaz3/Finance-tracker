import React from 'react';
import clsx from 'clsx';

/** A soft loading bar that sweeps light across itself (still under reduced motion). */
export const ShimmerLine: React.FC<{ className?: string; width?: string }> = ({ className, width }) => (
  <span
    aria-hidden="true"
    className={clsx('block h-3 rounded-full animate-[shimmer_1.8s_linear_infinite] bg-[length:200%_100%]', className)}
    style={{
      width,
      backgroundImage: 'linear-gradient(90deg, var(--paper-chip) 25%, var(--paper-tile) 50%, var(--paper-chip) 75%)',
    }}
  />
);
