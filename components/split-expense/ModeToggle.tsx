import React from 'react';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import clsx from 'clsx';
import { ModeToggleProps } from './types';

export const ModeToggle: React.FC<ModeToggleProps> = ({ mode, setMode, language }) => {
    return (
        <div className="px-6 pt-4">
            <div className="flex bg-surface-container rounded-xl p-1">
                <button
                    type="button"
                    onClick={() => setMode('i_paid')}
                    className={clsx(
                        "flex-1 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2",
                        mode === 'i_paid'
                            ? "bg-primary text-on-primary shadow-sm"
                            : "text-on-surface-variant hover:text-on-surface"
                    )}
                >
                    <ArrowUpRight size={16} />
                    {language === 'sr' ? 'Ja sam platio' : 'I paid'}
                </button>
                <button
                    type="button"
                    onClick={() => setMode('they_paid')}
                    className={clsx(
                        "flex-1 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2",
                        mode === 'they_paid'
                            ? "bg-secondary text-on-secondary shadow-sm"
                            : "text-on-surface-variant hover:text-on-surface"
                    )}
                >
                    <ArrowDownLeft size={16} />
                    {language === 'sr' ? 'Neko platio za mene' : 'Someone paid for me'}
                </button>
            </div>
        </div>
    );
};
