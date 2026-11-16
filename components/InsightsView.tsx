import React, { Suspense, useState } from 'react';
import { lazyWithReload } from '../utils/lazyWithReload';
import { Sparkles, RefreshCw, Calendar, Loader2, AlertCircle } from 'lucide-react';
import { Segmented } from './ui/Segmented';
import { ScreenHero } from './ui/ScreenHero';
import type { AppState, View } from '../types';
import { TRANSLATIONS } from '../constants';
import { formatDate } from '../utils/locale';
import { resolveHomeHeader } from '../domain/homeHeader';
import { generateInsights, isAIAvailable } from '../services/aiService';
import { subscribeAiErrors, type AiErrorKind } from '../services/aiErrors';
import { useLetterHero } from './insights';
import { INSIGHTS_STRINGS } from './insights/insightsStrings';
import { AskPanel } from './ask/AskPanel';
import { Illustration } from './ui/Illustration';

const MarkdownRenderer = lazyWithReload(() => import('react-markdown'));

interface InsightsViewProps {
    /** The active workspace's data: the letter, suggestions and the report read it. */
    state: AppState;
    /** Switches to the Numbers side of Insights. */
    onNavigate?: (view: View) => void;
}

/**
 * The AI side of Insights: last month's letter in the header, then asking about your money
 * (the last answer, questions to start with and the Ask field) and the longer AI report.
 */
export const InsightsView: React.FC<InsightsViewProps> = ({ state, onNavigate }) => {
    const { transactions, categories, baseCurrency, language } = state;
    const t = TRANSLATIONS[language];
    const s = INSIGHTS_STRINGS[language];
    const letter = useLetterHero({ state, language, s });
    const [period, setPeriod] = useState<'weekly' | 'monthly'>('weekly');
    const [report, setReport] = useState<string | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    // Why the last report failed; the message is worded from it at render time.
    const [error, setError] = useState<AiErrorKind | 'not-configured' | null>(null);
    const [generatedAt, setGeneratedAt] = useState<Date | null>(null);

    const handleGenerate = async () => {
        if (!isAIAvailable()) {
            setError('not-configured');
            return;
        }

        setIsGenerating(true);
        setError(null);

        // The AI call resolves to null on failure; the error bus says why.
        let reason: AiErrorKind | null = null;
        const unsubscribe = subscribeAiErrors(info => {
            if (info.fn === 'generate-insights') reason = info.kind;
        });
        const failed = () => {
            const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
            setError(offline ? 'network' : reason ?? 'unknown');
        };

        try {
            const result = await generateInsights(transactions, categories, period, baseCurrency, language);
            if (result) {
                setReport(result);
                setGeneratedAt(new Date());
            } else {
                failed();
            }
        } catch (err) {
            console.error('Insights generation failed:', err);
            failed();
        } finally {
            unsubscribe();
            setIsGenerating(false);
        }
    };

    const isOffline = error === 'network' && typeof navigator !== 'undefined' && navigator.onLine === false;
    const errorMessage = error === 'not-configured'
        ? t.aiConfigureHint
        : error === 'quota'
            ? t.aiDailyLimitReached
            : error === 'unavailable'
                ? t.aiServiceUnavailable
                : error === 'network'
                    ? (isOffline ? t.insightsFailedOffline : t.insightsFailedNetwork)
                    : t.insightsFailedGeneric;

    const aiAvailable = isAIAvailable();

    const generateButton = (label: string, Icon: typeof Sparkles, disabled: boolean) => (
        <button
            type="button"
            onClick={handleGenerate}
            disabled={disabled}
            className="flex h-11 items-center gap-2 rounded-full bg-accent px-5 text-[15px] font-semibold text-on-accent transition-opacity disabled:cursor-not-allowed disabled:opacity-45"
        >
            <Icon size={18} aria-hidden="true" />
            {label}
        </button>
    );

    return (
        <div className="mx-auto max-w-[920px] pb-28">
            <ScreenHero tone={resolveHomeHeader(state.homeHeader).tone} label={t.navInsights}>
                <div className="flex h-[60px] items-center gap-3 px-3 md:px-4">
                    <h1 className="min-w-0 flex-1 truncate pl-1 text-[28px] font-bold tracking-[-0.03em]">{t.navInsights}</h1>
                    {onNavigate && (
                        <Segmented<View>
                            tone="hero"
                            size="sm"
                            ariaLabel={s.viewSwitch}
                            value="insights"
                            onChange={onNavigate}
                            options={[{ value: 'analytics', label: s.numbers }, { value: 'insights', label: s.askAi }]}
                        />
                    )}
                </div>
                <div className="px-4 pb-[42px] pt-2 md:px-5 md:pb-5">{letter.hero}</div>
            </ScreenHero>

            <div className="screen-sheet flex flex-col gap-6">
                {aiAvailable ? (
                    <AskPanel
                        state={state}
                        labels={{
                            totalsOnly: s.totalsOnly,
                            askAnything: s.askAnything,
                            lastQuestion: s.lastQuestion,
                            workedOut: s.workedOut,
                            openChat: s.openChat,
                        }}
                    />
                ) : (
                    <div className="paper-tile flex items-start gap-3 p-4">
                        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[12px] bg-chip text-neg" aria-hidden="true">
                            <AlertCircle size={18} />
                        </span>
                        <div className="min-w-0">
                            <p className="text-[15px] font-semibold">{t.aiUnavailable}</p>
                            <p className="mt-0.5 text-[13px] leading-snug text-muted">{t.aiConfigureHint}</p>
                        </div>
                    </div>
                )}

                <section className="paper-tile overflow-hidden" aria-labelledby="ai-report-title">
                    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-3 p-4">
                        <div className="min-w-0 flex-1 basis-[200px]">
                            <h2 id="ai-report-title" className="text-[19px] font-bold tracking-[-0.3px]">{s.reportTitle}</h2>
                            <p className="mt-0.5 text-[13.5px] leading-snug text-muted">{s.reportHint}</p>
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
                    </div>

                    <div aria-live="polite">
                        {!report && !isGenerating && !error && (
                            <div className="px-4 pb-4">{generateButton(t.generateReport, Sparkles, !aiAvailable)}</div>
                        )}

                        {isGenerating && (
                            <div className="flex items-center gap-3 px-4 pb-5" role="status">
                                <span className="flex h-11 w-11 flex-none items-center justify-center rounded-[16px] bg-accent-soft text-accent" aria-hidden="true">
                                    <Loader2 className="animate-spin" size={22} />
                                </span>
                                <span className="min-w-0">
                                    <span className="block text-[15px] font-semibold">{t.analyzing}</span>
                                    <span className="block text-[13px] text-muted">{t.analyzingDesc}</span>
                                </span>
                            </div>
                        )}

                        {report && !isGenerating && (
                            <div className="border-t border-hair p-4 sm:p-6">
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
                                        className="flex h-10 flex-none items-center gap-1.5 rounded-full bg-chip px-3.5 text-[13px] font-semibold disabled:opacity-45"
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
                            <div role="alert" className="flex flex-col items-center gap-3 border-t border-hair px-6 py-8 text-center">
                                {isOffline ? (
                                    <span className="relative h-[88px] w-[112px]" aria-hidden="true">
                                        <Illustration name="offline" />
                                    </span>
                                ) : (
                                    <span className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-chip text-neg" aria-hidden="true">
                                        <AlertCircle size={26} />
                                    </span>
                                )}
                                <h3 className="text-[17px] font-bold tracking-[-0.3px]">{t.analysisFailed}</h3>
                                <p className="max-w-sm text-[14px] leading-snug text-muted">{errorMessage}</p>
                                {/* A spent daily limit will not reset by trying again now. */}
                                {error !== 'quota' && <div className="mt-2">{generateButton(t.tryAgain, RefreshCw, !aiAvailable)}</div>}
                            </div>
                        )}
                    </div>
                </section>
            </div>

            {letter.sheet}
        </div>
    );
};
