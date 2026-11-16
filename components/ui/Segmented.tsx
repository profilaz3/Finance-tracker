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
  size?: 'sm' | 'md' | 'lg';
  /** `hero` sits on a coloured header: a translucent track and a white pill. */
  tone?: 'surface' | 'hero';
}

/** iOS-style segmented control: a pill that glides between options and can be dragged. */
export function Segmented<T extends string>({ options, value, onChange, ariaLabel, className, size = 'md', tone = 'surface' }: SegmentedProps<T>) {
  const hero = tone === 'hero';
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
      // Options share the width but never shrink below their label; a track wider than its box scrolls.
      className={clsx(
        'pill-track scrollbar-none relative flex max-w-full touch-pan-y select-none gap-0.5 overflow-x-auto rounded-full p-[3px]',
        hero ? 'bg-white/[0.12] ring-1 ring-inset ring-white/[0.16]' : 'bg-chip',
        className,
      )}
      {...trackProps}
    >
      <span
        ref={pillRef}
        aria-hidden="true"
        className={clsx(
          'pointer-events-none absolute bottom-[3px] left-0 top-[3px] rounded-full opacity-0',
          hero ? 'bg-white shadow-[0_2px_8px_rgba(0,0,0,0.18)]' : 'paper-seg-on',
        )}
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
              // The ::after extends the hit area over the track padding: 40px tall for sm, 42px for md.
              'pill-item relative z-[1] min-w-fit flex-1 whitespace-nowrap rounded-full font-semibold transition-colors duration-200 disabled:opacity-35',
              "after:absolute after:inset-x-0 after:-inset-y-[3px] after:content-['']",
              size === 'sm' ? 'h-[34px] px-3 text-[13px]' : size === 'lg' ? 'h-[38px] px-4 text-[15px]' : 'h-9 px-4 text-sm',
              hero ? (selected ? 'text-[#0B0D0C]' : 'text-white/80') : selected ? 'text-on-surface' : 'text-muted',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
