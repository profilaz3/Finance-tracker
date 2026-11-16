import React from 'react';
import { m } from 'motion/react';
import clsx from 'clsx';
import { Check } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { TRANSLATIONS } from '../../constants';
import { MOTION } from '../../config';
import { vibrate, HAPTIC_PATTERNS } from '../../utils/haptics';
import { useDialog } from '../../hooks/useFocusTrap';
import { useSheetDrag } from '../../hooks/useSheetDrag';
import { formatMoney, getIntlLocale } from '../../utils/locale';
import type { SplitExpenseModalProps } from './types';
import { SPLIT_STRINGS } from './splitStrings';
import { listNames } from './splitDraft';
import { useSplitForm } from './useSplitForm';
import { SplitHero } from './SplitHero';
import { SplitPeople } from './SplitPeople';
import { SplitDetails } from './SplitDetails';
import { SplitEventCard } from './SplitEventCard';
import { fitFont } from '../home/parts';

/**
 * Splitting a bill: the total and who paid on a header in the Home header colour, who it is
 * split between as tiles, the event it goes into and, when I paid, the expense's category,
 * wallet and date. The footer says who owes what and saves.
 */
export const SplitExpenseModal: React.FC<SplitExpenseModalProps> = props => {
    const { isOpen, onClose, onSplit, userProfile, categories, accounts, language, transaction, onShowToast, prefill, headerTone = 'accent', appState, onAddPerson } = props;
    const t = TRANSLATIONS[language];
    const s = SPLIT_STRINGS[language];
    const form = useSplitForm(props, s);
    // A new split starts in the total; splitting an entry or a receipt focuses the sheet itself.
    const { dialogProps, titleId } = useDialog(isOpen, onClose, { initialFocus: !transaction && !prefill ? '#split-amount' : undefined });
    const { wrapRef, handleProps } = useSheetDrag(onClose);

    if (!isOpen) return null;

    const { draft, iPaid, blockReason } = form;
    // Whole amounts without the cents, like the tiles.
    const money = (value: number) => {
        const digits = Number.isInteger(Math.round(value * 100) / 100) ? 0 : 2;
        return formatMoney(value, draft.currency, language, { minimumFractionDigits: digits, maximumFractionDigits: digits });
    };

    const fail = (message: string) => {
        vibrate(HAPTIC_PATTERNS.error);
        if (onShowToast) onShowToast(message, 'error');
        else console.error('SplitExpenseModal error (no toast handler):', message);
    };

    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();
        if (blockReason) return;
        if (iPaid) {
            const result = form.submitIPaid(uuidv4());
            if (result.error === 'no-participants') return fail(t.splitErrorNoParticipants);
            if (result.error === 'invalid-amount') return fail(t.splitErrorInvalidAmount);
            if (result.error === 'exceeds-total') return fail(t.splitErrorExceedsTotal);
            // A split started from a scanned receipt keeps the receipt on the expense.
            const saved = result.transaction && prefill?.receiptData && !transaction
                ? { ...result.transaction, receiptData: prefill.receiptData }
                : result.transaction;
            vibrate(HAPTIC_PATTERNS.success);
            onSplit({ transactions: saved ? [saved] : [], balanceUpdates: result.balanceUpdates });
        } else {
            const result = form.submitTheyPaid();
            if (result.error === 'missing-payer') return fail(t.splitErrorNoPayer);
            if (result.error === 'no-amounts') return fail(t.splitErrorNoAmounts);
            vibrate(HAPTIC_PATTERNS.success);
            onSplit({ transactions: result.transactions, balanceUpdates: result.balanceUpdates });
        }
        onClose();
    };

    // Who owes whom once it is saved.
    const summary = (() => {
        if (!iPaid) {
            const payer = form.people.find(person => person.id === draft.payerId);
            return { label: s.youOwe.replace('{name}', payer?.name ?? ''), amount: form.myShare };
        }
        const owing = form.people.flatMap(person => {
            const share = draft.shares.find(item => item.personId === person.id);
            return share?.isIncluded && share.amount > 0.004 ? [{ name: person.name, amount: share.amount }] : [];
        });
        const total = owing.reduce((sum, item) => sum + item.amount, 0);
        if (owing.length === 0) return { label: s.yourShare, amount: form.myShare };
        const label = owing.length === 1
            ? s.owesYouOne.replace('{name}', owing[0].name)
            : s.oweYouMany.replace('{names}', listNames(owing.map(item => item.name), getIntlLocale(language), s.andMore));
        return { label, amount: total };
    })();
    const blockReasonId = 'split-expense-block-reason';

    return (
        <div className="modal-safe-area fixed inset-0 z-50 flex items-end justify-center md:items-center">
            <m.div
                className="paper-scrim absolute inset-0"
                exit={{ opacity: 0 }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={MOTION.backdrop}
                onClick={onClose}
                aria-hidden="true"
            />
            <div ref={wrapRef} className="relative flex w-full justify-center">
                <m.div
                    {...dialogProps}
                    initial={{ y: '100%' }}
                    animate={{ y: 0 }}
                    exit={MOTION.sheet.exit}
                    transition={MOTION.sheet.spring}
                    style={{ maxHeight: 'calc(100dvh - max(1rem, env(safe-area-inset-top)) - max(1rem, env(safe-area-inset-bottom)))' }}
                    className="flex w-full max-w-[480px] flex-col overflow-hidden rounded-[32px] bg-[var(--paper-bg)] text-on-surface shadow-[0_28px_70px_-24px_rgba(0,0,0,0.5)] outline-none"
                >
                    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
                        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain custom-scrollbar">
                            <SplitHero
                                form={form}
                                title={transaction?.splitDetails ? s.titleEdit : s.title}
                                titleId={titleId}
                                tone={headerTone}
                                userProfile={userProfile}
                                event={form.event}
                                showPayers={!transaction}
                                language={language}
                                t={t}
                                s={s}
                                onClose={onClose}
                                handleProps={handleProps}
                            />
                            <div className="space-y-4 px-4 pb-3 pt-4">
                                <SplitPeople form={form} userProfile={userProfile} onAddPerson={onAddPerson} language={language} t={t} s={s} />
                                {iPaid && form.event && appState && (
                                    <SplitEventCard
                                        event={form.event}
                                        state={appState}
                                        pending={form.preview}
                                        userProfile={userProfile}
                                        meLetter={t.meInitial}
                                        language={language}
                                        s={s}
                                    />
                                )}
                                {iPaid
                                    ? <SplitDetails form={form} categories={categories} accounts={accounts} language={language} t={t} s={s} />
                                    : <p className="px-1 text-[13px] font-medium text-muted">{s.debtOnly}</p>}
                            </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-3 border-t border-hair px-4 pb-4 pt-3">
                            <div className="min-w-0 flex-1" aria-live="polite" style={{ containerType: 'inline-size' }}>
                                {blockReason ? (
                                    <p id={blockReasonId} className="text-[13.5px] font-medium leading-snug text-muted">{blockReason}</p>
                                ) : (
                                    <>
                                        <p className="line-clamp-2 text-[13px] font-medium leading-snug text-muted">{summary.label}</p>
                                        <p className="whitespace-nowrap font-bold tabular-nums tracking-[-0.3px]" style={{ fontSize: fitFont(22, money(summary.amount), 0.62) }}>
                                            {money(summary.amount)}
                                        </p>
                                    </>
                                )}
                            </div>
                            <button
                                type="submit"
                                disabled={!!blockReason}
                                aria-describedby={blockReason ? blockReasonId : undefined}
                                className={clsx(
                                    'flex h-[54px] shrink-0 items-center justify-center gap-2 rounded-full bg-accent px-6 text-[16px] font-semibold text-on-accent transition-[transform,opacity]',
                                    blockReason ? 'cursor-not-allowed opacity-50' : 'shadow-[0_10px_24px_-10px_rgb(var(--accent-rgb)/0.75)] active:scale-[0.98]',
                                )}
                            >
                                <Check size={19} strokeWidth={2.6} aria-hidden="true" className="shrink-0" />
                                {s.save}
                            </button>
                        </div>
                    </form>
                </m.div>
            </div>
        </div>
    );
};
