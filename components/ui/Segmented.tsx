import React from 'react';
import clsx from 'clsx';
import { usePillTrack } from '../../hooks/usePillTrack';

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
  disabled?: boolean;
}

interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
  size?: 'sm' | 'md';
}

/** iOS-style segmented control: a pill that glides between options and can be dragged. */
export function Segmented<T extends string>({ options, value, onChange, ariaLabel, className, size = 'md' }: SegmentedProps<T>) {
  const selectedIndex = options.findIndex(option => option.value === value);
  const { trackRef, pillRef, trackProps } = usePillTrack(selectedIndex, index => {
    const option = options[index];
    if (option && !option.disabled) onChange(option.value);
  });

  return (
    <div
      ref={trackRef}
      role="radiogroup"
      aria-label={ariaLabel}
      data-no-swipe
      className={clsx('pill-track relative flex touch-pan-y select-none gap-0.5 rounded-full bg-chip p-[3px]', className)}
      {...trackProps}
    >
      <span
        ref={pillRef}
        aria-hidden="true"
        className="paper-seg-on pointer-events-none absolute bottom-[3px] left-0 top-[3px] rounded-full opacity-0"
      />
      {options.map(option => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={option.disabled}
            data-pill-item
            onClick={() => onChange(option.value)}
            className={clsx(
              'pill-item relative z-[1] flex-1 rounded-full font-semibold transition-colors duration-200 disabled:opacity-35',
              size === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-9 px-4 text-sm',
              selected ? 'text-on-surface' : 'text-muted',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
