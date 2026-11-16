import React, { Suspense, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence } from 'motion/react';
import { lazyWithReload } from '../../utils/lazyWithReload';
import { AppState, Currency, Event, Person, Transaction } from '../../types';
import { CHART_COLORS, TRANSLATIONS } from '../../constants';
import type { SplitPrefill } from '../split-expense/types';
import { useAskRequests } from '../ask/askBus';
import { useDetailsPaneSlot } from '../transaction-details/detailsBus';
import { personPane } from '../shared/personPane';
import { duplicateTransactionDraft } from '../../domain/transactions';
import type { PaymentDetails } from '../../types';

const AddPersonModal = lazyWithReload(() => import('../AddPersonModal').then(m => ({ default: m.AddPersonModal })));
const PersonDetail = lazyWithReload(() => import('../PersonDetail').then(m => ({ default: m.PersonDetail })));
const EditTransactionModal = lazyWithReload(() => import('../EditTransactionModal').then(m => ({ default: m.EditTransactionModal })));
const TransactionDetailsSheet = lazyWithReload(() => import('../transaction-details/TransactionDetailsSheet'));
const SplitModal = lazyWithReload(() => import('../SplitModal').then(m => ({ default: m.SplitModal })));
const EventCreationModal = lazyWithReload(() => import('../EventCreationModal').then(m => ({ default: m.EventCreationModal })));
const ReceiptScanModal = lazyWithReload(() => import('../ReceiptScanModal').then(m => ({ default: m.ReceiptScanModal })));
const SplitExpenseModal = lazyWithReload(() => import('../split-expense').then(m => ({ default: m.SplitExpenseModal })));
const AskSheet = lazyWithReload(() => import('../ask/AskSheet').then(m => ({ default: m.AskSheet })));
// Listens for payment QR requests; lazy so the listener and sheet stay out of the entry chunk.
const PaymentHost = lazyWithReload(() => import('../payments/PaymentHost'));

interface AppModalsState {
  isEditModalOpen: boolean;
  setIsEditModalOpen: (isOpen: boolean) => void;
  isSplitModalOpen: boolean;
  setIsSplitModalOpen: (isOpen: boolean) => void;
  detailsId: string | null;
  detailsOrigin: Element | null;
  detailsInPane: boolean;
  closeDetails: () => void;
  isAddPersonModalOpen: boolean;
  setIsAddPersonModalOpen: (isOpen: boolean) => void;
  isEventCreationModalOpen: boolean;
  setIsEventCreationModalOpen: (isOpen: boolean) => void;
  isReceiptScanModalOpen: boolean;
  setIsReceiptScanModalOpen: (isOpen: boolean) => void;
  isSplitExpenseModalOpen: boolean;
  setIsSplitExpenseModalOpen: (isOpen: boolean) => void;
  isUserProfileModalOpen: boolean;
  setIsUserProfileModalOpen: (isOpen: boolean) => void;
  isAskOpen: boolean;
  setIsAskOpen: (isOpen: boolean) => void;
}

interface AppModalsProps {
  modals: AppModalsState;
  state: AppState;
  selectedTransaction: Transaction | null;
  selectedPerson: Person | null;
  /** Opens an event from a person's page (what is open between you in it). */
  onOpenEvent?: (event: Event) => void;
  personToEdit: Person | null;
  splitTransactionContext?: Transaction;
  activeEvent?: Event;
  linkToActiveEvent: boolean;
  setSelectedPerson: (person: Person | null) => void;
  setPersonToEdit: (person: Person | null) => void;
  setSplitTransactionContext: (transaction: Transaction | undefined) => void;
  setSelectedTransaction: (transaction: Transaction | null) => void;
  onSaveAsTemplate: (transaction: Transaction) => void;
  createId: () => string;
  handleSplitTransaction: (amount: number, currency: Currency, targetId: string, targetType: 'account' | 'person') => Promise<void>;
  deletePerson: (id: string) => Promise<void>;
  handleSettleUp: (personId: string, currency: AppState['baseCurrency'], amount?: number, accountId?: string) => void;
  handleUpdatePersonBalance: (personId: string, currency: Currency, newBalance: number) => Promise<void>;
  addPerson: (name: string, defaultCurrency: Currency, color: string, avatar?: string) => Promise<void>;
  updatePerson: (id: string, updates: Partial<Person>) => Promise<void>;
  createUserProfile: (name: string, defaultCurrency: Currency, color: string, avatar?: string) => Promise<void>;
  updateUserProfile: (id: string, updates: Partial<Person>) => Promise<void>;
  updateTransaction: (updatedTransaction: Transaction, targetAccountId?: string, options?: { silent?: boolean }) => Promise<void>;
  deleteTransaction: (id: string) => void;
  handleCreateEvent: (event: Event) => Promise<void>;
  addTransaction: (transaction: Transaction) => Promise<void>;
  handleUnifiedSplit: (result: {
    transactions: Transaction[];
    balanceUpdates: { personId: string; currency: Currency; delta: number }[];
  }) => Promise<void>;
  addToast: (
    message: string,
    type: 'success' | 'error' | 'warning' | 'info',
    action?: { label: string; onClick: () => void },
  ) => void;
  t: typeof TRANSLATIONS.en;
  /** A receipt image shared into the app; opens the receipt scanner preloaded. */
  sharedReceiptImage?: string | null;
  /** A receipt file dropped onto the window. */
  droppedReceipt?: File | null;
  clearSharedReceiptImage?: () => void;
  /** Saves (or clears) the user's account for IPS QR payment requests. */
  onSavePaymentDetails?: (details: PaymentDetails | null) => void;
}

export const AppModals: React.FC<AppModalsProps> = ({
  sharedReceiptImage,
  droppedReceipt,
  clearSharedReceiptImage,
  onSavePaymentDetails,
  modals,
  state,
  selectedTransaction,
  selectedPerson,
  onOpenEvent,
  personToEdit,
  splitTransactionContext,
  activeEvent,
  linkToActiveEvent,
  setSelectedPerson,
  setPersonToEdit,
  setSplitTransactionContext,
  setSelectedTransaction,
  onSaveAsTemplate,
  createId,
  handleSplitTransaction,
  deletePerson,
  handleSettleUp,
  handleUpdatePersonBalance,
  addPerson,
  updatePerson,
  createUserProfile,
  updateUserProfile,
  updateTransaction,
  deleteTransaction,
  handleCreateEvent,
  addTransaction,
  handleUnifiedSplit,
  addToast,
  t,
}) => {
  const isNewTransaction = !!selectedTransaction && !state.transactions.some(transaction => transaction.id === selectedTransaction.id);
  // Exact amounts from "Split this receipt", handed from the receipt scanner to the split flow.
  const [splitPrefill, setSplitPrefill] = useState<SplitPrefill | undefined>(undefined);
  // People picked on the details card's "Split this bill" chips.
  const [splitPreselect, setSplitPreselect] = useState<string[] | undefined>(undefined);
  // Ask sheet: mounted on first open, then kept so the conversation survives closing it.
  const [askMounted, setAskMounted] = useState(false);
  const [askSeed, setAskSeed] = useState<{ question: string; nonce: number } | null>(null);
  useAskRequests((question) => {
    setAskMounted(true);
    if (question) setAskSeed({ question, nonce: Date.now() });
    modals.setIsAskOpen(true);
  });

  // The details sheet shows the live entry, so edits made from it appear in it; a deleted entry closes it.
  const detailsTransaction = modals.detailsId ? state.transactions.find(transaction => transaction.id === modals.detailsId) : undefined;
  const { detailsId, closeDetails } = modals;
  // Opened beside the Activity list: shown in that pane, and closed once the pane goes away
  // (another screen, or a narrower window) instead of turning into a pop-up.
  const paneSlot = useDetailsPaneSlot();
  const inPane = modals.detailsInPane;
  useEffect(() => {
    if (detailsId && (!detailsTransaction || (inPane && !paneSlot))) closeDetails();
  }, [detailsId, detailsTransaction, inPane, paneSlot, closeDetails]);

  // Edit pressed on the entry shown in the Activity pane: the form takes the details' place there.
  // Opening another entry, or the pane going away, closes the form instead of turning it into a pop-up.
  const paneShows = (transaction: Transaction | null | undefined) =>
    !!transaction && inPane && !!paneSlot && !!detailsTransaction && detailsTransaction.id === transaction.id;
  // Where each form request opens is decided once, when it comes in: a new request (another entry,
  // a new draft from Ctrl+N or the Add menu) while a form is open decides afresh.
  const editPlace = useRef<{ id: string; inPane: boolean } | null>(null);
  if (!modals.isEditModalOpen || !selectedTransaction) editPlace.current = null;
  else if (editPlace.current?.id !== selectedTransaction.id) {
    editPlace.current = { id: selectedTransaction.id, inPane: !isNewTransaction && paneShows(selectedTransaction) };
  }
  const editInPane = modals.isEditModalOpen && !!editPlace.current?.inPane;
  const editLostPane = editInPane && !paneShows(selectedTransaction);
  const { setIsEditModalOpen } = modals;
  useEffect(() => {
    if (editLostPane) setIsEditModalOpen(false);
  }, [editLostPane, setIsEditModalOpen]);

  // The forms' tops follow the Home header colour (Settings > Header).
  const headerTone = state.homeHeader?.tone === 'dark' ? 'dark' : 'accent';
  // Someone added by name from the receipt or split forms, in the next chart colour.
  const addPersonNamed = (name: string) => addPerson(name, state.baseCurrency, CHART_COLORS[state.people.length % CHART_COLORS.length]);

  const editTransaction = (transaction: Transaction) => {
    if (transaction.splitDetails) {
      setSplitTransactionContext(transaction);
      modals.setIsSplitExpenseModalOpen(true);
      return;
    }
    setSelectedTransaction(transaction);
    modals.setIsEditModalOpen(true);
  };

  // On wide windows Shared and People show the open person in their right-hand column. A person
  // shown there closes when the column goes away (another screen, a narrower window) instead of
  // turning into the panel over the screen.
  const personSlot = personPane.use();
  const personInPane = useRef<string | null>(null);
  if (!selectedPerson) personInPane.current = null;
  else if (personSlot) personInPane.current = selectedPerson.id;
  const personLostPane = !!selectedPerson && !personSlot && personInPane.current === selectedPerson.id;
  useEffect(() => {
    if (personLostPane) setSelectedPerson(null);
  }, [personLostPane, setSelectedPerson]);
  const renderPerson = (person: Person, pane: boolean) => (
    <PersonDetail
      key={pane ? `person-pane-${person.id}` : 'person'}
      variant={pane ? 'pane' : 'modal'}
      person={state.people.find(item => item.id === person.id) ?? person}
      transactions={state.transactions}
      categories={state.categories}
      baseCurrency={state.baseCurrency}
      rates={state.rates}
      onClose={() => setSelectedPerson(null)}
      onDelete={deletePerson}
      onEdit={(person) => {
        setPersonToEdit(person);
        modals.setIsAddPersonModalOpen(true);
      }}
      onSettleUp={handleSettleUp}
      onUpdateBalance={handleUpdatePersonBalance}
      accounts={state.accounts}
      language={state.language}
      state={state}
      onOpenEvent={onOpenEvent}
      tone={headerTone}
    />
  );

  const renderEdit = (pane: boolean) => (
    <EditTransactionModal
      key={pane ? `edit-pane-${selectedTransaction?.id}` : 'edit'}
      variant={pane ? 'pane' : 'modal'}
      isOpen={modals.isEditModalOpen}
      onClose={() => modals.setIsEditModalOpen(false)}
      transaction={selectedTransaction}
      isNewTransaction={isNewTransaction}
      accounts={state.accounts}
      categories={state.categories}
      people={state.people}
      events={state.events}
      onSave={updateTransaction}
      onDelete={deleteTransaction}
      t={t}
      transactions={state.transactions}
      rates={state.rates}
      headerTone={headerTone}
    />
  );

  const renderDetails = (transaction: Transaction, pane: boolean) => (
    <TransactionDetailsSheet
      key={pane ? transaction.id : 'transaction-details'}
      transaction={transaction}
      origin={modals.detailsOrigin}
      state={state}
      onClose={closeDetails}
      covered={!pane && (modals.isEditModalOpen || modals.isSplitExpenseModalOpen)}
      variant={pane ? 'pane' : 'modal'}
      onEdit={editTransaction}
      onSplit={(transaction, personIds) => {
        setSplitPrefill(undefined);
        setSplitPreselect(personIds?.length ? personIds : undefined);
        setSplitTransactionContext(transaction);
        modals.setIsSplitExpenseModalOpen(true);
      }}
      onDuplicate={transaction => {
        setSelectedTransaction(duplicateTransactionDraft(transaction, { createId }));
        modals.setIsEditModalOpen(true);
      }}
      onSaveAsTemplate={onSaveAsTemplate}
      onDelete={transaction => {
        closeDetails();
        deleteTransaction(transaction.id);
      }}
      onSettle={handleSettleUp}
      onUpdate={transaction => void updateTransaction(transaction, undefined, { silent: true })}
      onToast={addToast}
    />
  );

  return (
    <Suspense fallback={null}>
      {detailsTransaction && inPane && paneSlot && createPortal(
        editInPane && !editLostPane ? renderEdit(true) : renderDetails(detailsTransaction, true),
        paneSlot,
      )}
      {selectedPerson && personSlot && createPortal(renderPerson(selectedPerson, true), personSlot)}
      {/* Modals stay mounted while their exit animation plays. */}
      <AnimatePresence>
      {/* First, so the forms opened from it (same layer, later in the page) sit on top of it. */}
      {detailsTransaction && !inPane && renderDetails(detailsTransaction, false)}
      {modals.isSplitModalOpen && (
        <SplitModal
          key="split"
          isOpen={modals.isSplitModalOpen}
          onClose={() => modals.setIsSplitModalOpen(false)}
          people={state.people}
          userProfile={state.userProfile}
          accounts={state.accounts}
          onSplit={handleSplitTransaction}
          t={t}
        />
      )}

      {selectedPerson && !personSlot && !personLostPane && renderPerson(selectedPerson, false)}

      {modals.isAddPersonModalOpen && (
        <AddPersonModal
          key="add-person"
          isOpen={modals.isAddPersonModalOpen}
          onClose={() => {
            modals.setIsAddPersonModalOpen(false);
            setPersonToEdit(null);
          }}
          onAdd={addPerson}
          onUpdate={updatePerson}
          initialData={personToEdit}
          language={state.language}
        />
      )}

      {modals.isUserProfileModalOpen && (
        <AddPersonModal
          key="user-profile"
          isOpen={modals.isUserProfileModalOpen}
          onClose={() => modals.setIsUserProfileModalOpen(false)}
          onAdd={createUserProfile}
          onUpdate={updateUserProfile}
          initialData={state.userProfile || null}
          language={state.language}
          isOwnProfile
        />
      )}

      {modals.isEditModalOpen && !editInPane && renderEdit(false)}

      {modals.isEventCreationModalOpen && (
        <EventCreationModal
          key="event-create"
          isOpen={modals.isEventCreationModalOpen}
          onClose={() => modals.setIsEventCreationModalOpen(false)}
          onCreate={handleCreateEvent}
          people={state.people}
          userProfile={state.userProfile}
        />
      )}

      {modals.isReceiptScanModalOpen && (
        <ReceiptScanModal
          key="receipt-scan"
          isOpen={modals.isReceiptScanModalOpen}
          onClose={() => {
            modals.setIsReceiptScanModalOpen(false);
            clearSharedReceiptImage?.();
          }}
          categories={state.categories}
          accounts={state.accounts}
          baseCurrency={state.baseCurrency}
          rates={state.rates}
          language={state.language}
          initialImage={sharedReceiptImage}
          initialFile={droppedReceipt}
          people={state.people}
          userProfile={state.userProfile}
          transactions={state.transactions}
          onAddPerson={addPersonNamed}
          onSplitRequested={(prefill) => {
            modals.setIsReceiptScanModalOpen(false);
            clearSharedReceiptImage?.();
            setSplitTransactionContext(undefined);
            setSplitPrefill(prefill);
            modals.setIsSplitExpenseModalOpen(true);
          }}
          onTransactionCreated={(transaction) => {
            addTransaction(transaction);
            modals.setIsReceiptScanModalOpen(false);
            clearSharedReceiptImage?.();
          }}
        />
      )}

      {modals.isSplitExpenseModalOpen && (
        <SplitExpenseModal
          key="split-expense"
          isOpen={modals.isSplitExpenseModalOpen}
          onClose={() => {
            modals.setIsSplitExpenseModalOpen(false);
            setSplitTransactionContext(undefined);
            setSplitPrefill(undefined);
            setSplitPreselect(undefined);
          }}
          onSplit={handleUnifiedSplit}
          people={state.people}
          userProfile={state.userProfile}
          categories={state.categories}
          accounts={state.accounts}
          baseCurrency={state.baseCurrency}
          rates={state.rates}
          language={state.language}
          transaction={splitTransactionContext || undefined}
          prefill={splitPrefill}
          preselect={splitPreselect}
          onShowToast={addToast}
          events={state.events}
          activeEvent={activeEvent}
          linkToActiveEvent={linkToActiveEvent}
          headerTone={headerTone}
          appState={state}
          onAddPerson={addPersonNamed}
        />
      )}
      </AnimatePresence>
      {(askMounted || modals.isAskOpen) && (
        <AskSheet isOpen={modals.isAskOpen} onClose={() => modals.setIsAskOpen(false)} state={state} seed={askSeed} />
      )}
      {onSavePaymentDetails && <PaymentHost state={state} onSaveDetails={onSavePaymentDetails} onToast={addToast} />}
    </Suspense>
  );
};
