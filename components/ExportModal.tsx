import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, FileSpreadsheet, FileJson, Calendar, Download, CheckCircle2 } from 'lucide-react';
import clsx from 'clsx';
import { AppState } from '../types';
import { exportWithOptions, ExportOptions } from '../services/storageService';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  state: AppState;
  onSuccess?: (count: number) => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  state,
  onSuccess,
}) => {
  const [format, setFormat] = useState<'csv' | 'json'>('csv');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [includeEvents, setIncludeEvents] = useState(true);

  const labels = state.language === 'sr'
    ? {
        title: 'Izvoz podataka',
        timePeriod: 'Vremenski period',
        customRange: 'Prilagodeni period',
        from: 'Od',
        to: 'Do',
        options: 'Opcije',
        includeEvents: 'Ukljuci podatke o eventima',
        preview: 'Broj transakcija za izvoz:',
        cancel: 'Otkazi',
        export: 'Izvezi',
        thisMonth: 'Ovaj mesec',
        lastThreeMonths: 'Poslednja 3 meseca',
        thisYear: 'Ova godina',
        allTime: 'Sve',
      }
    : {
        title: 'Export Data',
        timePeriod: 'Time Period',
        customRange: 'Custom Range',
        from: 'From',
        to: 'To',
        options: 'Options',
        includeEvents: 'Include event data',
        preview: 'Transactions to export:',
        cancel: 'Cancel',
        export: 'Export',
        thisMonth: 'This Month',
        lastThreeMonths: 'Last 3 Months',
        thisYear: 'This Year',
        allTime: 'All Time',
      };

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

  const presetRanges = [
    { label: labels.thisMonth, days: 30 },
    { label: labels.lastThreeMonths, days: 90 },
    { label: labels.thisYear, days: 365 },
    { label: labels.allTime, days: 0 },
  ];

  const applyPreset = (days: number) => {
    if (days === 0) {
      setDateFrom('');
      setDateTo('');
      return;
    }

    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days);
    setDateFrom(from.toISOString().split('T')[0]);
    setDateTo(to.toISOString().split('T')[0]);
  };

  if (!isOpen) {
    return null;
  }

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

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-scrim/50 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={(event) => event.stopPropagation()}
          className="bg-surface-container w-full max-w-md rounded-2xl shadow-elevation-3 overflow-hidden"
        >
          <div className="flex items-center justify-between p-4 border-b border-outline-variant/20">
            <h2 className="text-xl font-display font-medium text-on-surface">{labels.title}</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-surface-container-high rounded-full transition-colors"
              aria-label={labels.cancel}
            >
              <X size={20} className="text-on-surface-variant" />
            </button>
          </div>

          <div className="p-4 space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-on-surface-variant">Format</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setFormat('csv')}
                  className={clsx(
                    'flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all',
                    format === 'csv'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-outline-variant/30 text-on-surface-variant hover:border-outline-variant'
                  )}
                >
                  <FileSpreadsheet size={20} />
                  <span className="font-medium">CSV</span>
                </button>
                <button
                  onClick={() => setFormat('json')}
                  className={clsx(
                    'flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all',
                    format === 'json'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-outline-variant/30 text-on-surface-variant hover:border-outline-variant'
                  )}
                >
                  <FileJson size={20} />
                  <span className="font-medium">JSON</span>
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-on-surface-variant">{labels.timePeriod}</label>
              <div className="flex flex-wrap gap-2">
                {presetRanges.map((preset) => (
                  <button
                    key={preset.days}
                    onClick={() => applyPreset(preset.days)}
                    className={clsx(
                      'px-3 py-1.5 rounded-full text-sm font-medium transition-all',
                      (preset.days === 0 && !dateFrom && !dateTo) || (preset.days !== 0 && dateFrom)
                        ? 'bg-secondary-container text-on-secondary-container'
                        : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest'
                    )}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-on-surface-variant flex items-center gap-2">
                <Calendar size={14} />
                {labels.customRange}
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-on-surface-variant/60 mb-1 block">{labels.from}</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(event) => setDateFrom(event.target.value)}
                    className="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg px-3 py-2 text-sm text-on-surface"
                  />
                </div>
                <div>
                  <label className="text-xs text-on-surface-variant/60 mb-1 block">{labels.to}</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(event) => setDateTo(event.target.value)}
                    className="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg px-3 py-2 text-sm text-on-surface"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-on-surface-variant">{labels.options}</label>
              <label className="flex items-center gap-3 p-3 bg-surface-container-low rounded-xl cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeEvents}
                  onChange={(event) => setIncludeEvents(event.target.checked)}
                  className="sr-only"
                />
                <div
                  className={clsx(
                    'w-5 h-5 rounded flex items-center justify-center transition-colors',
                    includeEvents ? 'bg-primary text-on-primary' : 'bg-surface-container-high'
                  )}
                >
                  {includeEvents ? <CheckCircle2 size={14} /> : null}
                </div>
                <span className="text-sm text-on-surface">{labels.includeEvents}</span>
              </label>
            </div>

            <div className="bg-surface-container-low rounded-xl p-3">
              <p className="text-xs text-on-surface-variant/60 mb-1">{labels.preview}</p>
              <p className="text-2xl font-display font-medium text-on-surface">{exportCount}</p>
            </div>
          </div>

          <div className="p-4 border-t border-outline-variant/20 flex justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-on-surface-variant hover:text-on-surface rounded-lg transition-colors"
            >
              {labels.cancel}
            </button>
            <button
              onClick={handleExport}
              className="px-4 py-2 bg-primary text-on-primary rounded-lg flex items-center gap-2 hover:bg-primary/90 transition-colors"
            >
              <Download size={18} />
              {labels.export}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
