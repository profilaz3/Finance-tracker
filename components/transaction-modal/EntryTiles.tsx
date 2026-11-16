import React, { useRef } from 'react';
import clsx from 'clsx';
import { AnimatePresence, m } from 'motion/react';
import { AlertCircle, CalendarDays } from 'lucide-react';
import { TRANSLATIONS } from '../../constants';
import type { Account, Category } from '../../types';
import { CategoryGlyph } from '../ui/CategoryGlyph';
import { AccountGlyph } from '../ui/AccountGlyph';
import { localizeCategoryName, localizeSubcategory } from '../../utils/systemText';
import { CategoryChips, WalletList, orderCategories } from './Pickers';
import { formatNumber } from '../../utils/locale';
import { TRANSFER_CATEGORY_ID } from '../../domain/transactions';
import { DatePanel, dateTileText } from './DateFields';
import type { EntryForm } from './useEntryForm';
import type { EntryStrings } from './entryStrings';

/** What the space under the tiles shows: the keypad, one of the pickers, or More. */
export type EntryPanel = 'keypad' | 'category' | 'wallet' | 'target' | 'date' | 'more' | null;

interface EntryTilesProps {
    form: EntryForm;
    accounts: Account[];
    categories: Category[];
    /** Wallet balances by id (without rates they are left out). */
    balances: Map<string, number> | null;
    panel: EntryPanel;
    /** Opens a picker, or closes it when it is already open. */
    onToggle: (panel: EntryPanel) => void;
    /** A choice was made: the picker closes. */
    onPicked: () => void;
    language: 'en' | 'sr';
    t: typeof TRANSLATIONS['en'];
    s: EntryStrings;
}

const PANEL_ID = 'edit-tx-picker';

const FieldError: React.FC<{ message: string | null }> = ({ message }) =>
    message ? (
        <p role="alert" className="mt-1.5 flex items-center gap-1 px-1 text-[12.5px] font-medium text-neg">
            <AlertCircle size={13} aria-hidden="true" className="shrink-0" />
            {message}
        </p>
    ) : null;

interface TileProps {
    label: string;
    name: string;
    sub?: string;
    glyph: React.ReactNode;
    open: boolean;
    invalid?: boolean;
    onClick: () => void;
    /** The sub line is an amount: it wraps instead of being cut. */
    subIsAmount?: boolean;
}

const Tile: React.FC<TileProps> = ({ label, name, sub, glyph, open, invalid, onClick, subIsAmount }) => (
    <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? PANEL_ID : undefined}
        onClick={onClick}
        className={clsx(
            'flex min-w-0 flex-col items-start gap-2.5 rounded-[20px] bg-[var(--paper-tile)] p-3 text-left transition-shadow duration-150',
            open
                ? 'shadow-[inset_0_0_0_2px_rgb(var(--accent-rgb))]'
                : invalid
                    ? 'shadow-[inset_0_0_0_1.5px_var(--paper-neg)]'
                    : 'shadow-[inset_0_0_0_1px_var(--paper-line)]',
        )}
    >
        {glyph}
        <span className="block w-full min-w-0">
            <span className="sr-only">{label}: </span>
            <span className="line-clamp-2 break-words text-[15px] font-semibold leading-[1.25]">{name}</span>
            {sub && (
                <span className={clsx('mt-0.5 block text-[12.5px] font-medium leading-snug text-muted', subIsAmount ? 'whitespace-nowrap tabular-nums' : 'truncate')}>
                    {sub}
                </span>
            )}
        </span>
    </button>
);

/**
 * Category, wallet and date as three tiles (From, To and date for a transfer). A tile opens its
 * picker under the tiles, in place of the keypad; a pick closes it again.
 */
export const EntryTiles: React.FC<EntryTilesProps> = ({ form, accounts, categories, balances, panel, onToggle, onPicked, language, t, s }) => {
    const { edited, kind, errors } = form;
    const isTransfer = kind === 'transfer';
    const category = categories.find(item => item.id === edited.categoryId);
    const account = accounts.find(item => item.id === edited.accountId);
    const target = accounts.find(item => item.id === form.targetAccountId);
    const day = dateTileText(edited.date, language, t);
    const panelRef = useRef<HTMLDivElement>(null);
    // The wallet's currency is on its glyph: the balance is the plain number.
    const balance = (wallet: Account) => {
        const value = balances?.get(wallet.id);
        return value === undefined ? undefined : formatNumber(Math.round(value), { maximumFractionDigits: 0 }, language);
    };
    // Only categories of the entry's own kind: picking one never turns an expense into income.
    const ofKind = categories.filter(item => item.type === edited.type && item.id !== TRANSFER_CATEGORY_ID);
    const ordered = orderCategories(ofKind);
    // A stored subcategory that is no longer in the list still shows, so it is not lost silently.
    const subcategories = isTransfer ? [] : [
        ...(category?.subcategories ?? []),
        ...(edited.subcategory && !category?.subcategories?.includes(edited.subcategory) ? [edited.subcategory] : []),
    ];

    const walletTile = (wallet: Account | undefined, which: 'wallet' | 'target', label: string, empty: string, invalid: boolean) => (
        <Tile
            label={label}
            name={wallet?.name ?? empty}
            sub={wallet ? balance(wallet) ?? wallet.currency : undefined}
            subIsAmount
            glyph={wallet ? <AccountGlyph account={wallet} size={32} /> : <span className="h-8 w-8 rounded-full bg-chip" aria-hidden="true" />}
            open={panel === which}
            invalid={invalid}
            onClick={() => onToggle(which)}
        />
    );

    const walletList = (list: Account[], value: string, pick: (id: string) => void, label: string) => (
        <WalletList
            wallets={list}
            value={value}
            onPick={id => {
                pick(id);
                onPicked();
            }}
            label={label}
            balance={balance}
        />
    );

    let picker: React.ReactNode = null;
    if (panel === 'category' && !isTransfer) {
        picker = (
            <CategoryChips
                categories={ordered}
                value={edited.categoryId}
                onPick={item => {
                    form.pickCategory(item);
                    if (!item.subcategories?.length) onPicked();
                }}
                subcategories={subcategories}
                subcategory={edited.subcategory}
                // Optional: tapping the chosen one again clears it.
                onSubcategory={(sub, wasOn) => {
                    form.setEdited(prev => ({ ...prev, subcategory: prev.subcategory === sub ? '' : sub }));
                    if (!wasOn) onPicked();
                }}
                subLabelId="edit-tx-subcategory-label"
                language={language}
                t={t}
            />
        );
    } else if (panel === 'wallet') {
        picker = walletList(accounts, edited.accountId, form.pickAccount, isTransfer ? t.fromWallet : t.wallet);
    } else if (panel === 'target' && isTransfer) {
        picker = walletList(
            accounts.filter(wallet => wallet.id !== edited.accountId || wallet.id === form.targetAccountId),
            form.targetAccountId,
            form.pickTarget,
            t.toWallet,
        );
    } else if (panel === 'date') {
        picker = <DatePanel date={edited.date} onChange={date => form.setEdited(prev => ({ ...prev, date }))} onPicked={onPicked} language={language} t={t} />;
    }

    return (
        <div>
            <div className="grid grid-cols-3 gap-2">
                {isTransfer ? (
                    <>
                        {walletTile(account, 'wallet', t.fromWallet, s.from, !!errors.account)}
                        {walletTile(target, 'target', t.toWallet, s.to, !!errors.target)}
                    </>
                ) : (
                    <>
                        <Tile
                            label={t.category}
                            name={edited.subcategory ? (localizeSubcategory(edited.subcategory, language) || edited.subcategory) : category ? localizeCategoryName(category, language) : t.category}
                            sub={edited.subcategory && category ? localizeCategoryName(category, language) : t.category}
                            glyph={<CategoryGlyph category={category} size={32} shape="circle" tone="solid" />}
                            open={panel === 'category'}
                            onClick={() => onToggle('category')}
                        />
                        {walletTile(account, 'wallet', t.wallet, t.chooseWallet, !!errors.account)}
                    </>
                )}
                <Tile
                    label={t.date}
                    name={day.name}
                    sub={day.sub}
                    glyph={(
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-on-surface text-[var(--paper-bg)]" aria-hidden="true">
                            <CalendarDays size={16} />
                        </span>
                    )}
                    open={panel === 'date'}
                    onClick={() => onToggle('date')}
                />
            </div>
            <FieldError message={errors.account ?? errors.target} />

            <AnimatePresence initial={false}>
                {picker && (
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
                            <div className="paper-tile p-2">{picker}</div>
                        </div>
                    </m.div>
                )}
            </AnimatePresence>
        </div>
    );
};
