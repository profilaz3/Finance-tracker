import React, { useState } from 'react';
import { m, AnimatePresence } from 'motion/react';
import { X, FileSpreadsheet, FileJson, Download } from 'lucide-react';
import clsx from 'clsx';
import { AppState } from '../types';
import { exportWithOptions, ExportOptions } from '../services/storageService';
import { TRANSLATIONS } from '../constants';
import { MOTION } from '../config';
import { useDialog } from '../hooks/useFocusTrap';
import { useSheetDrag } from '../hooks/useSheetDrag';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  state: AppState;
  onSuccess?: (count: number) => void;
}

type Preset = 'month' | 'quarter' | 'year' | 'all';

/** YYYY-MM-DD in local time (toISOString would shift the day near midnight). */
const toInputDate = (date: Date): string => {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

const presetStart = (preset: Exclude<Preset, 'all'>, today: Date): Date => {
  if (preset === 'month') return new Date(today.getFullYear(), today.getMonth(), 1);
  if (preset === 'year') return new Date(today.getFullYear(), 0, 1);
  return new Date(today.getFullYear(), today.getMonth() - 2, 1);
};

const sectionLabel = 'mb-2 block px-1 text-[13px] font-semibold text-muted';
const fieldClass =
  'paper-field h-12 w-full rounded-[14px] border border-hair px-3.5 text-[15px] text-on-surface outline-none focus:ring-2 focus:ring-accent';

export const ExportModal: React.FC<ExportModalProps> = ({ isOpen, ...rest }) => (
  <AnimatePresence>{isOpen && <ExportSheet isOpen {...rest} />}</AnimatePresence>
);

const ExportSheet: React.FC<ExportModalProps> = ({ isOpen, onClose, state, onSuccess }) => {
  const [format, setFormat] = useState<'csv' | 'json'>('csv');
  const [preset, setPreset] = useState<Preset | null>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [includeEvents, setIncludeEvents] = useState(true);
  const { dialogProps, titleId } = useDialog(isOpen, onClose);
  const { wrapRef, handleProps } = useSheetDrag(onClose);

  const t = TRANSLATIONS[state.language];

  const handleExport = () => {
    const options: ExportOptions = {
      format,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      includeEvents,
    };

    const count = exportWithOptions(
      state.transactions,
      state.categories,
      state.accounts,
      state.people,
      state.events,
      options
    );

    onSuccess?.(count);
    onClose();
  };

  const presets: { id: Preset; label: string }[] = [
    { id: 'month', label: t.thisMonth },
    { id: 'quarter', label: t.lastThreeMonths },
    { id: 'year', label: t.thisYear },
    { id: 'all', label: t.allTime },
  ];

  const applyPreset = (next: Preset) => {
    setPreset(next);
    if (next === 'all') {
      setDateFrom('');
      setDateTo('');
      return;
    }
    const today = new Date();
    setDateFrom(toInputDate(presetStart(next, today)));
    setDateTo(toInputDate(today));
  };

  const exportCount = state.transactions.filter((transaction) => {
    if (dateFrom && transaction.date < dateFrom) {
      return false;
    }

    if (dateTo) {
      const inclusiveTo = new Date(dateTo);
      inclusiveTo.setDate(inclusiveTo.getDate() + 1);
      if (transaction.date >= inclusiveTo.toISOString()) {
        return false;
      }
    }

    return true;
  }).length;

  const formats = [
    { id: 'csv' as const, label: 'CSV', Icon: FileSpreadsheet },
    { id: 'json' as const, label: 'JSON', Icon: FileJson },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center modal-safe-area max-md:px-2! max-md:pb-[max(8px,env(safe-area-inset-bottom))]! md:items-center">
      <m.div
        className="paper-scrim absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={MOTION.backdrop}
        onClick={onClose}
        aria-hidden="true"
      />
      <div ref={wrapRef} className="relative flex max-h-full w-full justify-center">
        <m.div
          {...dialogProps}
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={MOTION.sheet.exit}
          transition={MOTION.sheet.spring}
          onClick={(event) => event.stopPropagation()}
          className="glass-sheet relative flex max-h-[88dvh] w-full max-w-[480px] flex-col overflow-hidden rounded-[36px] text-on-surface outline-none"
        >
          <div className="shrink-0 touch-none" {...handleProps}>
            <div className="paper-grab mx-auto mt-2 h-[5px] w-9 rounded-full md:hidden" aria-hidden="true" />
            <div className="flex items-center gap-2 px-5 pb-3 pt-3">
              <h2 id={titleId} className="flex-1 text-[22px] font-semibold tracking-tight">{t.exportData}</h2>
              <button
                type="button"
                onClick={onClose}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-chip text-muted"
                aria-label={t.close}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 pb-4">
            <div role="group" aria-label={t.exportFormat}>
              <span className={sectionLabel} aria-hidden="true">{t.exportFormat}</span>
              <div className="grid grid-cols-2 gap-2.5">
                {formats.map(({ id, label, Icon }) => {
                  const selected = format === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setFormat(id)}
                      className={clsx(
                        'flex h-14 items-center justify-center gap-2 rounded-[18px] text-[15px] font-semibold transition-colors',
                        selected ? 'bg-accent text-on-accent' : 'bg-chip text-on-surface'
                      )}
                    >
                      <Icon size={19} aria-hidden="true" />
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <span className={sectionLabel}>{t.timePeriod}</span>
              <div className="flex flex-wrap gap-2">
                {presets.map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={preset === id}
                    onClick={() => applyPreset(id)}
                    className={clsx(
                      'h-9 rounded-full px-3.5 text-[14px] font-semibold transition-colors',
                      preset === id ? 'bg-accent text-on-accent' : 'bg-chip text-on-surface'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className={sectionLabel}>{t.customRange}</span>
              <div className="grid grid-cols-2 gap-2.5">
                <label className="block">
                  <span className="mb-1 block px-1 text-[12px] text-faint">{t.dateFrom}</span>
                  <input
                    type="date"
                    value={dateFrom}
                    max={dateTo || undefined}
                    onChange={(event) => { setDateFrom(event.target.value); setPreset(null); }}
                    className={fieldClass}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block px-1 text-[12px] text-faint">{t.dateTo}</span>
                  <input
                    type="date"
                    value={dateTo}
                    min={dateFrom || undefined}
                    onChange={(event) => { setDateTo(event.target.value); setPreset(null); }}
                    className={fieldClass}
                  />
                </label>
              </div>
            </div>

            <div>
              <span className={sectionLabel}>{t.options}</span>
              <label className="paper-tile flex min-h-14 cursor-pointer items-center gap-3 !rounded-[18px] px-4 py-3">
                <span className="flex-1 text-[15px] font-medium">{t.includeEventData}</span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={includeEvents}
                  onChange={(event) => setIncludeEvents(event.target.checked)}
                  className="peer sr-only"
                />
                <span
                  aria-hidden="true"
                  className={clsx(
                    'relative h-[30px] w-[50px] shrink-0 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2',
                    includeEvents ? 'bg-accent' : 'bg-chip'
                  )}
                >
                  <span
                    className={clsx(
                      'absolute left-[2px] top-[2px] h-[26px] w-[26px] rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.18)] transition-transform duration-300 ease-[cubic-bezier(0.34,1.32,0.64,1)]',
                      includeEvents && 'translate-x-5'
                    )}
                  />
                </span>
              </label>
            </div>

            <div className="flex items-baseline justify-between rounded-[18px] bg-accent-soft px-4 py-3.5" aria-live="polite">
              <span className="text-[14px] font-medium text-muted">{t.transactionsToExport}</span>
              <span className="text-[28px] font-bold leading-none tracking-[-0.035em] text-accent tabular-nums">{exportCount}</span>
            </div>
          </div>

          <div className="flex shrink-0 gap-2.5 px-5 pb-5 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="h-12 flex-1 rounded-full bg-chip text-[15px] font-semibold text-on-surface"
            >
              {t.cancel}
            </button>
            <button
              type="button"
              onClick={handleExport}
              className="flex h-12 flex-[1.4] items-center justify-center gap-2 rounded-full bg-accent text-[15px] font-semibold text-on-accent"
            >
              <Download size={18} aria-hidden="true" />
              {t.export}
            </button>
          </div>
        </m.div>
      </div>
    </div>
  );
};
