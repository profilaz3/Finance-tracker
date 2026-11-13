import React from 'react';
import { AppState, Currency } from '../../types';
import { TRANSLATIONS } from '../../constants';
import { Segmented } from '../ui/Segmented';
import { ChevronRight, LineChart } from 'lucide-react';
import { formatMediumDate } from '../../utils/locale';
import { openRates } from '../rates/ratesBus';

interface GeneralSettingsProps {
    state: AppState;
    setState: React.Dispatch<React.SetStateAction<AppState>>;
}

const CURRENCIES: Currency[] = ['EUR', 'USD', 'RSD'];

const Kbd: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <kbd className="inline-flex h-7 min-w-7 items-center justify-center rounded-[8px] border border-hair bg-chip px-2 font-sans text-[12px] font-semibold text-muted">
        {children}
    </kbd>
);

export const GeneralSettings: React.FC<GeneralSettingsProps> = ({ state, setState }) => {
    const t = TRANSLATIONS[state.language];

    const shortcuts: Array<{ label: string; keys: React.ReactNode }> = [
        { label: t.shortcutNewTransaction, keys: <><Kbd>Ctrl</Kbd><Kbd>N</Kbd></> },
        { label: t.shortcutCloseModal, keys: <Kbd>Esc</Kbd> },
        { label: t.shortcutContextMenu, keys: <span className="text-[13px] text-muted">{t.shortcutLongPress}</span> },
    ];

    return (
        <>
            <section className="paper-tile flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0 flex-1">
                    <h3 className="text-[15px] font-bold">{t.baseCurrency}</h3>
                    <p className="text-[13px] text-muted">{t.baseCurrencyDesc}</p>
                </div>
                <Segmented<Currency>
                    size="sm"
                    ariaLabel={t.baseCurrency}
                    value={state.baseCurrency}
                    onChange={currency => setState(prev => ({ ...prev, baseCurrency: currency }))}
                    options={CURRENCIES.map(currency => ({ value: currency, label: currency }))}
                    className="shrink-0"
                />
            </section>

            <button
                type="button"
                onClick={openRates}
                className="paper-tile flex w-full items-center gap-3 p-4 text-left"
            >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                    <LineChart size={19} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-bold">{t.ratesTitle}</span>
                    <span className="block truncate text-[13px] text-muted">
                        {state.rates.provider === 'nbs' && state.rates.listDate
                            ? t.ratesNbsMiddle.replace('{date}', formatMediumDate(new Date(`${state.rates.listDate}T12:00:00`), state.language))
                            : t.ratesSettingsHint}
                    </span>
                </span>
                <ChevronRight size={18} className="shrink-0 text-muted" aria-hidden="true" />
            </button>

            {/* Keyboard shortcuts only matter with a keyboard */}
            <section className="paper-tile hidden px-4 pb-1 pt-4 md:block">
                <h3 className="text-[15px] font-bold">{t.keyboardShortcuts}</h3>
                <ul>
                    {shortcuts.map((shortcut, index) => (
                        <li
                            key={shortcut.label}
                            className={`flex min-h-[48px] items-center justify-between gap-3 ${index < shortcuts.length - 1 ? 'border-b border-hair' : ''}`}
                        >
                            <span className="text-[14px]">{shortcut.label}</span>
                            <span className="flex shrink-0 items-center gap-1">{shortcut.keys}</span>
                        </li>
                    ))}
                </ul>
            </section>
        </>
    );
};
