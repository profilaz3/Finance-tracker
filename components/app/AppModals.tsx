import React, { Suspense } from 'react';
import { lazyWithReload } from '../../utils/lazyWithReload';
import { AppState, Currency, Event, Person, Transaction } from '../../types';
import { TRANSLATIONS } from '../../constants';

const AddPersonModal = lazyWithReload(() => import('../AddPersonModal').then(m => ({ default: m.AddPersonModal })));
const PersonDetail = lazyWithReload(() => import('../PersonDetail').then(m => ({ default: m.PersonDetail })));
const EditTransactionModal = lazyWithReload(() => import('../EditTransactionModal').then(m => ({ default: m.EditTransactionModal })));
const ReceiptModal = lazyWithReload(() => import('../ReceiptModal').then(m => ({ default: m.ReceiptModal })));
const SplitModal = lazyWithReload(() => import('../SplitModal').then(m => ({ default: m.SplitModal })));
const EventCreationModal = lazyWithReload(() => import('../EventCreationModal').then(m => ({ default: m.EventCreationModal })));
const ReceiptScanModal = lazyWithReload(() => import('../ReceiptScanModal').then(m => ({ default: m.ReceiptScanModal })));
const SplitExpenseModal = lazyWithReload(() => import('../split-expense').then(m => ({ default: m.SplitExpenseModal })));

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
}

export const AppModals: React.FC<AppModalsProps> = ({
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

  return (
    <Suspense fallback={null}>
      {modals.isSplitModalOpen && (
        <SplitModal
          isOpen={modals.isSplitModalOpen}
          onClose={() => modals.setIsSplitModalOpen(false)}
          people={state.people}
          accounts={state.accounts}
          onSplit={handleSplitTransaction}
          t={t}
        />
      )}

      {selectedPerson && (
        <PersonDetail
          person={selectedPerson}
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
          isOpen={modals.isReceiptModalOpen}
          onClose={() => modals.setIsReceiptModalOpen(false)}
          transaction={selectedTransaction}
          onSave={updateTransaction}
          t={t}
        />
      )}

      {modals.isEditModalOpen && (
        <EditTransactionModal
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
        />
      )}

      {modals.isEventCreationModalOpen && (
        <EventCreationModal
          isOpen={modals.isEventCreationModalOpen}
          onClose={() => modals.setIsEventCreationModalOpen(false)}
          onCreate={handleCreateEvent}
          people={state.people}
          userProfile={state.userProfile}
        />
      )}

      {modals.isReceiptScanModalOpen && (
        <ReceiptScanModal
          isOpen={modals.isReceiptScanModalOpen}
          onClose={() => modals.setIsReceiptScanModalOpen(false)}
          categories={state.categories}
          accounts={state.accounts}
          baseCurrency={state.baseCurrency}
          language={state.language}
          onTransactionCreated={(transaction) => {
            addTransaction(transaction);
            modals.setIsReceiptScanModalOpen(false);
          }}
        />
      )}

      {modals.isSplitExpenseModalOpen && (
        <SplitExpenseModal
          isOpen={modals.isSplitExpenseModalOpen}
          onClose={() => {
            modals.setIsSplitExpenseModalOpen(false);
            setSplitTransactionContext(undefined);
          }}
          onSplit={handleUnifiedSplit}
          people={state.people}
          categories={state.categories}
          accounts={state.accounts}
          baseCurrency={state.baseCurrency}
          rates={state.rates}
          language={state.language}
          transaction={splitTransactionContext || undefined}
          onShowToast={addToast}
          events={state.events}
          activeEvent={activeEvent}
          linkToActiveEvent={linkToActiveEvent}
        />
      )}
    </Suspense>
  );
};
