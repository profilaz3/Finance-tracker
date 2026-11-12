import React, { Suspense, useState } from 'react';
import { motion, Variants } from 'motion/react';
import { Sparkles, RefreshCw, Calendar, Loader2, AlertCircle } from 'lucide-react';
import clsx from 'clsx';
import { Transaction, Category, Currency } from '../types';
import { TRANSLATIONS } from '../constants';
import { generateInsights, isAIAvailable } from '../services/aiService';

const MarkdownRenderer = React.lazy(() => import('react-markdown'));

interface InsightsViewProps {
    transactions: Transaction[];
    categories: Category[];
    baseCurrency: Currency;
    language: 'en' | 'sr';
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
    language
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

    return (
        <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="max-w-3xl mx-auto space-y-6 pb-20"
        >
            {/* Header */}
            <motion.div variants={itemVariants} className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-display font-medium text-on-surface flex items-center gap-2">
                        <Sparkles className="text-primary" size={24} />
                        {t.aiInsights}
                    </h2>
                    <p className="text-sm text-on-surface-variant mt-1">{t.aiDescription}</p>
                </div>

                {/* Period Toggle */}
                <div className="bg-surface-container rounded-full p-1 flex gap-1">
                    <button
                        onClick={() => setPeriod('weekly')}
                        className={clsx(
                            "px-4 py-2 rounded-full text-sm font-medium transition-all",
                            period === 'weekly'
                                ? "bg-secondary-container text-on-secondary-container shadow-sm"
                                : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
                        )}
                    >
                        {t.weekly}
                    </button>
                    <button
                        onClick={() => setPeriod('monthly')}
                        className={clsx(
                            "px-4 py-2 rounded-full text-sm font-medium transition-all",
                            period === 'monthly'
                                ? "bg-secondary-container text-on-secondary-container shadow-sm"
                                : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
                        )}
                    >
                        {t.monthly}
                    </button>
                </div>
            </motion.div>

            {/* AI Backend Warning */}
            {!aiAvailable && (
                <motion.div
                    variants={itemVariants}
                    className="bg-error-container/20 border border-error/30 rounded-xl p-4 flex items-start gap-3"
                >
                    <AlertCircle className="text-error flex-shrink-0 mt-0.5" size={20} />
                    <div>
                        <p className="text-sm text-on-surface font-medium">{t.aiUnavailable}</p>
                        <p className="text-xs text-on-surface-variant mt-1">
                            Configure Supabase and the AI edge function secret to enable AI features.
                        </p>
                    </div>
                </motion.div>
            )}

            {/* Main Content */}
            <motion.div
                variants={itemVariants}
                className="bg-surface-container-low rounded-xl shadow-elevation-1 overflow-hidden"
            >
                {!report && !isGenerating && (
                    <div className="p-8 text-center">
                        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
                            <Sparkles className="text-primary" size={32} />
                        </div>
                        <h3 className="text-lg font-medium text-on-surface mb-2">{t.readyToAnalyze}</h3>
                        <p className="text-sm text-on-surface-variant mb-6 max-w-sm mx-auto">
                            {t.clickToGenerate}
                        </p>
                        <button
                            onClick={handleGenerate}
                            disabled={!aiAvailable || isGenerating}
                            className="px-6 py-3 bg-primary text-on-primary rounded-full font-medium transition-all hover:shadow-elevation-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 mx-auto"
                        >
                            <Sparkles size={18} />
                            {t.generateReport}
                        </button>
                    </div>
                )}

                {isGenerating && (
                    <div className="p-8 text-center">
                        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
                            <Loader2 className="text-primary animate-spin" size={32} />
                        </div>
                        <h3 className="text-lg font-medium text-on-surface mb-2">{t.analyzing}</h3>
                        <p className="text-sm text-on-surface-variant">{t.analyzingDesc}</p>
                    </div>
                )}

                {report && !isGenerating && (
                    <div className="p-6">
                        {/* Report Header */}
                        <div className="flex justify-between items-center mb-6 pb-4 border-b border-outline-variant/20">
                            <div className="flex items-center gap-2 text-sm text-on-surface-variant">
                                <Calendar size={16} />
                                {generatedAt && (
                                    <span>
                                        {t.generatedOn} {generatedAt.toLocaleDateString(language === 'sr' ? 'sr-RS' : 'en-US', {
                                            month: 'short',
                                            day: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit'
                                        })}
                                    </span>
                                )}
                            </div>
                            <button
                                onClick={handleGenerate}
                                disabled={!aiAvailable || isGenerating}
                                className="px-4 py-2 text-sm text-primary hover:bg-primary-container/30 rounded-full transition-colors flex items-center gap-2 disabled:opacity-50"
                            >
                                <RefreshCw size={16} />
                                {t.regenerate}
                            </button>
                        </div>

                        {/* Markdown Report */}
                        <div className="prose prose-invert max-w-none
                            prose-headings:text-on-surface prose-headings:font-display
                            prose-h2:text-xl prose-h2:mt-6 prose-h2:mb-3 prose-h2:flex prose-h2:items-center prose-h2:gap-2
                            prose-p:text-on-surface-variant prose-p:leading-relaxed
                            prose-strong:text-on-surface prose-strong:font-semibold
                            prose-ul:text-on-surface-variant prose-ul:my-2
                            prose-li:my-1
                            prose-a:text-primary prose-a:no-underline hover:prose-a:underline
                        ">
                            <Suspense fallback={<div className="text-sm text-on-surface-variant">{t.analyzing}</div>}>
                                <MarkdownRenderer>{report}</MarkdownRenderer>
                            </Suspense>
                        </div>
                    </div>
                )}

                {error && !isGenerating && (
                    <div className="p-8 text-center">
                        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-error/10 flex items-center justify-center">
                            <AlertCircle className="text-error" size={32} />
                        </div>
                        <h3 className="text-lg font-medium text-on-surface mb-2">{t.analysisFailed}</h3>
                        <p className="text-sm text-on-surface-variant mb-6">{error}</p>
                        <button
                            onClick={handleGenerate}
                            disabled={!aiAvailable}
                            className="px-6 py-3 bg-primary text-on-primary rounded-full font-medium transition-all hover:shadow-elevation-2 disabled:opacity-50 flex items-center gap-2 mx-auto"
                        >
                            <RefreshCw size={18} />
                            {t.tryAgain}
                        </button>
                    </div>
                )}
            </motion.div>
        </motion.div>
    );
};
