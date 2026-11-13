import React, { useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { AppState } from '../../types';
import { TRANSLATIONS } from '../../constants';
import { CleanupSheet } from './CleanupSheet';

type ToastFn = (message: string, type: 'success' | 'error' | 'info' | 'warning', action?: { label: string; onClick: () => void }) => void;

interface CleanupCardProps {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  onToast?: ToastFn;
}

/** Settings entry point for "Clean up with AI". */
export const CleanupCard: React.FC<CleanupCardProps> = ({ state, setState, onToast }) => {
  const t = TRANSLATIONS[state.language];
  const [open, setOpen] = useState(false);
  return (
    <>
      <section className="paper-tile flex flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px]"
            style={{ background: 'color-mix(in oklab, #7C3AED 16%, var(--paper-tile))', color: 'color-mix(in oklab, #7C3AED 72%, var(--paper-text))' }}
          >
            <Sparkles size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-[16px] font-bold">{t.cleanupTitle}</h3>
            <p className="text-[13px] leading-snug text-muted">{t.cleanupIntro}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={state.transactions.length === 0}
          className="h-11 rounded-full bg-chip text-[14px] font-semibold text-accent disabled:opacity-50"
        >
          {t.cleanupStart}
        </button>
      </section>
      <CleanupSheet isOpen={open} onClose={() => setOpen(false)} state={state} setState={setState} onToast={onToast} />
    </>
  );
};
