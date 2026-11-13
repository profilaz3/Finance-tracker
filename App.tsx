import React, { useEffect, useState, useCallback, useRef, useMemo, lazy, Suspense } from 'react';
import { Transaction, Category, Person, View, TransactionType, Event } from './types';

import { getSupabaseService } from './services/runtimeServices';
import { subscribeStorageErrors } from './services/storageHealth';
import { CONFIG } from './config';
import { TRANSLATIONS } from './constants';
import { ToastContainer, Toast } from './components/Toast';
import { vibrate, HAPTIC_PATTERNS } from './utils/haptics';
import clsx from 'clsx';
import { createTransactionDraft } from './domain/transactions';
const AuthView = lazy(() => import('./components/AuthView').then(m => ({ default: m.AuthView })));
import type { ParsedTransaction } from './services/aiService';
import { DashboardSkeleton, TransactionsListSkeleton, CalendarSkeleton, GenericViewSkeleton } from './components/Skeleton';
import { ErrorBoundary, ViewErrorBoundary } from './components/ErrorBoundary';
import { AppModals } from './components/app/AppModals';
import { AppNavigation } from './components/app/AppNavigation';
import { AppViewRouter } from './components/app/AppViewRouter';

// Extracted hooks
import { useAuth } from './hooks/useAuth';
import { useAppState } from './hooks/useAppState';
import { useModals } from './hooks/useModals';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useExchangeRates } from './hooks/useExchangeRates';
import { useEventHandlers } from './hooks/useEventHandlers';
import { usePeopleHandlers } from './hooks/usePeopleHandlers';
import { useRecurringProcessor } from './hooks/useRecurringProcessor';
import { useRecurringHandlers } from './hooks/useRecurringHandlers';
import { useSync } from './hooks/useSync';
import { useScrollRestore } from './hooks/useScrollRestore';
import { useTemplateHandlers } from './hooks/useTemplateHandlers';
import { useTransactionHandlers } from './hooks/useTransactionHandlers';
import { useAccountHandlers } from './hooks/useAccountHandlers';
import { useSplitHandlers } from './hooks/useSplitHandlers';
import { useFinancialSelectors } from './hooks/useFinancialSelectors';

const createId = () => crypto.randomUUID();

const App: React.FC = () => {
  // --- Extracted Hooks ---
  const { isAuthenticated, isLoadingAuth, handleLogin, handleLogout, handleDeleteAccount: handleDeleteUserAccount } = useAuth();
  const { state, setState, fetchRemoteState, areSlicesHydrated } = useAppState(isAuthenticated);
  const modals = useModals();

  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [dashboardTab, setDashboardTab] = useState<'wallets' | 'debts' | 'loans' | 'people'>('wallets');

  // Inputs State
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryType, setNewCategoryType] = useState<TransactionType>('expense');

  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [personToEdit, setPersonToEdit] = useState<Person | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Events State
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [linkToActiveEvent, setLinkToActiveEvent] = useState(false);

  // Computed: Active event for dashboard linking
  const activeEvent = state.events.find(e => e.status === 'active');

  // Split context
  const [splitTransactionContext, setSplitTransactionContext] = useState<Transaction | undefined>(undefined);

  // Toast system
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Scroll restoration
  const scrollRestore = useScrollRestore();
  const mainRef = useRef<HTMLElement>(null);

  // Touch Swipe Refs
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const touchEndXRef = useRef<number | null>(null);
  const touchEndYRef = useRef<number | null>(null);

  const t = TRANSLATIONS[state.language];
  const defaultAccountId = state.accounts[0]?.id || '';

  // --- Use extracted hooks ---
  useExchangeRates(isAuthenticated, setState);
  useSync(state, isAuthenticated, areSlicesHydrated('settings'));

  // Fetch remote state on auth
  useEffect(() => {
    if (isAuthenticated) {
      let cancelled = false;

      fetchRemoteState().then(remoteState => {
        if (remoteState?.events && remoteState.events.length > 0) {
          getSupabaseService()
            .then(service => service.getUser())
            .then(user => {
              if (cancelled || !user) {
                return;
              }

              const sharedActiveEvents = (remoteState.events || []).filter((e: Event) =>
                e.status === 'active' &&
                e.userId !== user.id &&
                e.sharedEmails?.includes(user.email || '')
              );
              if (sharedActiveEvents.length > 0) {
                setSelectedEvent(sharedActiveEvents[0]);
                setCurrentView('events');
              }
            })
            .catch(error => {
              console.error('Failed to resolve authenticated user during remote state hydration:', error);
            });
        }
      });

      return () => {
        cancelled = true;
      };
    }
  }, [isAuthenticated, fetchRemoteState]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setActiveMenuId(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Auto-open active event when navigating to events page
  const hasAutoOpenedRef = useRef(false);
  useEffect(() => {
    if (currentView === 'events' && !selectedEvent && !hasAutoOpenedRef.current) {
      const active = state.events.find(e => e.status === 'active');
      if (active) {
        setSelectedEvent(active);
        hasAutoOpenedRef.current = true;
      }
    } else if (currentView !== 'events') {
      hasAutoOpenedRef.current = false;
    }
  }, [currentView, state.events, selectedEvent]);

  // Toast Management
  const addToast = (message: string, type: Toast['type'], action?: Toast['action']) => {
    const id = `toast-${Date.now()}`;
    const toast: Toast = { id, message, type, action, duration: action ? 10000 : 1500 };
    setToasts(prev => [...prev, toast]);

    if (!action) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, toast.duration);
    }
  };

  // Local storage full: tell the user instead of silently losing data.
  const storageWarningLanguageRef = useRef(state.language);
  storageWarningLanguageRef.current = state.language;
  useEffect(() => {
    let lastShownAt = 0;
    return subscribeStorageErrors(() => {
      const now = Date.now();
      if (now - lastShownAt < CONFIG.STORAGE_WARNING_THROTTLE_MS) return;
      lastShownAt = now;
      const id = `toast-storage-${now}`;
      const message = storageWarningLanguageRef.current === 'sr'
        ? 'Memorija uređaja je puna: najnovije izmene možda nisu sačuvane lokalno'
        : 'Device storage is full: recent changes may not be saved locally';
      setToasts(prev => [...prev, { id, message, type: 'error', duration: 6000 }]);
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 6000);
    });
  }, []);

  const dismissToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const {
    addTransaction,
    deleteTransaction,
    batchDeleteTransactions,
    updateTransaction,
  } = useTransactionHandlers({
    state,
    setState,
    addToast,
    createId,
    setSelectedTransaction,
    closeEditModal: () => modals.setIsEditModalOpen(false),
    closeReceiptModal: () => modals.setIsReceiptModalOpen(false),
  });

  const { handleUpdateAccount } = useAccountHandlers({
    state,
    setState,
    addToast,
    isHydrated: areSlicesHydrated('accounts'),
  });

  const {
    handleCreateEvent,
    handleUpdateEvent,
    handleShareEvent,
    handleDeleteEvent,
    handleAddSharedExpense,
    handleDeleteSharedExpense,
  } = useEventHandlers({
    state,
    setState,
    selectedEvent,
    setSelectedEvent,
    addToast,
  });

  const {
    handleSaveAsTemplate,
    handleUseTemplate,
    handleDeleteTemplate,
  } = useTemplateHandlers({
    state,
    setState,
    setSelectedTransaction,
    setIsEditModalOpen: modals.setIsEditModalOpen,
    addToast,
  });

  const {
    handleAddRecurring,
    handleUpdateRecurring,
    handleDeleteRecurring,
    handleToggleRecurring,
    processRecurringTransactions,
  } = useRecurringHandlers({
    state,
    setState,
    addTransaction,
    addToast,
  });

  const {
    addPerson,
    updatePerson,
    createUserProfile,
    updateUserProfile,
    handleUpdatePersonBalance,
    deletePerson,
    handleAddAccount,
    handleDeleteAccount,
    handleSettleUp,
    handleAddCategory,
    handleUpdateCategory,
    handleDeleteCategory,
  } = usePeopleHandlers({
    state,
    setState,
    selectedPerson,
    setSelectedPerson,
    closeUserProfileModal: () => modals.setIsUserProfileModalOpen(false),
    addToast,
    addTransaction,
    createId,
  });

  const {
    handleSplitTransaction,
    handleUnifiedSplit,
  } = useSplitHandlers({
    state,
    setState,
    selectedTransaction,
    setSelectedTransaction,
    setSplitTransactionContext,
    addToast,
    createId,
    closeSplitModal: () => modals.setIsSplitModalOpen(false),
    closeSplitExpenseModal: () => modals.setIsSplitExpenseModalOpen(false),
  });

  const {
    totalBalance,
    totalExpense,
    totalIncome,
    getAccountBalance,
  } = useFinancialSelectors(state);

  // Handler for AI parsed transactions
  const handleParsedTransaction = (parsed: ParsedTransaction) => {
    const category = state.categories.find(c =>
      c.name.toLowerCase() === parsed.categoryName.toLowerCase()
    ) || state.categories.find(c => c.type === parsed.type) || state.categories[0];

    const account = parsed.accountName
      ? state.accounts.find(a => a.name.toLowerCase() === parsed.accountName?.toLowerCase())
      : state.accounts[0];

    let personId: string | undefined;
    if (parsed.debtName) {
      const person = state.people.find(p => p.name.toLowerCase() === parsed.debtName?.toLowerCase());
      if (person) personId = person.id;
    } else if (parsed.loanName) {
      const person = state.people.find(p => p.name.toLowerCase() === parsed.loanName?.toLowerCase());
      if (person) personId = person.id;
    }

    const eventId = linkToActiveEvent && activeEvent ? activeEvent.id : undefined;

    const newTransaction: Transaction = {
      id: createId(),
      date: new Date(parsed.date || new Date()).toISOString(),
      amount: parsed.amount || 0,
      currency: parsed.currency || state.baseCurrency,
      categoryId: category?.id || state.categories[0]?.id,
      accountId: account?.id || state.accounts[0]?.id,
      type: parsed.type || 'expense',
      note: parsed.note || '',
      subcategory: parsed.subcategory,
      personId,
      fees: parsed.fees,
      eventId
    };

    setSelectedTransaction(newTransaction);
    modals.setIsEditModalOpen(true);
  };

  // --- Person Handlers ---
  const handleOpenAddTransaction = useCallback((type: TransactionType = 'expense', personId?: string) => {
    const newTransaction = createTransactionDraft({
      createId,
      baseCurrency: state.baseCurrency,
      accountId: defaultAccountId,
      type,
      personId,
    });
    setSelectedTransaction(newTransaction);
    modals.setIsEditModalOpen(true);
  }, [defaultAccountId, modals.setIsEditModalOpen, state.baseCurrency]);

  const shortcutHandlers = useMemo(() => ({
    onNewTransaction: () => handleOpenAddTransaction(),
    onEscape: () => modals.closeAllModals(),
  }), [handleOpenAddTransaction, modals.closeAllModals]);

  useKeyboardShortcuts(shortcutHandlers);

  useRecurringProcessor({
    isAuthenticated,
    isHydrated: areSlicesHydrated('transactions', 'recurringTransactions'),
    recurringTransactions: state.recurringTransactions,
    processRecurringTransactions,
  });

  const onTouchStart = (e: React.TouchEvent) => {
    touchEndXRef.current = null;
    touchEndYRef.current = null;
    touchStartXRef.current = e.targetTouches[0].clientX;
    touchStartYRef.current = e.targetTouches[0].clientY;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    touchEndXRef.current = e.targetTouches[0].clientX;
    touchEndYRef.current = e.targetTouches[0].clientY;
  };

  const onTouchEnd = () => {
    if (!touchStartXRef.current || !touchEndXRef.current) return;
    if (!touchStartYRef.current || !touchEndYRef.current) return;

    const distanceX = touchStartXRef.current - touchEndXRef.current;
    const distanceY = Math.abs(touchStartYRef.current - touchEndYRef.current);

    const isHorizontalSwipe = Math.abs(distanceX) > distanceY * 2 && Math.abs(distanceX) > 50;
    if (!isHorizontalSwipe) return;

    const isLeftSwipe = distanceX > 0;
    const isRightSwipe = distanceX < 0;

    const views: View[] = ['dashboard', 'transactions', 'events', 'calendar', 'analytics', 'insights', 'settings'];
    const currentIndex = views.indexOf(currentView);

    if (isLeftSwipe && currentIndex < views.length - 1) {
      handleViewChange(views[currentIndex + 1]);
      vibrate(HAPTIC_PATTERNS.light);
    }
    if (isRightSwipe && currentIndex > 0) {
      handleViewChange(views[currentIndex - 1]);
      vibrate(HAPTIC_PATTERNS.light);
    }
  };

  // --- View Skeletons ---
  const viewSkeleton: Record<View, React.ReactNode> = {
    dashboard: <DashboardSkeleton />,
    transactions: <TransactionsListSkeleton />,
    calendar: <CalendarSkeleton />,
    events: <GenericViewSkeleton />,
    analytics: <GenericViewSkeleton />,
    insights: <GenericViewSkeleton />,
    settings: <GenericViewSkeleton />,
    people: <GenericViewSkeleton />,
  };

  // --- Theme ---
  const themeClass = clsx(
    "flex h-screen font-sans overflow-hidden bg-surface text-on-surface transition-colors duration-500 select-none",
    {
      'theme-neon': state.theme === 'neon',
      'theme-racing-orange': state.theme === 'racing-orange',
      'theme-graphite': state.theme === 'graphite',
      'theme-coffee': state.theme === 'coffee',
      'theme-gilded': state.theme === 'gilded',
      'theme-crimson-red': state.theme === 'crimson-red',
      'theme-lime-dark': state.theme === 'lime-dark',
      'theme-sterling': state.theme === 'sterling',
      'theme-canyon': state.theme === 'canyon',
      'theme-cyberpunk-pink': state.theme === 'cyberpunk-pink',
      'theme-harbor': state.theme === 'harbor',
      'theme-galaxy': state.theme === 'galaxy',
      'theme-evergreen': state.theme === 'evergreen',
      'theme-linen': state.theme === 'linen',
      'theme-mist': state.theme === 'mist'
    }
  );

  // --- View Change Handler ---
  const handleViewChange = useCallback((view: View) => {
    if (mainRef.current) {
      scrollRestore.save(currentView, mainRef.current.scrollTop);
    }
    setCurrentView(view);
    requestAnimationFrame(() => {
      if (mainRef.current) {
        mainRef.current.scrollTop = scrollRestore.get(view);
      }
    });
  }, [currentView, scrollRestore]);

  // Close PersonDetail when navigating away
  useEffect(() => { setSelectedPerson(null); }, [currentView]);

  const handleNavigate = useCallback((view: View) => {
    handleViewChange(view);
    vibrate(HAPTIC_PATTERNS.light);
  }, [handleViewChange]);

  // --- Render ---
  if (isLoadingAuth) {
    return (
      <div className="min-h-screen bg-surface">
        <DashboardSkeleton />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Suspense fallback={<DashboardSkeleton />}>
        <AuthView
          onAuthSuccess={async () => {
            await handleLogin();
            await fetchRemoteState();
          }}
        />
      </Suspense>
    );
  }

  return (
    <div className={themeClass}>
      <AppNavigation
        currentView={currentView}
        onNavigate={handleNavigate}
        labels={{
          dashboard: t.dashboard,
          transactions: t.transactions,
          events: 'Events',
          calendar: 'Calendar',
          analytics: t.analytics,
          insights: t.aiInsights,
          settings: t.settings,
        }}
      />

      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <main
        ref={mainRef}
        id="main-content"
        className="flex-1 h-full overflow-y-auto bg-surface relative touch-pan-y"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        role="main"
        aria-label="Main content"
      >
        <div className="max-w-5xl mx-auto px-2 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-[max(0.5rem,env(safe-area-inset-top))] md:p-4 md:pb-8 lg:p-8">
          <ViewErrorBoundary>
            <Suspense fallback={viewSkeleton[currentView] || <DashboardSkeleton />}>
              <AppViewRouter
                currentView={currentView}
                state={state}
                dashboardTab={dashboardTab}
                setDashboardTab={setDashboardTab}
                selectedEvent={selectedEvent}
                setSelectedEvent={setSelectedEvent}
                setSelectedPerson={setSelectedPerson}
                setSelectedTransaction={setSelectedTransaction}
                setCurrentView={setCurrentView}
                setSplitTransactionContext={setSplitTransactionContext}
                activeEvent={activeEvent}
                linkToActiveEvent={linkToActiveEvent}
                setLinkToActiveEvent={setLinkToActiveEvent}
                addTransaction={addTransaction}
                deleteTransaction={deleteTransaction}
                handleOpenAddTransaction={handleOpenAddTransaction}
                handleParsedTransaction={handleParsedTransaction}
                handleSaveAsTemplate={handleSaveAsTemplate}
                handleUseTemplate={handleUseTemplate}
                handleDeleteTemplate={handleDeleteTemplate}
                handleUpdateEvent={handleUpdateEvent}
                handleShareEvent={handleShareEvent}
                handleDeleteEvent={handleDeleteEvent}
                handleAddSharedExpense={handleAddSharedExpense}
                handleDeleteSharedExpense={handleDeleteSharedExpense}
                batchDeleteTransactions={batchDeleteTransactions}
                createId={createId}
                totalBalance={totalBalance}
                totalIncome={totalIncome}
                totalExpense={totalExpense}
                getAccountBalance={getAccountBalance}
                processRecurringTransactions={processRecurringTransactions}
                handleUpdateAccount={handleUpdateAccount}
                handleAddAccount={handleAddAccount}
                handleDeleteAccount={handleDeleteAccount}
                handleDeleteUserAccount={handleDeleteUserAccount}
                handleLogout={handleLogout}
                setState={setState}
                setIsAddPersonModalOpen={modals.setIsAddPersonModalOpen}
                setIsEditModalOpen={modals.setIsEditModalOpen}
                setIsReceiptModalOpen={modals.setIsReceiptModalOpen}
                setIsSplitModalOpen={modals.setIsSplitModalOpen}
                setIsEventCreationModalOpen={modals.setIsEventCreationModalOpen}
                setIsReceiptScanModalOpen={modals.setIsReceiptScanModalOpen}
                setIsSplitExpenseModalOpen={modals.setIsSplitExpenseModalOpen}
                setIsUserProfileModalOpen={modals.setIsUserProfileModalOpen}
                handleAddCategory={handleAddCategory}
                handleUpdateCategory={handleUpdateCategory}
                handleDeleteCategory={handleDeleteCategory}
                handleAddRecurring={handleAddRecurring}
                handleUpdateRecurring={handleUpdateRecurring}
                handleDeleteRecurring={handleDeleteRecurring}
                handleToggleRecurring={handleToggleRecurring}
                handleSettleUp={handleSettleUp}
                addToast={addToast}
              />
            </Suspense>
          </ViewErrorBoundary>
        </div>
      </main>

      <AppModals
        modals={modals}
        state={state}
        selectedTransaction={selectedTransaction}
        selectedPerson={selectedPerson}
        personToEdit={personToEdit}
        splitTransactionContext={splitTransactionContext}
        activeEvent={activeEvent}
        linkToActiveEvent={linkToActiveEvent}
        setSelectedPerson={setSelectedPerson}
        setPersonToEdit={setPersonToEdit}
        setSplitTransactionContext={setSplitTransactionContext}
        handleSplitTransaction={handleSplitTransaction}
        deletePerson={deletePerson}
        handleSettleUp={handleSettleUp}
        handleUpdatePersonBalance={handleUpdatePersonBalance}
        addPerson={addPerson}
        updatePerson={updatePerson}
        createUserProfile={createUserProfile}
        updateUserProfile={updateUserProfile}
        updateTransaction={updateTransaction}
        deleteTransaction={deleteTransaction}
        handleCreateEvent={handleCreateEvent}
        addTransaction={addTransaction}
        handleUnifiedSplit={handleUnifiedSplit}
        addToast={addToast}
        t={t}
      />

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
};

// Wrap App with top-level ErrorBoundary
const AppWithErrorBoundary: React.FC = () => (
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

export default AppWithErrorBoundary;

