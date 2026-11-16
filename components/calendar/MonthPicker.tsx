import React, { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import { AnimatePresence, m } from 'motion/react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { MOTION } from '../../config';
import { TRANSLATIONS } from '../../constants';
import { useEscapeKey, useFocusTrap } from '../../hooks/useFocusTrap';
import { useBackLayer } from '../../hooks/useBackLayer';
import { formatDate } from '../../utils/locale';
import { fill } from '../home/parts';
import { CALENDAR_STRINGS } from './calendarStrings';

interface MonthPickerProps {
  language: 'en' | 'sr';
  /** First day of the month on screen. */
  month: Date;
  onChange: (month: Date) => void;
}

const capitalize = (value: string): string => value.charAt(0).toLocaleUpperCase() + value.slice(1);

/** The header's month title ("November ⌄"); it opens a year of months to jump to. */
export const MonthPicker: React.FC<MonthPickerProps> = ({ language, month, onChange }) => {
  const t = TRANSLATIONS[language];
  const s = CALENDAR_STRINGS[language];
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(month.getFullYear());
  const close = useCallback(() => setOpen(false), []);
  const panelRef = useFocusTrap(open);
  useEscapeKey(close, open);
  useBackLayer('calendar-month-picker', open, close);

  useEffect(() => {
    if (open) setYear(month.getFullYear());
  }, [open, month]);

  const now = new Date();
  const thisYear = month.getFullYear() === now.getFullYear();
  const title = capitalize(formatDate(month, thisYear ? { month: 'long' } : { month: 'long', year: 'numeric' }, language));
  const pick = (value: Date) => {
    setOpen(false);
    onChange(value);
  };

  return (
    <div className="relative min-w-0 flex-1">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={fill(s.chooseMonth, { month: formatDate(month, { month: 'long', year: 'numeric' }, language) })}
        className="flex h-11 max-w-full items-center gap-1.5 overflow-visible rounded-full pl-1 pr-2 text-left"
      >
        <span className="truncate text-[28px] font-bold tracking-[-0.03em]">{title}</span>
        <ChevronDown size={20} className={clsx('shrink-0 text-white/70 transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-30" onClick={close} aria-hidden="true" />
            <m.div
              ref={panelRef}
              role="dialog"
              aria-label={fill(s.chooseMonth, { month: formatDate(month, { month: 'long', year: 'numeric' }, language) })}
              initial={{ opacity: 0, scale: 0.92, y: -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: -6 }}
              transition={MOTION.modal.spring}
              style={{ transformOrigin: 'top left' }}
              className="glass-sheet absolute left-0 top-[52px] z-40 w-[296px] max-w-[calc(100vw-32px)] rounded-[26px] p-3 text-on-surface"
            >
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setYear(value => value - 1)}
                  aria-label={s.prevYear}
                  title={s.prevYear}
                  className="flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-chip"
                >
                  <ChevronLeft size={20} aria-hidden="true" />
                </button>
                <span className="text-[16px] font-bold tabular-nums" aria-live="polite">{year}</span>
                <button
                  type="button"
                  onClick={() => setYear(value => value + 1)}
                  aria-label={s.nextYear}
                  title={s.nextYear}
                  className="flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-chip"
                >
                  <ChevronRight size={20} aria-hidden="true" />
                </button>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                {Array.from({ length: 12 }, (_, index) => {
                  const value = new Date(year, index, 1);
                  const selected = year === month.getFullYear() && index === month.getMonth();
                  const current = year === now.getFullYear() && index === now.getMonth();
                  return (
                    <button
                      key={index}
                      type="button"
                      onClick={() => pick(value)}
                      aria-current={selected ? 'date' : undefined}
                      aria-label={formatDate(value, { month: 'long', year: 'numeric' }, language)}
                      className={clsx(
                        'h-11 rounded-[16px] text-[15px] font-semibold capitalize',
                        selected ? 'bg-accent text-on-accent' : 'hover:bg-chip',
                        current && !selected && 'text-accent ring-[1.5px] ring-inset ring-accent/50',
                      )}
                    >
                      {formatDate(value, { month: 'short' }, language).replace('.', '')}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => pick(new Date(now.getFullYear(), now.getMonth(), 1))}
                className="mt-2 h-11 w-full rounded-[16px] bg-chip text-[15px] font-semibold"
              >
                {t.thisMonth}
              </button>
            </m.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
