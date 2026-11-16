import React, { useRef, useState } from 'react';
import clsx from 'clsx';
import { AnimatePresence, m } from 'motion/react';
import { AlertCircle, CalendarDays, ChevronDown, SlidersHorizontal } from 'lucide-react';
import { TRANSLATIONS } from '../../constants';
import type { Account, Category } from '../../types';
import { CategoryGlyph } from '../ui/CategoryGlyph';
import { AccountGlyph } from '../ui/AccountGlyph';
import { AmountInput } from '../ui/AmountInput';
import { localizeCategoryName } from '../../utils/systemText';
import { formatMoney } from '../../utils/locale';
import { CategoryChips, WalletList, orderCategories } from '../transaction-modal/Pickers';
import { DatePanel, TimeField, dateTileText } from '../transaction-modal/DateFields';
import type { SplitForm } from './useSplitForm';
import type { SplitStrings } from './splitStrings';

type Panel = 'category' | 'wallet' | 'date' | 'more' | null;

interface SplitDetailsProps {
    form: SplitForm;
    categories: Category[];
    accounts: Account[];
    language: 'en' | 'sr';
    t: typeof TRANSLATIONS['en'];
    s: SplitStrings;
}

const PANEL_ID = 'split-details-panel';

const Chip: React.FC<{ open: boolean; label: string; onClick: () => void; children: React.ReactNode }> = ({ open, label, onClick, children }) => (
    <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? PANEL_ID : undefined}
        onClick={onClick}
        className={clsx(
            'flex h-11 min-w-0 max-w-full items-center gap-2 rounded-full bg-[var(--paper-tile)] py-1 pl-1 pr-3.5 text-[14.5px] font-semibold transition-shadow duration-150',
            open ? 'shadow-[inset_0_0_0_2px_rgb(var(--accent-rgb))]' : 'shadow-[inset_0_0_0_1px_var(--paper-line)]',
        )}
    >
        <span className="sr-only">{label}: </span>
        {children}
    </button>
);

/**
 * The expense's category, wallet and date as chips (each opens its picker below), and More for
 * the time and card fees. Only when I paid: someone else paying makes no wallet entry.
 */
export const SplitDetails: React.FC<SplitDetailsProps> = ({ form, categories, accounts, language, t, s }) => {
    const { draft } = form;
    const [panel, setPanel] = useState<Panel>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const toggle = (next: Panel) => setPanel(current => (current === next ? null : next));
    const close = () => setPanel(null);
    const expenseCategories = orderCategories(categories.filter(item => item.type === 'expense'));
    const category = categories.find(item => item.id === draft.categoryId);
    const wallet = accounts.find(item => item.id === draft.accountId);
    const day = dateTileText(draft.date, language, t);

    let content: React.ReactNode = null;
    if (panel === 'category') {
        content = (
            <CategoryChips
                categories={expenseCategories}
                value={draft.categoryId}
                onPick={item => {
                    form.pickCategory(item);
                    close();
                }}
                language={language}
                t={t}
            />
        );
    } else if (panel === 'wallet') {
        content = (
            <WalletList
                wallets={accounts}
                value={draft.accountId}
                onPick={id => {
                    form.set('accountId', id);
                    close();
                }}
                label={t.wallet}
            />
        );
    } else if (panel === 'date') {
        content = <DatePanel date={draft.date} onChange={date => form.set('date', date)} onPicked={close} language={language} t={t} inputId="split-date" />;
    } else if (panel === 'more') {
        content = (
            <div className="space-y-3 p-1.5">
                <TimeField date={draft.date} onChange={date => form.set('date', date)} t={t} inputId="split-time" />
                <div>
                    {/* Fees are typed and stored in USD (domain/money.ts); what they add shows in the split currency. */}
                    <label htmlFor="split-fees" className="mb-1.5 block px-1 text-[13px] font-semibold text-muted">{s.fees}</label>
                    <div className="relative">
                        <AmountInput
                            id="split-fees"
                            language={language}
                            value={draft.fees}
                            emptyWhenZero
                            onValueChange={form.onFeesChange}
                            placeholder="0"
                            aria-invalid={form.feesInvalid}
                            aria-describedby={form.feesInvalid ? 'split-fees-error' : form.feesInSplitCurrency > 0 && draft.currency !== 'USD' ? 'split-fees-converted' : undefined}
                            className={clsx(
                                'h-12 w-full rounded-[14px] border-none bg-chip pl-4 pr-14 text-[16px] font-semibold tabular-nums text-on-surface outline-none placeholder:text-faint focus:ring-2',
                                form.feesInvalid ? 'ring-2 ring-neg focus:ring-neg' : 'focus:ring-accent',
                            )}
                        />
                        <span aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-muted">USD</span>
                    </div>
                    {form.feesInvalid ? (
                        <p id="split-fees-error" role="alert" className="mt-1 flex items-center gap-1 px-1 text-[12px] font-medium text-neg">
                            <AlertCircle size={12} aria-hidden="true" className="shrink-0" />
                            {t.splitErrorInvalidAmount}
                        </p>
                    ) : form.feesInSplitCurrency > 0 && draft.currency !== 'USD' ? (
                        <p id="split-fees-converted" className="mt-1 px-1 text-[12px] text-muted">
                            {t.splitFeesAdded.replace('{amount}', formatMoney(form.feesInSplitCurrency, draft.currency, language))}
                        </p>
                    ) : null}
                </div>
            </div>
        );
    }

    return (
        <div>
            <div className="flex flex-wrap gap-2">
                <Chip open={panel === 'category'} label={t.category} onClick={() => toggle('category')}>
                    <CategoryGlyph category={category} size={34} shape="circle" tone="solid" />
                    <span className="truncate">{category ? localizeCategoryName(category, language) : t.category}</span>
                </Chip>
                <Chip open={panel === 'wallet'} label={t.wallet} onClick={() => toggle('wallet')}>
                    {wallet ? <AccountGlyph account={wallet} size={34} /> : <span className="h-[34px] w-[34px] rounded-full bg-chip" aria-hidden="true" />}
                    <span className="truncate">{wallet?.name ?? t.chooseWallet}</span>
                </Chip>
                <Chip open={panel === 'date'} label={t.date} onClick={() => toggle('date')}>
                    <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-on-surface text-[var(--paper-bg)]" aria-hidden="true">
                        <CalendarDays size={16} />
                    </span>
                    <span className="truncate">{day.name}</span>
                </Chip>
                <button
                    type="button"
                    aria-expanded={panel === 'more'}
                    aria-controls={panel === 'more' ? PANEL_ID : undefined}
                    onClick={() => toggle('more')}
                    className={clsx(
                        'flex h-11 items-center gap-1.5 rounded-full px-3.5 text-[14.5px] font-semibold text-muted transition-shadow duration-150',
                        panel === 'more' ? 'shadow-[inset_0_0_0_2px_rgb(var(--accent-rgb))]' : 'shadow-[inset_0_0_0_1px_var(--paper-line)]',
                    )}
                >
                    <SlidersHorizontal size={16} aria-hidden="true" />
                    {s.more}
                    <span className="sr-only">: {s.moreHint}</span>
                    <ChevronDown size={15} aria-hidden="true" className={clsx('transition-transform', panel === 'more' && 'rotate-180')} />
                </button>
            </div>

            <AnimatePresence initial={false}>
                {content && (
                    <m.div
                        key={panel}
                        id={PANEL_ID}
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 520, damping: 44 }}
                        // Bring a picker that opened below the fold into view.
                        onAnimationComplete={definition => {
                            if ((definition as { height?: unknown }).height === 'auto') panelRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                        }}
                        className="overflow-hidden"
                    >
                        <div ref={panelRef} className="pt-2.5">
                            <div className="paper-tile p-2">{content}</div>
                        </div>
                    </m.div>
                )}
            </AnimatePresence>
        </div>
    );
};
