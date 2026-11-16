import React from 'react';
import { AppState, Currency } from '../../types';
import { TRANSLATIONS } from '../../constants';
import { Segmented } from '../ui/Segmented';
import { ChevronRight } from 'lucide-react';
import { CurrencyFlag, CurrencyPair } from '../ui/CurrencyFlag';
import { formatMediumDate } from '../../utils/locale';
import { openRates } from '../rates/ratesBus';
import { SHORTCUTS_HELP_EVENT } from '../app/AppNavigation';
import { SETTINGS_STRINGS } from './settingsStrings';

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
        { label: t.shortcutNewTransaction, keys: <Kbd>N</Kbd> },
        { label: t.shortcutCloseModal, keys: <Kbd>Esc</Kbd> },
        { label: t.shortcutContextMenu, keys: <span className="text-[13px] text-muted">{t.shortcutLongPress}</span> },
    ];

    return (
        <>
            <section className="paper-tile flex flex-wrap items-center justify-between gap-3 p-4">
                <h3 className="min-w-[150px] flex-1 text-[15px] font-bold">{t.languageLabel}</h3>
                <Segmented<AppState['language']>
                    size="sm"
                    ariaLabel={t.languageLabel}
                    value={state.language}
                    onChange={language => setState(prev => ({ ...prev, language }))}
                    options={[
                        { value: 'en', label: 'English' },
                        { value: 'sr', label: 'Srpski' },
                    ]}
                    className="shrink-0"
                />
            </section>

            <section className="paper-tile flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-[150px] flex-1">
                    <h3 className="text-[15px] font-bold">{t.baseCurrency}</h3>
                    <p className="text-[13px] text-muted">{t.baseCurrencyDesc}</p>
                </div>
                <Segmented<Currency>
                    size="sm"
                    ariaLabel={t.baseCurrency}
                    value={state.baseCurrency}
                    onChange={currency => setState(prev => ({ ...prev, baseCurrency: currency }))}
                    options={CURRENCIES.map(currency => ({
                        value: currency,
                        label: (
                            <span className="flex items-center gap-1.5">
                                <CurrencyFlag currency={currency} size={16} />
                                {currency}
                            </span>
                        ),
                    }))}
                    className="shrink-0"
                />
            </section>

            <button
                type="button"
                onClick={openRates}
                className="paper-tile flex w-full items-center gap-3 p-4 text-left"
            >
                <CurrencyPair base="EUR" quote="RSD" size={30} className="w-[52px]" />
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
                <button
                    type="button"
                    onClick={() => window.dispatchEvent(new Event(SHORTCUTS_HELP_EVENT))}
                    className="-mx-1 mb-2 mt-1 flex h-11 items-center gap-2 rounded-full px-3 text-[15px] font-semibold text-accent"
                >
                    {SETTINGS_STRINGS[state.language].allShortcuts}
                    <Kbd>?</Kbd>
                </button>
            </section>
        </>
    );
};
