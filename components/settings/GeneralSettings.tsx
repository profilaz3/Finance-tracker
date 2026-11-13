import React from 'react';
import { DollarSign, Keyboard } from 'lucide-react';
import clsx from 'clsx';
import { AppState, Currency } from '../../types';
import { TRANSLATIONS } from '../../constants';

interface GeneralSettingsProps {
    state: AppState;
    setState: React.Dispatch<React.SetStateAction<AppState>>;
}

export const GeneralSettings: React.FC<GeneralSettingsProps> = ({ state, setState }) => {
    const t = TRANSLATIONS[state.language];

    return (
        <>
            {/* Base Currency Section */}
            <section className="space-y-4">
                <h3 className="text-lg font-medium text-on-surface">{t.baseCurrency}</h3>
                <div className="flex gap-3">
                    {(['EUR', 'USD', 'RSD'] as Currency[]).map(currency => (
                        <button
                            key={currency}
                            onClick={() => setState(prev => ({ ...prev, baseCurrency: currency }))}
                            className={clsx(
                                "px-4 py-2 rounded-xl font-medium transition-all border flex items-center gap-2",
                                state.baseCurrency === currency
                                    ? "bg-secondary-container text-on-secondary-container border-secondary-container"
                                    : "bg-surface-container-low text-on-surface border-outline/20 hover:bg-surface-container-high"
                            )}
                        >
                            <DollarSign size={18} /> {currency}
                        </button>
                    ))}
                </div>
            </section>

            {/* Keyboard Shortcuts Section */}
            <section className="space-y-4">
                <h3 className="text-lg font-medium text-on-surface flex items-center gap-2">
                    <Keyboard size={20} />
                    {t.keyboardShortcuts}
                </h3>
                <div className="bg-surface-container-low p-4 rounded-xl shadow-elevation-1">
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-on-surface">
                                {t.shortcutNewTransaction}
                            </span>
                            <div className="flex items-center gap-1">
                                <kbd className="px-2 py-1 bg-surface-container rounded text-xs font-mono text-on-surface-variant border border-outline-variant/30">
                                    Ctrl
                                </kbd>
                                <span className="text-on-surface-variant text-xs">+</span>
                                <kbd className="px-2 py-1 bg-surface-container rounded text-xs font-mono text-on-surface-variant border border-outline-variant/30">
                                    N
                                </kbd>
                            </div>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-on-surface">
                                {t.shortcutCloseModal}
                            </span>
                            <kbd className="px-2 py-1 bg-surface-container rounded text-xs font-mono text-on-surface-variant border border-outline-variant/30">
                                Esc
                            </kbd>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-on-surface">
                                {t.shortcutContextMenu}
                            </span>
                            <span className="text-xs text-on-surface-variant">
                                {t.shortcutLongPress}
                            </span>
                        </div>
                    </div>
                </div>
            </section>
        </>
    );
};
