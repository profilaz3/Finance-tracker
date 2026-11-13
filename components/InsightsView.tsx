import React, { Suspense, useState } from 'react';
import { lazyWithReload } from '../utils/lazyWithReload';
import { m, Variants } from 'motion/react';
import { Sparkles, RefreshCw, Calendar, Loader2, AlertCircle } from 'lucide-react';
import { Segmented } from './ui/Segmented';
import { Transaction, Category, Currency } from '../types';
import { TRANSLATIONS } from '../constants';
import { formatDate } from '../utils/locale';
import { generateInsights, isAIAvailable } from '../services/aiService';
import { MonthlyLetterCard } from './insights';
import type { LetterInputs } from '../domain/monthlyLetter';
import { AskBar } from './ask/AskBar';

const MarkdownRenderer = lazyWithReload(() => import('react-markdown'));

interface InsightsViewProps {
    transactions: Transaction[];
    categories: Category[];
    baseCurrency: Currency;
    language: 'en' | 'sr';
    /** Active workspace data for the monthly letter; without it the letter card is hidden. */
    letterState?: LetterInputs;
}

const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: {
            staggerChildren: 0.04,
            delayChildren: 0.05,
            when: "beforeChildren"
        }
    },
    exit: {
        opacity: 0,
        transition: { duration: 0.2 }
    }
};

const itemVariants: Variants = {
    hidden: { y: 20, opacity: 0, scale: 0.98 },
    visible: {
        y: 0,
        opacity: 1,
        scale: 1,
        transition: {
            type: "spring",
            stiffness: 400,
            damping: 25,
            mass: 0.8
        }
    }
};

export const InsightsView: React.FC<InsightsViewProps> = ({
    transactions,
    categories,
    baseCurrency,
    language,
    letterState
}) => {
    const t = TRANSLATIONS[language];
    const [period, setPeriod] = useState<'weekly' | 'monthly'>('weekly');
    const [report, setReport] = useState<string | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [generatedAt, setGeneratedAt] = useState<Date | null>(null);

    const handleGenerate = async () => {
        if (!isAIAvailable()) {
            setError(t.aiUnavailable);
            return;
        }

        setIsGenerating(true);
        setError(null);

        try {
            const result = await generateInsights(
                transactions,
                categories,
                period,
                baseCurrency,
                language
            );

            if (result) {
                setReport(result);
                setGeneratedAt(new Date());
            } else {
                setError(t.analysisFailed);
            }
        } catch (err) {
            console.error('Insights generation failed:', err);
            setError(t.analysisFailed);
        } finally {
            setIsGenerating(false);
        }
    };

    const aiAvailable = isAIAvailable();

    const generateButton = (label: string, Icon: typeof Sparkles, disabled: boolean) => (
        <button
            type="button"
            onClick={handleGenerate}
            disabled={disabled}
            className="mx-auto flex h-11 items-center gap-2 rounded-full bg-accent px-5 text-[15px] font-semibold text-on-accent transition-opacity disabled:cursor-not-allowed disabled:opacity-45"
        >
            <Icon size={18} aria-hidden="true" />
            {label}
        </button>
    );

    return (
        <m.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="mx-auto flex max-w-3xl flex-col gap-3 px-1 pb-20 sm:gap-4"
        >
            <m.header variants={itemVariants} className="flex flex-wrap items-end justify-between gap-x-3 gap-y-3">
                <div className="min-w-0">
                    <h1 className="text-[28px] font-bold leading-tight tracking-[-0.6px]">{t.aiInsights}</h1>
                    <p className="text-[13px] text-muted">{t.aiDescription}</p>
                </div>
                <Segmented<'weekly' | 'monthly'>
                    size="sm"
                    ariaLabel={t.timePeriod}
                    value={period}
                    onChange={setPeriod}
                    options={[
                        { value: 'weekly', label: t.weekly },
                        { value: 'monthly', label: t.monthly },
                    ]}
                />
            </m.header>

            {aiAvailable && (
                <m.div variants={itemVariants}>
                    <AskBar language={language} />
                </m.div>
            )}

            {letterState && (
                <m.div variants={itemVariants}>
                    <MonthlyLetterCard state={letterState} language={language} />
                </m.div>
            )}

            {!aiAvailable && (
                <m.div variants={itemVariants} className="paper-tile flex items-start gap-3 p-4">
                    <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[12px] bg-chip text-neg" aria-hidden="true">
                        <AlertCircle size={18} />
                    </span>
                    <div className="min-w-0">
                        <p className="text-[15px] font-semibold">{t.aiUnavailable}</p>
                        <p className="mt-0.5 text-[13px] leading-snug text-muted">{t.aiConfigureHint}</p>
                    </div>
                </m.div>
            )}

            <m.section variants={itemVariants} className="paper-tile overflow-hidden" aria-live="polite">
                {!report && !isGenerating && !error && (
                    <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
                        <span className="accent-card flex h-14 w-14 items-center justify-center rounded-[20px] text-white" aria-hidden="true">
                            <Sparkles size={26} />
                        </span>
                        <h2 className="text-[19px] font-bold tracking-[-0.3px]">{t.readyToAnalyze}</h2>
                        <p className="mx-auto max-w-sm text-[14px] leading-snug text-muted">{t.clickToGenerate}</p>
                        <div className="mt-2">{generateButton(t.generateReport, Sparkles, !aiAvailable || isGenerating)}</div>
                    </div>
                )}

                {isGenerating && (
                    <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
                        <span className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-accent-soft text-accent" aria-hidden="true">
                            <Loader2 className="animate-spin" size={26} />
                        </span>
                        <h2 className="text-[19px] font-bold tracking-[-0.3px]">{t.analyzing}</h2>
                        <p className="text-[14px] text-muted">{t.analyzingDesc}</p>
                    </div>
                )}

                {report && !isGenerating && (
                    <div className="p-4 sm:p-6">
                        <div className="mb-4 flex items-center justify-between gap-3 border-b border-hair pb-3">
                            <div className="flex min-w-0 items-center gap-2 text-[13px] text-muted">
                                <Calendar size={15} aria-hidden="true" className="flex-none" />
                                {generatedAt && (
                                    <span className="truncate">
                                        {t.generatedOn} {formatDate(generatedAt, {
                                            month: 'short',
                                            day: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit'
                                        }, language)}
                                    </span>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={handleGenerate}
                                disabled={!aiAvailable || isGenerating}
                                className="flex h-9 flex-none items-center gap-1.5 rounded-full bg-chip px-3.5 text-[13px] font-semibold disabled:opacity-45"
                            >
                                <RefreshCw size={15} aria-hidden="true" />
                                {t.regenerate}
                            </button>
                        </div>

                        <div className="max-w-none text-[15px] leading-relaxed text-muted
                            [&_h1]:mb-2 [&_h1]:mt-5 [&_h1]:text-[20px] [&_h1]:font-bold [&_h1]:text-on-surface
                            [&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-[17px] [&_h2]:font-bold [&_h2]:tracking-[-0.3px] [&_h2]:text-on-surface
                            [&_h3]:mb-1.5 [&_h3]:mt-4 [&_h3]:text-[15px] [&_h3]:font-semibold [&_h3]:text-on-surface
                            [&_p]:my-2 [&_strong]:font-semibold [&_strong]:text-on-surface
                            [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1
                            [&_a]:text-accent [&_a]:underline-offset-2 hover:[&_a]:underline
                        ">
                            <Suspense fallback={<div className="text-[13px] text-muted">{t.analyzing}</div>}>
                                <MarkdownRenderer>{report}</MarkdownRenderer>
                            </Suspense>
                        </div>
                    </div>
                )}

                {error && !isGenerating && (
                    <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
                        <span className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-chip text-neg" aria-hidden="true">
                            <AlertCircle size={26} />
                        </span>
                        <h2 className="text-[19px] font-bold tracking-[-0.3px]">{t.analysisFailed}</h2>
                        <p className="max-w-sm text-[14px] leading-snug text-muted">{error}</p>
                        <div className="mt-2">{generateButton(t.tryAgain, RefreshCw, !aiAvailable)}</div>
                    </div>
                )}
            </m.section>
        </m.div>
    );
};
