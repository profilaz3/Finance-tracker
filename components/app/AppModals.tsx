import React, { Suspense, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { lazyWithReload } from '../../utils/lazyWithReload';
import { AppState, Currency, Event, Person, Transaction } from '../../types';
import { CHART_COLORS, TRANSLATIONS } from '../../constants';
import type { SplitPrefill } from '../split-expense/types';
import { useAskRequests } from '../ask/askBus';
import type { PaymentDetails } from '../../types';

const AddPersonModal = lazyWithReload(() => import('../AddPersonModal').then(m => ({ default: m.AddPersonModal })));
const PersonDetail = lazyWithReload(() => import('../PersonDetail').then(m => ({ default: m.PersonDetail })));
const EditTransactionModal = lazyWithReload(() => import('../EditTransactionModal').then(m => ({ default: m.EditTransactionModal })));
const ReceiptModal = lazyWithReload(() => import('../ReceiptModal').then(m => ({ default: m.ReceiptModal })));
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
  isReceiptModalOpen: boolean;
  setIsReceiptModalOpen: (isOpen: boolean) => void;
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
  personToEdit: Person | null;
  splitTransactionContext?: Transaction;
  activeEvent?: Event;
  linkToActiveEvent: boolean;
  setSelectedPerson: (person: Person | null) => void;
  setPersonToEdit: (person: Person | null) => void;
  setSplitTransactionContext: (transaction: Transaction | undefined) => void;
  handleSplitTransaction: (amount: number, currency: Currency, targetId: string, targetType: 'account' | 'person') => Promise<void>;
  deletePerson: (id: string) => Promise<void>;
  handleSettleUp: (personId: string, currency: AppState['baseCurrency'], amount?: number) => void;
  handleUpdatePersonBalance: (personId: string, currency: Currency, newBalance: number) => Promise<void>;
  addPerson: (name: string, defaultCurrency: Currency, color: string, avatar?: string) => Promise<void>;
  updatePerson: (id: string, updates: Partial<Person>) => Promise<void>;
  createUserProfile: (name: string, defaultCurrency: Currency, color: string, avatar?: string) => Promise<void>;
  updateUserProfile: (id: string, updates: Partial<Person>) => Promise<void>;
  updateTransaction: (updatedTransaction: Transaction) => Promise<void>;
  deleteTransaction: (id: string) => void;
  handleCreateEvent: (event: Event) => Promise<void>;
  addTransaction: (transaction: Transaction) => Promise<void>;
  handleUnifiedSplit: (result: {
    transactions: Transaction[];
    balanceUpdates: { personId: string; currency: Currency; delta: number }[];
  }) => Promise<void>;
  addToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  t: typeof TRANSLATIONS.en;
  /** A receipt image shared into the app; opens the receipt scanner preloaded. */
  sharedReceiptImage?: string | null;
  clearSharedReceiptImage?: () => void;
  /** Saves (or clears) the user's account for IPS QR payment requests. */
  onSavePaymentDetails?: (details: PaymentDetails | null) => void;
}

export const AppModals: React.FC<AppModalsProps> = ({
  sharedReceiptImage,
  clearSharedReceiptImage,
  onSavePaymentDetails,
  modals,
  state,
  selectedTransaction,
  selectedPerson,
  personToEdit,
  splitTransactionContext,
  activeEvent,
  linkToActiveEvent,
  setSelectedPerson,
  setPersonToEdit,
  setSplitTransactionContext,
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
  // Ask sheet: mounted on first open, then kept so the conversation survives closing it.
  const [askMounted, setAskMounted] = useState(false);
  const [askSeed, setAskSeed] = useState<{ question: string; nonce: number } | null>(null);
  useAskRequests((question) => {
    setAskMounted(true);
    if (question) setAskSeed({ question, nonce: Date.now() });
    modals.setIsAskOpen(true);
  });

  return (
    <Suspense fallback={null}>
      {/* Modals stay mounted while their exit animation plays. */}
      <AnimatePresence>
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

      {selectedPerson && (
        <PersonDetail
          key="person"
          person={state.people.find(person => person.id === selectedPerson.id) ?? selectedPerson}
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
          language={state.language}
        />
      )}

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
        />
      )}

      {modals.isReceiptModalOpen && (
        <ReceiptModal
          key="receipt"
          isOpen={modals.isReceiptModalOpen}
          onClose={() => modals.setIsReceiptModalOpen(false)}
          transaction={selectedTransaction}
          onSave={updateTransaction}
          t={t}
        />
      )}

      {modals.isEditModalOpen && (
        <EditTransactionModal
          key="edit"
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
        />
      )}

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
          language={state.language}
          initialImage={sharedReceiptImage}
          people={state.people}
          userProfile={state.userProfile}
          transactions={state.transactions}
          onAddPerson={name => addPerson(name, state.baseCurrency, CHART_COLORS[state.people.length % CHART_COLORS.length])}
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
          onShowToast={addToast}
          events={state.events}
          activeEvent={activeEvent}
          linkToActiveEvent={linkToActiveEvent}
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
