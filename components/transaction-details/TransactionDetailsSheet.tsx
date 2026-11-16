import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import clsx from 'clsx';
import { Bookmark, Camera, Copy, Loader2, MoreHorizontal, Pencil, Share2, Trash2, X } from 'lucide-react';
import type { AppState, Currency, Transaction } from '../../types';
import { TRANSLATIONS } from '../../constants';
import { MOTION } from '../../config';
import { useDialog, useEscapeKey } from '../../hooks/useFocusTrap';
import { CategoryGlyph } from '../ui/CategoryGlyph';
import { convertAmount } from '../../services/currencyService';
import { formatDate, formatMediumDate, formatMoney, formatNumber, formatTime } from '../../utils/locale';
import { pluralText } from '../../utils/plural';
import { localizeCategoryName, localizeSubcategory, localizeTransactionNote } from '../../utils/systemText';
import { FEE_CURRENCY, isTransferTransaction } from '../../domain/money';
import { transferLegsOf } from '../../domain/transactions';
import { entryDebts, type EntryDebt } from '../../domain/entryDebts';
import { hasReceiptContent, officialReceiptUrl, receiptLines, recurringRuleIdOf } from '../../domain/receiptDetails';
import { openPaymentRequest } from '../payments/paymentBus';
import { receiptPhotoOf, withReceiptPhoto } from '../../domain/receiptPhoto';
import { ReceiptPhotoError, uploadReceiptPhoto } from '../../services/receiptPhotoService';
import { cancelReceiptPhotoCleanup, queueReceiptPhotoCleanup } from '../../services/receiptPhotoCleanup';
import { ReceiptCard } from './ReceiptCard';
import { ReceiptPhotoViewer } from './ReceiptPhoto';
import { DebtsCard, PersonAvatar } from './DebtsCard';
import { CARD_RADIUS, useGrowFromOrigin } from './useGrowFromOrigin';
import { SplitBillCard } from './SplitBillCard';
import { DETAILS_STRINGS } from './detailsStrings';
import { HeroIconButton } from '../ui/ScreenHero';
import { fitFont } from '../home/parts';
import { resolveHomeHeader } from '../../domain/homeHeader';
import { suggestSplitPeople } from '../../domain/splitSuggestions';

/** A note longer than this reads badly as a title; it gets its own row instead. */
const TITLE_MAX = 48;
const SHARE_RECEIPT_LINES = 12;

export interface TransactionDetailsSheetProps {
  transaction: Transaction;
  /** The tapped row: the card grows out of it and shrinks back into it. */
  origin?: Element | null;
  state: AppState;
  onClose: () => void;
  /** A form opened from the card (edit, split) is on top: hide the card so only one shows. */
  covered?: boolean;
  /** `pane`: shown beside the Activity list on wide windows (no scrim, no grow, no focus trap). */
  variant?: 'modal' | 'pane';
  onEdit: (transaction: Transaction) => void;
  /** Opens the split form for this entry, with the people picked on the card (split evenly). */
  onSplit?: (transaction: Transaction, personIds?: string[]) => void;
  onDuplicate?: (transaction: Transaction) => void;
  onSaveAsTemplate?: (transaction: Transaction) => void;
  onDelete: (transaction: Transaction) => void;
  /** Records a repayment (settle up) once a QR request is marked as paid. */
  onSettle?: (personId: string, currency: Currency, amount?: number, accountId?: string) => void;
  /** Saves a change made here (a receipt photo added, replaced or removed). */
  onUpdate?: (transaction: Transaction) => void;
  onToast: (
    message: string,
    type: 'success' | 'error' | 'warning' | 'info',
    action?: { label: string; onClick: () => void },
  ) => void;
}

const canvasColor = (color: string | undefined): string =>
  color && /^#[0-9a-f]{3,8}$/i.test(color) ? color : '#0F766E';

const FactRow: React.FC<{ label: string; children: React.ReactNode; stacked?: boolean }> = ({ label, children, stacked }) => (
  <div
    className={clsx(
      'border-t border-hair py-3.5 first:border-t-0',
      stacked ? 'space-y-1' : 'flex min-h-[52px] items-baseline justify-between gap-4',
    )}
  >
    <dt className="shrink-0 text-[14px] font-medium text-muted">{label}</dt>
    <dd className={clsx('min-w-0 break-words text-[15px] font-semibold', !stacked && 'text-right')}>{children}</dd>
  </div>
);

const MenuItem: React.FC<{ icon: typeof Copy; label: string; onClick: () => void; danger?: boolean }> = ({
  icon: Icon,
  label,
  onClick,
  danger,
}) => (
  <button
    type="button"
    role="menuitem"
    onClick={onClick}
    className={clsx(
      'flex h-11 w-full items-center gap-3 rounded-[16px] px-3 text-left text-[15px] font-medium transition-colors hover:bg-chip focus-visible:bg-chip focus-visible:outline-none',
      danger && 'text-neg',
    )}
  >
    <Icon size={18} className={danger ? undefined : 'text-muted'} aria-hidden="true" /> {label}
  </button>
);

/**
 * An entry's details: what, how much, who is on the bill and who still owes, the receipt, and
 * Edit. Opens as a card that grows out of the tapped row and shrinks back into it.
 */
export const TransactionDetailsSheet: React.FC<TransactionDetailsSheetProps> = ({
  transaction,
  origin = null,
  state,
  onClose,
  covered = false,
  variant = 'modal',
  onEdit,
  onSplit,
  onDuplicate,
  onSaveAsTemplate,
  onDelete,
  onSettle,
  onUpdate,
  onToast,
}) => {
  const t = TRANSLATIONS[state.language];
  const d = DETAILS_STRINGS[state.language];
  const language = state.language;
  const tone = resolveHomeHeader(state.homeHeader).tone;
  const { cardRef, contentRef, isPresent } = useGrowFromOrigin(origin);
  const inPane = variant === 'pane';
  const { dialogProps, titleId } = useDialog(isPresent && !inPane, onClose);
  // In the pane, Escape clears the selection (a menu or form on top handles it first).
  useEscapeKey(onClose, inPane);
  const [sharing, setSharing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeMenu = (refocus = true) => {
    setMenuOpen(false);
    if (refocus) menuButtonRef.current?.focus();
  };
  useEscapeKey(() => closeMenu(), menuOpen && isPresent);
  useEffect(() => {
    if (menuOpen) menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [menuOpen]);

  // Receipt photo: picked here, uploaded, then saved on the live entry.
  const latest = useRef(transaction);
  latest.current = transaction;
  const fileRef = useRef<HTMLInputElement>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  // The receipt card opens to show a photo added here, even on a split entry.
  const [photoAdded, setPhotoAdded] = useState(false);
  const photo = receiptPhotoOf(transaction);

  const pickPhoto = () => fileRef.current?.click();
  const attachPhoto = async (file: File) => {
    if (photoBusy || !onUpdate) return;
    setPhotoBusy(true);
    try {
      const path = await uploadReceiptPhoto(file);
      const previous = receiptPhotoOf(latest.current);
      onUpdate(withReceiptPhoto(latest.current, path));
      if (previous && previous !== path) queueReceiptPhotoCleanup([previous]);
      setPhotoAdded(true);
      onToast(t.receiptPhotoSaved, 'success');
    } catch (error) {
      const reason = error instanceof ReceiptPhotoError ? error.reason : 'upload';
      onToast(
        reason === 'offline' ? t.receiptPhotoOffline
          : reason === 'too-large' ? t.receiptPhotoTooLarge
            : reason === 'unsupported' ? t.receiptPhotoUnsupported
              : t.receiptPhotoFailed,
        'error',
      );
    } finally {
      setPhotoBusy(false);
    }
  };
  const removePhoto = () => {
    const previous = receiptPhotoOf(latest.current);
    if (!previous || !onUpdate) return;
    setViewerOpen(false);
    onUpdate(withReceiptPhoto(latest.current, null));
    queueReceiptPhotoCleanup([previous]);
    onToast(t.receiptPhotoRemoved, 'info', {
      label: t.undo,
      onClick: () => {
        cancelReceiptPhotoCleanup([previous]);
        onUpdate(withReceiptPhoto(latest.current, previous));
      },
    });
  };

  // The focus trap and the animation share the card element.
  const setCardRef = (element: HTMLDivElement | null) => {
    cardRef.current = element;
    dialogProps.ref.current = element;
  };

  const view = useMemo(() => {
    const category = state.categories.find(c => c.id === transaction.categoryId);
    const account = state.accounts.find(a => a.id === transaction.accountId);
    const person = transaction.personId ? state.people.find(p => p.id === transaction.personId) : undefined;
    const event = transaction.eventId ? state.events.find(e => e.id === transaction.eventId) : undefined;
    const team = transaction.teamId ? state.teams?.find(item => item.id === transaction.teamId) : undefined;
    const ruleId = recurringRuleIdOf(transaction.id);
    const rule = ruleId ? state.recurringTransactions.find(item => item.id === ruleId) : undefined;
    const legs = transferLegsOf(transaction, state.transactions);
    const isTransfer = !!legs || isTransferTransaction(transaction);
    const fromAccount = legs ? state.accounts.find(a => a.id === legs.outflow.accountId) : undefined;
    const toAccount = legs ? state.accounts.find(a => a.id === legs.inflow.accountId) : undefined;
    const categoryName = category ? localizeCategoryName(category, language) : '';
    const subcategory = localizeSubcategory(transaction.subcategory, language);
    const note = localizeTransactionNote(transaction.note, language)?.trim() ?? '';
    const merchant = transaction.receiptData?.merchant?.trim() ?? '';
    const noteFitsTitle = !!note && note.length <= TITLE_MAX;
    const title = isTransfer
      ? t.transferType
      : (noteFitsTitle ? note : merchant || categoryName) || t.untitled;
    const noteRow = note && note !== title ? note : '';
    const date = new Date(transaction.date);
    const validDate = !Number.isNaN(date.getTime());
    const hasTime = validDate && (date.getHours() !== 0 || date.getMinutes() !== 0);
    const sameYear = validDate && date.getFullYear() === new Date().getFullYear();
    const day = validDate
      ? formatDate(date, { weekday: 'long', day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) }, language)
      : '';
    const when = hasTime ? d.dayAt.replace('{day}', day).replace('{time}', formatTime(date, language)) : day;
    const debts = isTransfer ? [] : entryDebts(transaction, state.transactions, state.people);
    return {
      category, account, person, event, team, rule, legs, isTransfer, fromAccount, toAccount,
      categoryName, subcategory, title, noteRow, when, debts,
    };
  }, [transaction, state, language, t, d]);

  const { category, account, person, event, team, rule, legs, isTransfer, fromAccount, toAccount, debts } = view;
  const money = (value: number, currency = transaction.currency) => formatMoney(value, currency, language);
  const sign = isTransfer ? '' : transaction.type === 'income' ? '+' : '−';
  const amountText = `${sign}${money(transaction.amount)}`;
  // The header shows the number large with the currency code after it; cents only when there are any.
  const digits = Math.round(transaction.amount * 100) % 100 !== 0 ? 2 : 0;
  const amountNumber = `${sign}${formatNumber(transaction.amount, { minimumFractionDigits: digits, maximumFractionDigits: digits }, language)}`;
  const converted =
    transaction.currency !== state.baseCurrency
      ? money(convertAmount(transaction.amount, transaction.currency, state.baseCurrency, state.rates), state.baseCurrency)
      : null;
  const feeInCurrency = transaction.fees ? convertAmount(transaction.fees, FEE_CURRENCY, transaction.currency, state.rates) : 0;
  const split = transaction.splitDetails;
  const receipt = hasReceiptContent(transaction.receiptData) ? transaction.receiptData : undefined;
  const canSplit = !!onSplit && !isTransfer && !split && !transaction.personId && transaction.type === 'expense';
  const canCopy = !isTransfer;
  // A person on an entry that is not a debt (they paid me, a repayment) is just a fact.
  const personFact = person && debts.length === 0 ? person : undefined;
  const suggestions = useMemo(
    () =>
      canSplit
        ? suggestSplitPeople({ transactions: state.transactions, people: state.people, selfId: state.userProfile?.id, eventPersonIds: event?.personIds })
        : [],
    [canSplit, state.transactions, state.people, state.userProfile?.id, event?.personIds],
  );

  const leafCategory = view.subcategory || view.categoryName;
  const subline = isTransfer
    ? fromAccount && toAccount ? `${fromAccount.name} → ${toAccount.name}` : account?.name ?? ''
    : [leafCategory, account?.name].filter(Boolean).join(' · ');
  const amountSub = [
    split ? t.detailsYourShare.replace('{share}', money(split.myPortion)) : '',
    converted ? `≈ ${converted}` : '',
  ].filter(Boolean).join(' · ');

  const frequencyLabel = rule
    ? ({ daily: t.daily, weekly: t.weekly, biweekly: t.biweekly, monthly: t.monthly, quarterly: t.quarterly, yearly: t.yearly } as Record<string, string>)[rule.frequency] ?? rule.frequency
    : '';

  // Up to three facts sit as tiles on the header; the rest are listed under the cards.
  const tiles: { key: string; label: string; value: string; sub?: string }[] = [];
  if (isTransfer) {
    if (legs && fromAccount && toAccount) {
      const exchange = legs.inflow.currency !== legs.outflow.currency;
      tiles.push({ key: 'from', label: d.from, value: fromAccount.name, sub: exchange ? money(legs.outflow.amount, legs.outflow.currency) : undefined });
      tiles.push({ key: 'to', label: d.to, value: toAccount.name, sub: exchange ? money(legs.inflow.amount, legs.inflow.currency) : undefined });
    }
    if (feeInCurrency > 0) tiles.push({ key: 'fee', label: t.detailsFee, value: money(feeInCurrency) });
  } else {
    if (leafCategory) {
      tiles.push({ key: 'category', label: d.category, value: leafCategory, sub: view.subcategory && view.categoryName ? view.categoryName : undefined });
    }
    if (account) {
      const type = account.type === 'cash' ? d.walletCash : account.type === 'bank' ? d.walletBank : account.type === 'digital' ? d.walletDigital : '';
      const sameAsName = type.toLocaleLowerCase() === account.name.trim().toLocaleLowerCase();
      tiles.push({ key: 'wallet', label: d.wallet, value: account.name, sub: type && !sameAsName ? type : undefined });
    }
    const lineCount = receipt ? receiptLines(receipt).length : 0;
    const official = !!officialReceiptUrl(receipt);
    const receiptValue = lineCount > 0
      ? pluralText(lineCount, language, { one: t.detailsItemsOne, few: t.detailsItemsFew, other: t.detailsItemsOther })
      : official ? d.fiscalReceipt : photo ? d.photo : '';
    const third = receiptValue
      ? { key: 'receipt', label: d.receipt, value: receiptValue, sub: lineCount > 0 ? (official ? d.fiscalReceipt : d.scanned) : undefined }
      : event ? { key: 'event', label: d.event, value: event.name }
        : rule ? { key: 'rule', label: d.repeats, value: frequencyLabel, sub: rule.name || undefined }
          : personFact ? { key: 'person', label: t.person, value: personFact.name }
            : team ? { key: 'team', label: t.detailsTeam, value: team.name }
              : null;
    if (third && tiles.length < 3) tiles.push(third);
  }
  const inTiles = new Set(tiles.map(tile => tile.key));
  const facts = {
    person: personFact && !inTiles.has('person') ? personFact : undefined,
    event: event && !inTiles.has('event') ? event : undefined,
    rule: rule && !inTiles.has('rule') ? rule : undefined,
    fee: feeInCurrency > 0 && !inTiles.has('fee'),
    team: team && !inTiles.has('team') ? team : undefined,
  };

  const request = (debt: EntryDebt, name: string | undefined) => {
    const open = debt.outstanding;
    openPaymentRequest({
      amount: open,
      currency: transaction.currency,
      payerName: name,
      purpose: view.title,
      onSettled: ({ full, amount }) =>
        onSettle?.(debt.personId, transaction.currency, full ? open : Math.min(amount, open), transaction.accountId),
    });
  };

  const share = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const [{ renderShareCard }, { sharePng }] = await Promise.all([import('./shareCard'), import('../../utils/shareImage')]);
      const officialUrl = officialReceiptUrl(transaction.receiptData);
      const lines = receipt ? receiptLines(receipt) : [];
      const subtitle = [isTransfer ? '' : view.categoryName, formatMediumDate(transaction.date, language)].filter(Boolean).join(' · ');
      const blob = await renderShareCard({
        title: view.title,
        amount: amountText,
        positive: !isTransfer && transaction.type === 'income',
        subtitle,
        initial: (view.title.trim().charAt(0) || '•'),
        color: canvasColor(category?.color),
        receiptTitle: receipt?.merchant && receipt.merchant !== view.title ? receipt.merchant : undefined,
        receiptRows: lines.slice(0, SHARE_RECEIPT_LINES).map(line => ({
          label: line.name || t.untitled,
          value: money(line.total),
          detail: line.quantity !== 1 ? `${line.quantity} × ${money(line.unitPrice)}` : undefined,
        })),
        receiptMore: lines.length > SHARE_RECEIPT_LINES ? t.detailsMoreItems.replace('{count}', String(lines.length - SHARE_RECEIPT_LINES)) : undefined,
        receiptTotal: receipt && lines.length > 0 ? { label: t.total, value: money(receipt.total) } : undefined,
        splitTitle: split ? t.splitWith : undefined,
        splitRows: split
          ? [
              { label: state.userProfile?.name || t.you, value: money(split.myPortion) },
              ...debts.map(debt => ({
                label: state.people.find(p => p.id === debt.personId)?.name || t.unknown,
                value: money(debt.amount),
                detail: debt.state === 'paid' ? t.detailsPaidShort : t.detailsOwesAmount.replace('{amount}', money(debt.outstanding)),
              })),
            ]
          : [],
        footnote: officialUrl ? t.detailsOfficialFootnote.replace('{host}', new URL(officialUrl).host) : undefined,
        brand: t.appName,
      });
      const text = [`${view.title} · ${amountText} · ${formatMediumDate(transaction.date, language)}`, officialUrl ? `${t.detailsOfficialReceipt}: ${officialUrl}` : '']
        .filter(Boolean)
        .join('\n');
      const outcome = await sharePng(blob, { fileName: `entry-${transaction.date.slice(0, 10)}.png`, text, title: view.title });
      if (outcome === 'downloaded') onToast(t.detailsImageSaved, 'success');
      if (outcome === 'failed') onToast(t.detailsShareFailed, 'error');
    } catch {
      onToast(t.detailsShareFailed, 'error');
    } finally {
      setSharing(false);
    }
  };

  // The card's inside: the same in the pop-up and in the Activity pane.
  const body = (
    <>
      <div ref={contentRef} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {/* Header, in the colour picked for the Home header */}
          <section className={clsx('hero-bg relative isolate px-5 pb-5 pt-5', tone === 'dark' && 'hero-dark')}>
            <div className="flex items-start gap-3.5">
              {person && !category ? (
                <PersonAvatar person={person} size={52} />
              ) : (
                <CategoryGlyph category={category} size={52} shape="circle" tone="solid" className="shadow-[0_0_0_2px_rgba(255,255,255,0.22)]" />
              )}
              <div className="min-w-0 flex-1 pt-1">
                <h2 id={titleId} className="break-words text-[21px] font-bold leading-tight tracking-[-0.015em]">
                  {view.title}
                </h2>
                {subline && <p className="mt-1 break-words text-[14.5px] font-medium text-white/75 first-letter:uppercase">{subline}</p>}
              </div>
              <HeroIconButton icon={X} label={t.close} onClick={onClose} className="-mr-1 -mt-0.5" />
            </div>

            <div className="mt-6" style={{ containerType: 'inline-size' }}>
              <p
                className="whitespace-nowrap font-bold leading-none tracking-[-0.045em] tabular-nums"
                style={{ fontSize: fitFont(54, `${amountNumber} ${transaction.currency}`, 0.56) }}
              >
                {amountNumber}
                <span className="ml-1.5 text-[0.4em] font-semibold tracking-normal text-white/60">{transaction.currency}</span>
              </p>
            </div>
            {view.when && <p className="mt-3 text-[15px] font-medium text-white/85 first-letter:uppercase">{view.when}</p>}
            {amountSub && <p className="mt-0.5 text-[13.5px] font-medium tabular-nums text-white/70">{amountSub}</p>}

            {tiles.length > 0 && (
              <dl className={clsx('mt-5 grid gap-2', tiles.length === 1 ? 'grid-cols-1' : tiles.length === 2 ? 'grid-cols-2' : 'grid-cols-3')}>
                {tiles.map(tile => (
                  <div key={tile.key} className="min-w-0 rounded-[18px] bg-white/[0.1] px-3 pb-2.5 pt-2 ring-1 ring-inset ring-white/[0.14]">
                    <dt className="truncate text-[12.5px] font-medium text-white/70">{tile.label}</dt>
                    <dd className="mt-0.5 line-clamp-2 break-words text-[16px] font-bold leading-tight">{tile.value}</dd>
                    {tile.sub && <dd className="mt-0.5 line-clamp-2 break-words text-[12.5px] font-medium leading-snug text-white/65">{tile.sub}</dd>}
                  </div>
                ))}
              </dl>
            )}
          </section>

          <div className="space-y-3 px-4 pb-3 pt-4">
            {debts.length > 0 && (
              <DebtsCard
                debts={debts}
                people={state.people}
                currency={transaction.currency}
                language={language}
                t={t}
                split={split ? { myPortion: split.myPortion, me: state.userProfile ?? undefined } : undefined}
                onRequest={onSettle ? (debt, debtor) => request(debt, debtor?.name) : undefined}
              />
            )}

            {canSplit && (
              <SplitBillCard people={suggestions} language={language} t={t} d={d} onSplit={personIds => onSplit!(transaction, personIds)} />
            )}

            {photoBusy && !photo && (
              <div className="paper-tile flex min-h-[56px] items-center gap-3 px-4 text-[15px] font-semibold text-muted" role="status">
                <Loader2 size={18} className="animate-spin" aria-hidden="true" /> {t.receiptPhotoUploading}
              </div>
            )}

            {receipt && (
              <ReceiptCard
                key={photo ?? 'no-photo'}
                receipt={receipt}
                currency={transaction.currency}
                language={language}
                t={t}
                d={d}
                defaultOpen={debts.length === 0 || photoAdded}
                onOpenPhoto={() => setViewerOpen(true)}
                photoBusy={photoBusy}
              />
            )}

            {(facts.person || facts.event || facts.rule || facts.fee || facts.team || view.noteRow) && (
              <dl className="paper-tile px-4 py-0.5">
                {facts.person && (
                  <FactRow label={t.person}>
                    <span className="inline-flex items-center gap-2">
                      <PersonAvatar person={facts.person} size={24} />
                      {facts.person.name}
                    </span>
                  </FactRow>
                )}
                {facts.event && <FactRow label={t.event}>{facts.event.name}</FactRow>}
                {facts.rule && (
                  <FactRow label={t.detailsRepeats}>
                    {frequencyLabel}
                    {facts.rule.name && <span className="block text-[13px] font-medium text-muted">{facts.rule.name}</span>}
                  </FactRow>
                )}
                {facts.fee && (
                  <FactRow label={t.detailsFee}>
                    <span className="tabular-nums">{money(feeInCurrency)}</span>
                  </FactRow>
                )}
                {facts.team && <FactRow label={t.detailsTeam}>{facts.team.name}</FactRow>}
                {view.noteRow && (
                  <FactRow label={t.note} stacked>
                    <span className="whitespace-pre-wrap font-medium">{view.noteRow}</span>
                  </FactRow>
                )}
              </dl>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="relative flex shrink-0 items-center gap-2.5 border-t border-hair px-4 pb-4 pt-3">
          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => setMenuOpen(value => !value)}
            aria-label={t.moreActions}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-tile text-on-surface ring-1 ring-inset ring-hair"
          >
            <MoreHorizontal size={21} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => void share()}
            disabled={sharing}
            className="flex h-[52px] min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-tile px-4 text-[15px] font-semibold text-on-surface ring-1 ring-inset ring-hair disabled:opacity-70"
          >
            {sharing ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <Share2 size={18} aria-hidden="true" />}
            {t.detailsShare}
          </button>
          <button
            type="button"
            onClick={() => onEdit(transaction)}
            data-shortcut-edit=""
            className="flex h-[52px] min-w-0 flex-[1.3] items-center justify-center gap-2 rounded-full bg-accent px-4 text-[16px] font-semibold text-on-accent"
          >
            <Pencil size={18} aria-hidden="true" /> {t.edit}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {menuOpen && (
          <>
            <div key="menu-dismiss" className="absolute inset-0 z-10" onClick={() => closeMenu(false)} aria-hidden="true" />
            <m.div
              key="menu"
              ref={menuRef}
              role="menu"
              aria-label={t.moreActions}
              initial={{ opacity: 0, scale: 0.92, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 4, transition: { duration: 0.12 } }}
              transition={{ type: 'spring', stiffness: 520, damping: 34 }}
              className="absolute bottom-[84px] left-4 z-20 min-w-[210px] origin-bottom-left rounded-[22px] border border-hair bg-tile p-1.5 text-on-surface shadow-[0_18px_48px_-16px_rgba(0,0,0,0.35)]"
            >
              {canCopy && onDuplicate && (
                <MenuItem icon={Copy} label={t.duplicate} onClick={() => { closeMenu(false); onDuplicate(transaction); }} />
              )}
              {canCopy && onSaveAsTemplate && (
                <MenuItem icon={Bookmark} label={t.saveAsTemplate} onClick={() => { closeMenu(false); onSaveAsTemplate(transaction); }} />
              )}
              {canCopy && onUpdate && !photo && (
                <MenuItem icon={Camera} label={t.receiptPhotoAdd} onClick={() => { closeMenu(false); pickPhoto(); }} />
              )}
              {canCopy && (onDuplicate || onSaveAsTemplate || onUpdate) && <div role="separator" className="mx-3 my-1 h-px bg-[var(--paper-line)]" />}
              <MenuItem icon={Trash2} label={t.delete} danger onClick={() => { closeMenu(false); onDelete(transaction); }} />
            </m.div>
          </>
        )}
      </AnimatePresence>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={event => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void attachPhoto(file);
        }}
      />
    </>
  );
  const photoViewer = (
    <AnimatePresence>
      {viewerOpen && photo && (
        <ReceiptPhotoViewer
          key="receipt-photo"
          path={photo}
          t={t}
          onClose={() => setViewerOpen(false)}
          onReplace={onUpdate ? () => { setViewerOpen(false); pickPhoto(); } : undefined}
          onRemove={onUpdate ? removePhoto : undefined}
        />
      )}
    </AnimatePresence>
  );

  if (inPane) {
    return (
      <section
        aria-labelledby={titleId}
        style={{ borderRadius: CARD_RADIUS }}
        className="relative flex max-h-full min-h-0 w-full flex-col overflow-hidden bg-[var(--paper-bg)] text-on-surface shadow-[0_18px_48px_-24px_rgba(0,0,0,0.35)] ring-1 ring-hair"
      >
        {body}
        {photoViewer}
      </section>
    );
  }

  return (
    <div className={clsx('modal-safe-area fixed inset-0 z-50 flex items-center justify-center', !isPresent && 'pointer-events-none', covered && 'invisible')}>
      <m.div
        className="paper-scrim absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={MOTION.backdrop}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        {...dialogProps}
        ref={setCardRef}
        style={{ opacity: 0, borderRadius: CARD_RADIUS }}
        className="relative flex max-h-[min(88dvh,780px)] w-full max-w-[440px] flex-col overflow-hidden bg-[var(--paper-bg)] text-on-surface shadow-[0_28px_70px_-24px_rgba(0,0,0,0.5)] outline-none will-change-transform"
      >
        {body}
      </div>
      {photoViewer}
    </div>
  );
};

export default TransactionDetailsSheet;
