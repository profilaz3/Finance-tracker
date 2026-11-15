import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import clsx from 'clsx';
import { Bookmark, Camera, Copy, Loader2, MoreHorizontal, Pencil, Share2, Trash2, Users, X } from 'lucide-react';
import type { AppState, Currency, Transaction } from '../../types';
import { TRANSLATIONS } from '../../constants';
import { MOTION } from '../../config';
import { useDialog, useEscapeKey } from '../../hooks/useFocusTrap';
import { CategoryGlyph } from '../ui/CategoryGlyph';
import { convertAmount } from '../../services/currencyService';
import { formatDate, formatMediumDate, formatMoney, formatTime } from '../../utils/locale';
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

/** A note longer than this reads badly as a title; it gets its own row instead. */
const TITLE_MAX = 48;
const SHARE_RECEIPT_LINES = 12;

export interface TransactionDetailsSheetProps {
  transaction: Transaction;
  /** The tapped row: the card grows out of it and shrinks back into it. */
  origin?: Element | null;
  state: AppState;
  onClose: () => void;
  onEdit: (transaction: Transaction) => void;
  onSplit?: (transaction: Transaction) => void;
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
      'border-t border-hair py-2.5 first:border-t-0',
      stacked ? 'space-y-0.5' : 'flex min-h-[44px] items-baseline justify-between gap-4',
    )}
  >
    <dt className="shrink-0 text-[13px] font-medium text-muted">{label}</dt>
    <dd className={clsx('min-w-0 break-words text-[14px] font-semibold', !stacked && 'text-right')}>{children}</dd>
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
  const language = state.language;
  const { cardRef, contentRef, isPresent } = useGrowFromOrigin(origin);
  const { dialogProps, titleId } = useDialog(isPresent, onClose);
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
      ? formatDate(date, { weekday: 'short', day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) }, language)
      : '';
    const when = hasTime ? `${day}, ${formatTime(date, language)}` : day;
    const debts = isTransfer ? [] : entryDebts(transaction, state.transactions, state.people);
    return {
      category, account, person, event, team, rule, legs, isTransfer, fromAccount, toAccount,
      categoryName, subcategory, title, noteRow, when, debts,
    };
  }, [transaction, state, language, t]);

  const { category, account, person, event, team, rule, legs, isTransfer, fromAccount, toAccount, debts } = view;
  const money = (value: number, currency = transaction.currency) => formatMoney(value, currency, language);
  const sign = isTransfer ? '' : transaction.type === 'income' ? '+' : '−';
  const amountText = `${sign}${money(transaction.amount)}`;
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

  const kind = isTransfer ? t.transferType : [view.categoryName, view.subcategory].filter(Boolean).join(' › ');
  const subline = [kind, isTransfer ? '' : account?.name, view.when].filter(Boolean).join(' · ');
  const amountSub = [
    split ? t.detailsYourShareOf.replace('{total}', money(split.totalAmount)) : '',
    converted ? `≈ ${converted}` : '',
  ].filter(Boolean).join(' · ');

  const frequencyLabel = rule
    ? ({ daily: t.daily, weekly: t.weekly, biweekly: t.biweekly, monthly: t.monthly, quarterly: t.quarterly, yearly: t.yearly } as Record<string, string>)[rule.frequency] ?? rule.frequency
    : '';

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

  const hasFacts = !!(legs && fromAccount && toAccount) || !!personFact || !!event || feeInCurrency > 0 || !!rule || !!team || !!view.noteRow;

  return (
    <div className={clsx('modal-safe-area fixed inset-0 z-50 flex items-center justify-center', !isPresent && 'pointer-events-none')}>
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
        className="glass-sheet relative flex max-h-[min(88dvh,780px)] w-full max-w-[440px] flex-col overflow-hidden text-on-surface outline-none will-change-transform"
      >
        <div ref={contentRef} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-2 pt-4">
            {/* Header */}
            <div className="flex items-start gap-3">
              {person && !category ? <PersonAvatar person={person} size={44} /> : <CategoryGlyph category={category} size={44} />}
              <div className="min-w-0 flex-1 pt-0.5">
                <h2 id={titleId} className="break-words text-[17px] font-semibold leading-snug">
                  {view.title}
                </h2>
                {subline && <p className="mt-0.5 break-words text-[13px] font-medium text-muted first-letter:uppercase">{subline}</p>}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label={t.close}
                className="-mr-1.5 -mt-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted"
                data-focus-ring="parent"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-chip [button:focus-visible_&]:ring-2 [button:focus-visible_&]:ring-accent">
                  <X size={18} aria-hidden="true" />
                </span>
              </button>
            </div>

            {/* Amount */}
            <div className="mb-4 mt-3.5">
              <p className={clsx('text-[32px] font-bold leading-[1.05] tracking-[-1px] tabular-nums', sign === '+' && 'text-pos')}>
                {amountText}
              </p>
              {amountSub && <p className="mt-1 text-[13px] font-medium tabular-nums text-muted">{amountSub}</p>}
            </div>

            <div className="space-y-2.5">
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

              {photoBusy && !photo && (
                <div className="paper-tile flex min-h-[52px] items-center gap-3 px-3.5 text-[14px] font-semibold text-muted" role="status">
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
                  defaultOpen={debts.length === 0 || photoAdded}
                  onOpenPhoto={() => setViewerOpen(true)}
                  photoBusy={photoBusy}
                />
              )}

              {hasFacts && (
                <dl className="paper-tile px-3.5 py-0.5">
                  {legs && fromAccount && toAccount && (
                    <>
                      <FactRow label={t.detailsFrom}>{fromAccount.name}</FactRow>
                      <FactRow label={t.detailsToWallet}>
                        {toAccount.name}
                        {legs.inflow.currency !== legs.outflow.currency && (
                          <span className="block text-[12.5px] font-medium tabular-nums text-muted">
                            {t.detailsReceives.replace('{amount}', money(legs.inflow.amount, legs.inflow.currency))}
                          </span>
                        )}
                      </FactRow>
                    </>
                  )}
                  {personFact && (
                    <FactRow label={t.person}>
                      <span className="inline-flex items-center gap-2">
                        <PersonAvatar person={personFact} size={22} />
                        {personFact.name}
                      </span>
                    </FactRow>
                  )}
                  {event && <FactRow label={t.event}>{event.name}</FactRow>}
                  {rule && (
                    <FactRow label={t.detailsRepeats}>
                      {frequencyLabel}
                      {rule.name && <span className="block text-[12.5px] font-medium text-muted">{rule.name}</span>}
                    </FactRow>
                  )}
                  {feeInCurrency > 0 && (
                    <FactRow label={t.detailsFee}>
                      <span className="tabular-nums">{money(feeInCurrency)}</span>
                    </FactRow>
                  )}
                  {team && <FactRow label={t.detailsTeam}>{team.name}</FactRow>}
                  {view.noteRow && (
                    <FactRow label={t.note} stacked>
                      <span className="whitespace-pre-wrap font-medium">{view.noteRow}</span>
                    </FactRow>
                  )}
                </dl>
              )}

              {canSplit && (
                <button
                  type="button"
                  onClick={() => onSplit!(transaction)}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-[18px] border-[1.5px] border-dashed border-[color-mix(in_srgb,var(--paper-text)_20%,transparent)] text-[14px] font-semibold text-muted transition-colors hover:bg-chip"
                >
                  <Users size={17} aria-hidden="true" /> {t.detailsSplitThisBill}
                </button>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="relative flex shrink-0 items-center gap-2 px-4 pb-4 pt-2.5">
            <button
              ref={menuButtonRef}
              type="button"
              onClick={() => setMenuOpen(value => !value)}
              aria-label={t.moreActions}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-chip text-on-surface"
            >
              <MoreHorizontal size={20} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => void share()}
              disabled={sharing}
              className="flex h-12 shrink-0 items-center gap-2 rounded-full bg-chip px-4 text-[14px] font-semibold disabled:opacity-70"
            >
              {sharing ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : <Share2 size={17} aria-hidden="true" />}
              {t.detailsShare}
            </button>
            <button
              type="button"
              onClick={() => onEdit(transaction)}
              className="flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-accent text-[15px] font-semibold text-on-accent"
            >
              <Pencil size={17} aria-hidden="true" /> {t.edit}
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
                className="absolute bottom-[76px] left-4 z-20 min-w-[210px] origin-bottom-left rounded-[22px] border border-hair bg-tile p-1.5 text-on-surface shadow-[0_18px_48px_-16px_rgba(0,0,0,0.35)]"
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
      </div>
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
    </div>
  );
};

export default TransactionDetailsSheet;
