import React from 'react';
import { ChevronRight, Sparkles } from 'lucide-react';
import { TRANSLATIONS } from '../../constants';
import { openAsk } from './askBus';

/** Entry point on the Insights view: opens the Ask sheet. */
export const AskBar: React.FC<{ language: 'en' | 'sr' }> = ({ language }) => {
  const t = TRANSLATIONS[language];
  return (
    <button
      type="button"
      onClick={() => openAsk()}
      className="paper-tile flex w-full items-center gap-3 p-3.5 text-left transition-transform active:scale-[0.99]"
    >
      <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-accent text-on-accent" aria-hidden="true">
        <Sparkles size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold">{t.askBarPrompt}</span>
        <span className="block truncate text-[13px] text-muted">{t.askBarHint}</span>
      </span>
      <ChevronRight size={18} aria-hidden="true" className="flex-none text-faint" />
    </button>
  );
};
