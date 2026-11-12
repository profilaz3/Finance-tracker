import React, { lazy } from 'react';
import { AppState, Event, Person, Transaction, View } from '../../types';
import type { ParsedTransaction } from '../../services/aiService';
import { createLinkedExpenseDraft, createRepeatTransactionDraft, createTransactionDraft, duplicateTransactionDraft } from '../../domain/transactions';

const Stats = lazy(() => import('../Stats').then(m => ({ default: m.Stats })));
const DashboardView = lazy(() => import('../DashboardView').then(m => ({ default: m.DashboardView })));
const TransactionsView = lazy(() => import('../TransactionsView').then(m => ({ default: m.TransactionsView })));
const SettingsView = lazy(() => import('../settings').then(m => ({ default: m.SettingsView })));
const CalendarView = lazy(() => import('../CalendarView').then(m => ({ default: m.CalendarView })));
const EventsView = lazy(() => import('../EventsView').then(m => ({ default: m.EventsView })));
const EventDetailView = lazy(() => import('../event-detail').then(m => ({ default: m.EventDetailView })));
const InsightsView = lazy(() => import('../InsightsView').then(m => ({ default: m.InsightsView })));

type DashboardTab = 'wallets' | 'debts' | 'loans' | 'people';

interface AppViewRouterProps {
  currentView: View;
  state: AppState;
  dashboardTab: DashboardTab;
  setDashboardTab: (tab: DashboardTab) => void;
  selectedEvent: Event | null;
  setSelectedEvent: (event: Event | null) => void;
  setSelectedPerson: (person: Person | null) => void;
  setSelectedTransaction: (transaction: Transaction | null) => void;
  setCurrentView: (view: View) => void;
  setSplitTransactionContext: (transaction: Transaction | undefined) => void;
  activeEvent?: Event;
  linkToActiveEvent: boolean;
  setLinkToActiveEvent: (value: boolean) => void;
  addTransaction: (transaction: Transaction) => Promise<void>;
  deleteTransaction: (id: string) => void;
  handleParsedTransaction: (parsed: ParsedTransaction) => void;
  handleSaveAsTemplate: (transaction: Transaction) => void;
  handleUseTemplate: (templateId: string) => void;
  handleDeleteTemplate: (templateId: string) => void;
  handleUpdateEvent: (id: string, updates: Partial<Event>) => Promise<void>;
  handleShareEvent: (id: string, email: string) => Promise<void>;
  handleDeleteEvent: (id: string) => Promise<void>;
  handleAddSharedExpense: (expense: AppState['sharedExpenses'][number]) => Promise<void>;
  handleDeleteSharedExpense: (id: string) => Promise<void>;
  batchDeleteTransactions: (ids: string[]) => void;
  createId: () => string;
  totalBalance: number;
  totalIncome: number;
  totalExpense: number;
  getAccountBalance: (account: AppState['accounts'][number]) => number;
  processRecurringTransactions: () => void;
  handleUpdateAccount: (accountId: string, updates: Partial<AppState['accounts'][number]>) => void;
  handleAddAccount: (account: AppState['accounts'][number]) => void;
  handleDeleteAccount: (accountId: string) => void;
  handleDeleteUserAccount: () => Promise<AppState>;
  handleLogout: () => Promise<AppState>;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  setIsAddPersonModalOpen: (isOpen: boolean) => void;
  setIsEditModalOpen: (isOpen: boolean) => void;
  setIsReceiptModalOpen: (isOpen: boolean) => void;
  setIsSplitModalOpen: (isOpen: boolean) => void;
  setIsEventCreationModalOpen: (isOpen: boolean) => void;
  setIsReceiptScanModalOpen: (isOpen: boolean) => void;
  setIsSplitExpenseModalOpen: (isOpen: boolean) => void;
  setIsUserProfileModalOpen: (isOpen: boolean) => void;
  handleAddCategory: (category: AppState['categories'][number]) => void;
  handleUpdateCategory: (category: AppState['categories'][number]) => void;
  handleDeleteCategory: (categoryId: string) => void;
  handleAddRecurring: (recurring: AppState['recurringTransactions'][number]) => Promise<void>;
  handleUpdateRecurring: (id: string, updates: Partial<AppState['recurringTransactions'][number]>) => Promise<void>;
  handleDeleteRecurring: (id: string) => Promise<void>;
  handleToggleRecurring: (id: string) => Promise<void>;
  handleSettleUp: (personId: string, currency: AppState['baseCurrency'], amount?: number) => void;
  addToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  handleOpenAddTransaction: (type?: Transaction['type'], personId?: string) => void;
}

export const AppViewRouter: React.FC<AppViewRouterProps> = ({
  currentView,
  state,
  dashboardTab,
  setDashboardTab,
  selectedEvent,
  setSelectedEvent,
  setSelectedPerson,
  setSelectedTransaction,
  setCurrentView,
  setSplitTransactionContext,
  activeEvent,
  linkToActiveEvent,
  setLinkToActiveEvent,
  addTransaction,
  deleteTransaction,
  handleOpenAddTransaction,
  handleParsedTransaction,
  handleSaveAsTemplate,
  handleUseTemplate,
  handleDeleteTemplate,
  handleUpdateEvent,
  handleShareEvent,
  handleDeleteEvent,
  handleAddSharedExpense,
  handleDeleteSharedExpense,
  batchDeleteTransactions,
  createId,
  totalBalance,
  totalIncome,
  totalExpense,
  getAccountBalance,
  processRecurringTransactions,
  handleUpdateAccount,
  handleAddAccount,
  handleDeleteAccount,
  handleDeleteUserAccount,
  handleLogout,
  setState,
  setIsAddPersonModalOpen,
  setIsEditModalOpen,
  setIsReceiptModalOpen,
  setIsSplitModalOpen,
  setIsEventCreationModalOpen,
  setIsReceiptScanModalOpen,
  setIsSplitExpenseModalOpen,
  setIsUserProfileModalOpen,
  handleAddCategory,
  handleUpdateCategory,
  handleDeleteCategory,
  handleAddRecurring,
  handleUpdateRecurring,
  handleDeleteRecurring,
  handleToggleRecurring,
  handleSettleUp,
  addToast,
}) => (
  <div key={currentView} className="app-view-enter">
    {currentView === 'dashboard' && (
      <DashboardView
        state={state}
        dashboardTab={dashboardTab}
        setDashboardTab={setDashboardTab}
        setSelectedPerson={setSelectedPerson}
        addTransaction={addTransaction}
        setCurrentView={setCurrentView}
        getAccountBalance={getAccountBalance}
        totalBalance={totalBalance}
        totalIncome={totalIncome}
        totalExpense={totalExpense}
        handleOpenAddTransaction={(type = 'expense') => {
          const accountId = state.accounts[0]?.id || '';
          const eventId = linkToActiveEvent && activeEvent ? activeEvent.id : undefined;
          const newTransaction = type === 'income'
            ? (() => {
                const incomeDraft = createTransactionDraft({
                  createId,
                  baseCurrency: state.baseCurrency,
                  accountId,
                  type: 'income',
                });
                return eventId ? { ...incomeDraft, eventId } : incomeDraft;
              })()
            : createLinkedExpenseDraft({
                createId,
                baseCurrency: state.baseCurrency,
                accountId,
                categories: state.categories,
                eventId,
              });
          setSelectedTransaction(newTransaction);
          setIsEditModalOpen(true);
        }}
        onParsedTransaction={handleParsedTransaction}
        onOpenReceiptScan={() => setIsReceiptScanModalOpen(true)}
        onOpenQuickSplit={() => setIsSplitExpenseModalOpen(true)}
        activeEvent={activeEvent}
        linkToActiveEvent={linkToActiveEvent}
        setLinkToActiveEvent={setLinkToActiveEvent}
        onViewEvent={(event) => {
          setSelectedEvent(event);
          setCurrentView('events');
        }}
        onUseTemplate={handleUseTemplate}
        onDeleteTemplate={handleDeleteTemplate}
        onRepeatTransaction={(transaction) => {
          const repeated = createRepeatTransactionDraft(transaction, { createId });
          setSelectedTransaction(repeated);
          setIsEditModalOpen(true);
        }}
      />
    )}
    {currentView === 'transactions' && (
      <TransactionsView
        state={state}
        setSelectedTransaction={setSelectedTransaction}
        setIsEditModalOpen={setIsEditModalOpen}
        setIsReceiptModalOpen={setIsReceiptModalOpen}
        setIsSplitModalOpen={setIsSplitModalOpen}
        deleteTransaction={deleteTransaction}
        onEditSplitTransaction={(tx) => {
          setSplitTransactionContext(tx);
          setIsSplitExpenseModalOpen(true);
        }}
        onDuplicateTransaction={(tx) => {
          const duplicated = duplicateTransactionDraft(tx, { createId });
          setSelectedTransaction(duplicated);
          setIsEditModalOpen(true);
        }}
        onParsedTransaction={handleParsedTransaction}
        onSaveAsTemplate={handleSaveAsTemplate}
        onBatchDelete={batchDeleteTransactions}
        onAddTransaction={handleOpenAddTransaction}
        onOpenSplit={() => setIsSplitExpenseModalOpen(true)}
      />
    )}
    {currentView === 'events' && (
      selectedEvent ? (
        <EventDetailView
          event={selectedEvent}
          state={state}
          onBack={() => setSelectedEvent(null)}
          onUpdateEvent={handleUpdateEvent}
          onShareEvent={handleShareEvent}
          onDeleteEvent={handleDeleteEvent}
          onAddSharedExpense={handleAddSharedExpense}
          onUpdateSharedExpense={handleAddSharedExpense}
          onDeleteSharedExpense={handleDeleteSharedExpense}
          onEditTransaction={(tx) => {
            setSelectedTransaction(tx);
            setIsEditModalOpen(true);
          }}
          onDeleteTransaction={deleteTransaction}
          onShowToast={addToast}
        />
      ) : (
        <EventsView
          state={state}
          onCreateEvent={() => setIsEventCreationModalOpen(true)}
          onSelectEvent={setSelectedEvent}
        />
      )
    )}
    {currentView === 'calendar' && (
      <CalendarView
        state={state}
        onAddTransaction={addTransaction}
        setCurrentView={setCurrentView}
        setSelectedTransaction={setSelectedTransaction}
        setIsEditModalOpen={setIsEditModalOpen}
        setIsReceiptModalOpen={setIsReceiptModalOpen}
        setIsSplitModalOpen={setIsSplitModalOpen}
        deleteTransaction={deleteTransaction}
        onEditSplitTransaction={(tx) => {
          setSplitTransactionContext(tx);
          setIsSplitExpenseModalOpen(true);
        }}
      />
    )}
    {currentView === 'analytics' && (
      <Stats
        transactions={state.transactions}
        categories={state.categories}
        accounts={state.accounts}
        recurringTransactions={state.recurringTransactions}
        baseCurrency={state.baseCurrency}
        rates={state.rates}
        language={state.language}
        totalExpense={totalExpense}
      />
    )}
    {currentView === 'insights' && (
      <InsightsView
        transactions={state.transactions}
        categories={state.categories}
        baseCurrency={state.baseCurrency}
        language={state.language}
      />
    )}
    {currentView === 'settings' && (
      <SettingsView
        state={state}
        setState={setState}
        handleUpdateAccount={handleUpdateAccount}
        handleAddAccount={handleAddAccount}
        handleDeleteAccount={handleDeleteAccount}
        setIsAddPersonModalOpen={setIsAddPersonModalOpen}
        setSelectedPerson={setSelectedPerson}
        handleOpenAddTransaction={handleOpenAddTransaction}
        getAccountBalance={getAccountBalance}
        onLogout={async () => {
          const freshState = await handleLogout();
          setState(freshState);
        }}
        onDeleteAccount={async () => {
          try {
            const freshState = await handleDeleteUserAccount();
            setState(freshState);
            addToast('Account deleted successfully', 'success');
          } catch (error: unknown) {
            console.error('Failed to delete account:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            addToast('Failed to delete account: ' + errorMessage, 'error');
          }
        }}
        onAddCategory={handleAddCategory}
        onUpdateCategory={handleUpdateCategory}
        onDeleteCategory={handleDeleteCategory}
        onCreateUserProfile={() => setIsUserProfileModalOpen(true)}
        onEditUserProfile={() => setIsUserProfileModalOpen(true)}
        onAddRecurring={handleAddRecurring}
        onUpdateRecurring={handleUpdateRecurring}
        onDeleteRecurring={handleDeleteRecurring}
        onToggleRecurring={handleToggleRecurring}
        onProcessRecurring={processRecurringTransactions}
        onSettleUp={handleSettleUp}
      />
    )}
  </div>
);
