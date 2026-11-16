import React, { useEffect, useLayoutEffect, useState, useCallback, useRef, useMemo, Suspense } from 'react';
import { Transaction, Category, Person, View, TransactionType, Event, Account, RecurringTransaction } from './types';

import { getSupabaseService } from './services/runtimeServices';
import { subscribeStorageErrors } from './services/storageHealth';
import { subscribeAiErrors } from './services/aiErrors';
import { CONFIG } from './config';
import { TRANSLATIONS } from './constants';
import { getIntlLocale, setAppLanguage } from './utils/locale';
import { ToastContainer } from './components/Toast';
import { useToasts } from './hooks/useToasts';
import { vibrate, HAPTIC_PATTERNS } from './utils/haptics';
import { playPageEnter, resetPageMotion, useSwipePager, type SwipeDirection } from './hooks/useSwipePager';
import { LazyMotion, MotionConfig, domAnimation } from 'motion/react';
import { createTransactionDraft, draftFromParsed } from './domain/transactions';
import { installPreloadErrorReload, lazyWithReload } from './utils/lazyWithReload';

installPreloadErrorReload();

// Reminders, alerts and the monthly letter: loaded after first paint, see BackgroundJobs.
const BackgroundJobs = lazyWithReload(() => import('./components/app/BackgroundJobs'));
// Single-key shortcuts (N, A, /, 1 to 6, E, ?) and their help list: lazy, they wait for a keyboard.
const DesktopShortcuts = lazyWithReload(() => import('./components/app/DesktopShortcuts'));
// Drag a receipt photo onto the window to scan it (lazy, like the shortcuts).
const ReceiptDropZone = lazyWithReload(() => import('./components/app/ReceiptDropZone'));
const AuthView = lazyWithReload(() => import('./components/AuthView').then(m => ({ default: m.AuthView })));
const SetNewPasswordView = lazyWithReload(() => import('./components/AuthView').then(m => ({ default: m.SetNewPasswordView })));
import type { ParsedTransaction } from './services/aiService';
import { DashboardSkeleton, TransactionsListSkeleton, CalendarSkeleton, GenericViewSkeleton } from './components/Skeleton';
import { ErrorBoundary, ViewErrorBoundary } from './components/ErrorBoundary';
import { AppModals } from './components/app/AppModals';
import { AppNavigation } from './components/app/AppNavigation';
import { AppSheets } from './components/app/AppSheets';
import { LiquidGlassDefs } from './components/ui/LiquidGlassDefs';
import { AppViewRouter } from './components/app/AppViewRouter';
import { preloadViews, type PeekControl } from './components/app/AppViewRouter';

// Extracted hooks
import { useAuth } from './hooks/useAuth';
import { useAddMenuRequests } from './hooks/entryBus';
import { useReceiptPhotoCleanup } from './hooks/useReceiptPhotoCleanup';
import { useTransactionDetailsRequests } from './components/transaction-details/detailsBus';
import { usePasswordRecovery } from './hooks/usePasswordRecovery';
import { useAppState } from './hooks/useAppState';
import { useModals } from './hooks/useModals';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useBackNavigation, type BackLayer } from './hooks/useBackNavigation';
import { BackLayerContext, useBackLayerRegistry } from './hooks/useBackLayer';
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
import { useWorkspace } from './hooks/useWorkspace';
import { useWidgetSync } from './hooks/useWidgetSync';
import { useNativeIntents } from './hooks/useNativeIntents';
import { resolveWorkspaceId, scopeStateToWorkspace, withWorkspaceTeam } from './domain/teams';

const createId = () => crypto.randomUUID();

/** Swipe order of the tab pages: Home, Activity (list, calendar), Events (events, people), Insights. */
const PAGE_ORDER: View[] = ['dashboard', 'transactions', 'calendar', 'events', 'people', 'analytics', 'insights'];

const App: React.FC = () => {
  // --- Extracted Hooks ---
  const { isAuthenticated, isLoadingAuth, handleLogin, handleLogout, handleDeleteAccount: handleDeleteUserAccount } = useAuth();
  const { state, setState, fetchRemoteState, areSlicesHydrated, hydrationStatus } = useAppState(isAuthenticated);
  const authFlow = usePasswordRecovery();
  // Teams: the app shows one workspace at a time (personal, or a team).
  const { storedWorkspaceId, setWorkspaceId } = useWorkspace();
  const workspaceId = resolveWorkspaceId(storedWorkspaceId, state.teams);
  const scopedState = useMemo(() => scopeStateToWorkspace(state, workspaceId), [state, workspaceId]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const modals = useModals();

  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [homeEditing, setHomeEditing] = useState(false);

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
  const activeEvent = scopedState.events.find(e => e.status === 'active');

  // Split context
  const [splitTransactionContext, setSplitTransactionContext] = useState<Transaction | undefined>(undefined);

  // Toast system (stable addToast, uuid ids)
  const { toasts, addToast, dismissToast } = useToasts();

  // Scroll restoration
  const scrollRestore = useScrollRestore();
  const mainRef = useRef<HTMLElement>(null);

  // Swipe paging: the wrapper around the routed page, and the direction of the pending slide.
  const pagerRef = useRef<HTMLDivElement>(null);
  const pageDirectionRef = useRef<SwipeDirection | 0>(0);
  // The way the user last moved through the pages: that neighbour is parked first.
  const travelDirectionRef = useRef<SwipeDirection>(1);
  const peekControlRef = useRef<PeekControl | null>(null);
  // Set when a swipe slid the live neighbour fully in: where its content sat on screen.
  const liveCommitRef = useRef<{ contentTop: number | null } | null>(null);

  // Keep the locale layer in sync before children render (formatters read it).
  setAppLanguage(state.language);
  const t = TRANSLATIONS[state.language];

  useEffect(() => {
    document.documentElement.lang = getIntlLocale(state.language);
  }, [state.language]);
  const defaultAccountId = scopedState.accounts[0]?.id || '';

  // --- Use extracted hooks ---
  useExchangeRates(isAuthenticated, setState);

  // Once signed in and idle, fetch the other pages so swiping never shows a loading skeleton.
  useEffect(() => {
    if (!isAuthenticated) return;
    const hasIdle = 'requestIdleCallback' in window;
    const handle = hasIdle
      ? window.requestIdleCallback(() => void preloadViews(), { timeout: 2500 })
      : window.setTimeout(() => void preloadViews(), 1200);
    return () => {
      if (hasIdle) window.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
    };
  }, [isAuthenticated]);
  useSync(state, isAuthenticated, areSlicesHydrated('settings'));

  // Fetch remote state on auth. Syncing never navigates: a shared active event shows up in the
  // Events list (and the Home event block), it does not pull the person away from what they opened.
  useEffect(() => {
    if (isAuthenticated) void fetchRemoteState();
  }, [isAuthenticated, fetchRemoteState]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setActiveMenuId(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Local storage full: tell the user instead of silently losing data.
  const storageWarningLanguageRef = useRef(state.language);
  storageWarningLanguageRef.current = state.language;
  useEffect(() => {
    let lastShownAt = 0;
    return subscribeStorageErrors(() => {
      const now = Date.now();
      if (now - lastShownAt < CONFIG.STORAGE_WARNING_THROTTLE_MS) return;
      lastShownAt = now;
      const message = TRANSLATIONS[storageWarningLanguageRef.current].storageFull;
      addToast(message, 'error', undefined, { id: 'toast-storage-full', duration: 6000 });
    });
  }, [addToast]);

  // AI limits and outages: say why the AI feature returned nothing.
  useEffect(() => subscribeAiErrors(({ kind }) => {
    if (kind !== 'quota' && kind !== 'unavailable') return;
    const strings = TRANSLATIONS[storageWarningLanguageRef.current];
    const message = kind === 'quota' ? strings.aiDailyLimitReached : strings.aiServiceUnavailable;
    addToast(message, 'warning', undefined, { id: `toast-ai-${kind}`, duration: 6000 });
  }), [addToast]);

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
    viewState,
  } = useFinancialSelectors(scopedState);

  // New items land in the active workspace.
  const createEventInWorkspace = useCallback(
    (event: Event) => handleCreateEvent(withWorkspaceTeam(event, workspaceId)),
    [handleCreateEvent, workspaceId]
  );
  const addRecurringInWorkspace = useCallback(
    (recurring: RecurringTransaction) => handleAddRecurring(withWorkspaceTeam(recurring, workspaceId)),
    [handleAddRecurring, workspaceId]
  );
  const addAccountInWorkspace = useCallback(
    (account: Account) => handleAddAccount(withWorkspaceTeam(account, workspaceId)),
    [handleAddAccount, workspaceId]
  );
  const addCategoryInWorkspace = useCallback(
    (category: Category) => handleAddCategory(withWorkspaceTeam(category, workspaceId)),
    [handleAddCategory, workspaceId]
  );

  // Smart (typed or voice) entry opens the form with what was understood, in this workspace.
  const handleParsedTransaction = (parsed: ParsedTransaction) => {
    const newTransaction = draftFromParsed(parsed, {
      createId,
      accounts: scopedState.accounts,
      categories: scopedState.categories,
      people: scopedState.people,
      baseCurrency: state.baseCurrency,
      rates: state.rates,
      eventId: linkToActiveEvent && activeEvent ? activeEvent.id : undefined,
    });

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

  useEffect(() => {
    if (!isAuthenticated) {
      setCurrentUserId(null);
      return;
    }
    let cancelled = false;
    void getSupabaseService()
      .then(service => service.getUser())
      .then(user => {
        if (!cancelled) setCurrentUserId(user?.id ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  useRecurringProcessor({
    currentUserId,
    isAuthenticated,
    isHydrated: areSlicesHydrated('transactions', 'recurringTransactions'),
    recurringTransactions: state.recurringTransactions,
    processRecurringTransactions,
  });

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
    budgets: <GenericViewSkeleton />,
  };

  // --- Theme ---
  const themeClass = "flex h-screen font-sans overflow-hidden bg-paper text-on-surface transition-colors duration-500 select-none";

  // --- View Change Handler ---
  const handleViewChange = useCallback((view: View, swipeDirection?: SwipeDirection, live = false) => {
    if (mainRef.current) {
      scrollRestore.save(currentView, mainRef.current.scrollTop);
    }
    // A live swipe's neighbour is becoming the page in place, so it must stay visible.
    if (!live) peekControlRef.current?.show(null);
    // Sibling pages slide sideways in page order; other jumps (settings, budgets) fade up.
    const from = PAGE_ORDER.indexOf(currentView);
    const to = PAGE_ORDER.indexOf(view);
    const direction: SwipeDirection | 0 = swipeDirection ?? (from >= 0 && to >= 0 && from !== to ? (to > from ? 1 : -1) : 0);
    if (direction) travelDirectionRef.current = direction;
    // A live swipe already slid the new page into place, so it needs no enter animation.
    pageDirectionRef.current = view === currentView || live ? 0 : direction;
    // Re-selecting the current view keeps its attributes, so its page does not replay the fade-up.
    if (pagerRef.current && view !== currentView) {
      if (direction) pagerRef.current.setAttribute('data-pager-lateral', '');
      else pagerRef.current.removeAttribute('data-pager-lateral');
    }
    setCurrentView(view);
    if (live) return; // the scroll position is carried over in the layout effect below
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

  // Same element at the same place in every signed-in or signed-out render (see withBackgroundJobs),
  // so it survives signing in and out and its effects see the change.
  const backgroundJobs = (
    <Suspense fallback={null}>
      <BackgroundJobs
        notifications={{
          state,
          isAuthenticated: !!isAuthenticated,
          currentUserId,
          hydrationStatus,
          fetchRemoteState,
          addToast,
          onNavigate: handleViewChange,
          onOpenEvent: (event: Event) => {
            setSelectedEvent(event);
            handleViewChange('events');
          },
        }}
        letter={{
          state: scopedState,
          workspaceId,
          currentUserId,
          isAuthenticated: !!isAuthenticated,
          hydrated: hydrationStatus === 'hydrated' || hydrationStatus === 'partial',
          addToast,
          onNavigate: handleViewChange,
        }}
      />
    </Suspense>
  );
  const withBackgroundJobs = (content: React.ReactNode) => (
    <>
      {content}
      {backgroundJobs}
    </>
  );

  const currentPage = () => pagerRef.current?.querySelector<HTMLElement>(':scope > [data-pager-page]');
  // A page with a visible in-page back button (a settings section) swipes back through it.
  const inPageBack = () => {
    const button = currentPage()?.querySelector<HTMLElement>('[data-swipe-back]');
    return button && button.offsetParent !== null ? button : null;
  };

  useLayoutEffect(() => {
    const live = liveCommitRef.current;
    liveCommitRef.current = null;
    if (live) {
      // The neighbour became the page in place: drop its drag styles, skip the enter fades, and
      // keep its content exactly where it was on screen.
      const page = currentPage();
      resetPageMotion(page);
      pagerRef.current?.querySelectorAll<HTMLElement>(':scope > .app-view-enter').forEach(el => {
        el.getAnimations?.().forEach(animation => animation.finish());
      });
      const content = page?.querySelector<HTMLElement>(':scope > [data-pager-content]');
      if (content && mainRef.current && live.contentTop !== null) {
        mainRef.current.scrollTop += content.getBoundingClientRect().top - live.contentTop;
      }
      return;
    }
    const direction = pageDirectionRef.current;
    pageDirectionRef.current = 0;
    if (direction) playPageEnter(currentPage(), direction);
  }, [currentView]);

  // Swipe between sibling pages; from Settings, Budgets or an open event, swipe right goes back.
  const pageIndex = PAGE_ORDER.indexOf(currentView);
  const eventDetailOpen = currentView === 'events' && !!selectedEvent;
  const neighbourView = (dir: SwipeDirection): View | null => {
    if (eventDetailOpen || inPageBack()) return null;
    if (pageIndex < 0) return dir === -1 ? 'dashboard' : null;
    return PAGE_ORDER[pageIndex + dir] ?? null;
  };

  // Once a page has settled and the app is idle, mount its swipe neighbours hidden so the first
  // frame of a swipe only reveals them. Phones only (desktop has no swipe), and not with reduced
  // motion (no live neighbour there).
  useEffect(() => {
    if (!isAuthenticated || homeEditing) return;
    if (window.matchMedia?.('(min-width: 768px), (prefers-reduced-motion: reduce)').matches) return;
    let idle = 0;
    const timer = window.setTimeout(() => {
      const run = () => {
        const ahead = travelDirectionRef.current;
        const views = ([ahead, -ahead as SwipeDirection])
          .map(neighbourView)
          .filter((view): view is View => !!view && view !== currentView);
        peekControlRef.current?.park(views.map(view => ({ view })));
      };
      idle = 'requestIdleCallback' in window ? window.requestIdleCallback(run, { timeout: 1500 }) : (window as Window).setTimeout(run, 0);
    }, 450);
    return () => {
      window.clearTimeout(timer);
      if (idle && 'cancelIdleCallback' in window) window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
    };
    // neighbourView reads only currentView, selectedEvent and the DOM.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentView, selectedEvent, isAuthenticated, homeEditing]);
  const swipeHandlers = useSwipePager({
    getTarget: () => {
      const back = inPageBack();
      return back?.closest<HTMLElement>('[data-swipe-back-page]') ?? currentPage();
    },
    getRoot: () => mainRef.current,
    enabled: !homeEditing,
    canGo: dir => {
      if (eventDetailOpen || inPageBack()) return dir === -1;
      if (pageIndex < 0) return dir === -1;
      const next = pageIndex + dir;
      return next >= 0 && next < PAGE_ORDER.length;
    },
    onPeek: dir => {
      const control = peekControlRef.current;
      const view = dir ? neighbourView(dir) : null;
      const main = mainRef.current;
      const page = currentPage();
      if (!dir || !control || !view || !main || !page) {
        control?.show(null);
        return false;
      }
      // Place the neighbour where it will sit once current, at its own remembered scroll
      // position. A parked neighbour is revealed at once; otherwise it mounts in a transition.
      const top = main.scrollTop - scrollRestore.get(view);
      control.show({ view, dir, top });
      return true;
    },
    getPeek: dir => pagerRef.current?.querySelector<HTMLElement>(`:scope > [data-pager-peek="${dir}"]`),
    onCommit: (dir, live) => {
      vibrate(HAPTIC_PATTERNS.light);
      const back = inPageBack();
      if (back) {
        back.click();
        return;
      }
      if (eventDetailOpen) {
        setSelectedEvent(null);
        requestAnimationFrame(() => playPageEnter(currentPage(), -1));
        return;
      }
      if (live) {
        const content = pagerRef.current?.querySelector<HTMLElement>(':scope > [data-pager-peek] > [data-pager-content]');
        liveCommitRef.current = { contentTop: content ? content.getBoundingClientRect().top : null };
      }
      handleViewChange(pageIndex < 0 ? 'dashboard' : PAGE_ORDER[pageIndex + dir], dir, live);
    },
  });

  // --- Back navigation (browser history + Android back button) ---
  // Order matters only as a tie-break when several overlays open in the same render;
  // otherwise the most recently opened overlay is closed first.
  const backLayers = useMemo<BackLayer[]>(() => [
    { id: 'event-detail', isOpen: currentView === 'events' && !!selectedEvent, close: () => setSelectedEvent(null) },
    { id: 'person-detail', isOpen: !!selectedPerson, close: () => setSelectedPerson(null) },
    { id: 'user-profile', isOpen: modals.isUserProfileModalOpen, close: () => modals.setIsUserProfileModalOpen(false) },
    {
      id: 'add-person',
      isOpen: modals.isAddPersonModalOpen,
      close: () => {
        modals.setIsAddPersonModalOpen(false);
        setPersonToEdit(null);
      },
    },
    { id: 'event-creation', isOpen: modals.isEventCreationModalOpen, close: () => modals.setIsEventCreationModalOpen(false) },
    { id: 'receipt-scan', isOpen: modals.isReceiptScanModalOpen, close: () => modals.setIsReceiptScanModalOpen(false) },
    { id: 'edit-transaction', isOpen: modals.isEditModalOpen, close: () => modals.setIsEditModalOpen(false) },
    { id: 'transaction-details', isOpen: modals.detailsId !== null, close: modals.closeDetails },
    { id: 'split', isOpen: modals.isSplitModalOpen, close: () => modals.setIsSplitModalOpen(false) },
    {
      id: 'split-expense',
      isOpen: modals.isSplitExpenseModalOpen,
      close: () => {
        modals.setIsSplitExpenseModalOpen(false);
        setSplitTransactionContext(undefined);
      },
    },
    { id: 'add-menu', isOpen: modals.isAddMenuOpen, close: () => modals.setIsAddMenuOpen(false) },
    { id: 'profile-menu', isOpen: modals.isProfileMenuOpen, close: () => modals.setIsProfileMenuOpen(false) },
    { id: 'appearance-sheet', isOpen: modals.isAppearanceSheetOpen, close: () => modals.setIsAppearanceSheetOpen(false) },
    { id: 'export', isOpen: modals.isExportModalOpen, close: () => modals.setIsExportModalOpen(false) },
    { id: 'ask', isOpen: modals.isAskOpen, close: () => modals.setIsAskOpen(false) },
    { id: 'home-editing', isOpen: currentView === 'dashboard' && homeEditing, close: () => setHomeEditing(false) },
  ], [currentView, selectedEvent, selectedPerson, modals, homeEditing]);

  // Sheets and sub-pages that keep their open state locally register through BackLayerContext.
  const { registry: backLayerRegistry, layers: registeredBackLayers } = useBackLayerRegistry();
  const allBackLayers = useMemo(() => [...backLayers, ...registeredBackLayers], [backLayers, registeredBackLayers]);

  const { closeTopLayer } = useBackNavigation({
    currentView,
    setView: handleViewChange,
    layers: allBackLayers,
  });

  // Tapping the tab that is already active returns to that view's root and scrolls to the top.
  const handleReselectView = useCallback(() => {
    if (currentView === 'events' && selectedEvent) setSelectedEvent(null);
    if (selectedPerson) setSelectedPerson(null);
    scrollRestore.save(currentView, 0);
    const main = mainRef.current;
    if (!main) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    main.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  }, [currentView, selectedEvent, selectedPerson, scrollRestore]);

  const shortcutHandlers = useMemo(() => ({
    onNewTransaction: () => handleOpenAddTransaction(),
    // Escape closes only the top-most overlay (and consumes its history entry).
    onEscape: () => closeTopLayer(),
  }), [handleOpenAddTransaction, closeTopLayer]);

  useKeyboardShortcuts(shortcutHandlers);
  // The desktop Activity "+" asks for the Add sheet through hooks/entryBus.ts.
  useAddMenuRequests(modals.openAddMenu);
  useTransactionDetailsRequests(modals.openDetails);
  useReceiptPhotoCleanup(state.transactions, currentUserId);

  // Android: the home screen widget mirrors this month, and its "+" and the share sheet open the app.
  const [sharedReceiptImage, setSharedReceiptImage] = useState<string | null>(null);
  // A receipt file dragged onto the window (ReceiptDropZone).
  const [droppedReceipt, setDroppedReceipt] = useState<File | null>(null);
  useWidgetSync(viewState, isAuthenticated);
  useNativeIntents({
    enabled: isAuthenticated === true,
    onAction: action => {
      if (action === 'add-expense') handleOpenAddTransaction('expense');
    },
    onSharedImage: dataUrl => {
      setSharedReceiptImage(dataUrl);
      modals.setIsReceiptScanModalOpen(true);
    },
  });
  useEffect(() => {
    if (!modals.isReceiptScanModalOpen) {
      setSharedReceiptImage(null);
      setDroppedReceipt(null);
    }
  }, [modals.isReceiptScanModalOpen]);

  // --- Render ---
  if (isLoadingAuth) {
    return (
      <div className="min-h-screen bg-surface">
        <DashboardSkeleton />
      </div>
    );
  }

  if (!isAuthenticated) {
    return withBackgroundJobs(
      <Suspense fallback={<DashboardSkeleton />}>
        <AuthView
          onAuthSuccess={async () => {
            await handleLogin();
            await fetchRemoteState();
          }}
          language={state.language}
          onLanguageChange={(language) => setState(prev => ({ ...prev, language }))}
          onSignUp={authFlow.signUp}
          onRequestPasswordReset={authFlow.requestPasswordReset}
          onResendConfirmation={authFlow.resendConfirmation}
          redirectErrorCode={authFlow.redirectErrorCode}
          onDismissRedirectError={authFlow.clearRedirectError}
        />
      </Suspense>
    );
  }

  if (authFlow.isRecovering) {
    return withBackgroundJobs(
      <Suspense fallback={<DashboardSkeleton />}>
        <SetNewPasswordView
          language={state.language}
          onSubmit={async (password) => {
            await authFlow.updatePassword(password);
            addToast(t.authPasswordUpdated, 'success');
          }}
          onCancel={authFlow.finishRecovery}
        />
      </Suspense>
    );
  }

  return withBackgroundJobs(
    <BackLayerContext.Provider value={backLayerRegistry}>
    <div className={themeClass}>
      <AppNavigation
        currentView={currentView}
        onNavigate={handleNavigate}
        onReselect={handleReselectView}
        onAdd={modals.openAddMenu}
        labels={{
          mainNavigation: t.mainNavigation,
          home: t.navHome,
          activity: t.navActivity,
          events: t.navEvents,
          insights: t.navInsights,
          add: t.addEntry,
          budgets: t.budgets,
          settings: t.settings,
          shortcuts: t.keyboardShortcuts,
        }}
      />
      <LiquidGlassDefs />

      {/* Edge-to-edge (Android 15+): keep scrolled content from showing through the status bar. */}
      <div
        className="status-scrim fixed top-0 inset-x-0 z-40 h-[env(safe-area-inset-top)] bg-surface pointer-events-none md:hidden"
        aria-hidden="true"
      />

      <a href="#main-content" className="skip-link">
        {t.skipToMainContent}
      </a>

      <main
        ref={mainRef}
        id="main-content"
        className="flex-1 h-full overflow-y-auto overflow-x-hidden bg-paper relative touch-pan-y"
        {...swipeHandlers}
        role="main"
        aria-label={t.mainContent}
      >
        <div className="max-w-5xl mx-auto pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] pb-[calc(6rem+env(safe-area-inset-bottom))] pt-[max(0.5rem,env(safe-area-inset-top))] md:p-4 md:pb-8 lg:p-8">
          <div ref={pagerRef} className="relative">
          <ViewErrorBoundary>
            <Suspense fallback={viewSkeleton[currentView] || <DashboardSkeleton />}>
              <AppViewRouter
                currentView={currentView}
                peekControlRef={peekControlRef}
                pageFallback={viewSkeleton[currentView] || <DashboardSkeleton />}
                state={viewState}
                paneDetailsId={modals.detailsInPane ? modals.detailsId : null}
                selectedPerson={selectedPerson}
                homeEditing={homeEditing}
                setHomeEditing={setHomeEditing}
                onNavigate={handleNavigate}
                onOpenProfile={() => modals.setIsProfileMenuOpen(true)}
                onOpenAdd={() => modals.openAddMenu()}
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
                handleAddAccount={addAccountInWorkspace}
                handleDeleteAccount={handleDeleteAccount}
                handleDeleteUserAccount={handleDeleteUserAccount}
                handleLogout={handleLogout}
                setState={setState}
                setIsAddPersonModalOpen={modals.setIsAddPersonModalOpen}
                setIsEditModalOpen={modals.setIsEditModalOpen}
                setIsSplitModalOpen={modals.setIsSplitModalOpen}
                setIsEventCreationModalOpen={modals.setIsEventCreationModalOpen}
                setIsReceiptScanModalOpen={modals.setIsReceiptScanModalOpen}
                setIsSplitExpenseModalOpen={modals.setIsSplitExpenseModalOpen}
                setIsUserProfileModalOpen={modals.setIsUserProfileModalOpen}
                handleAddCategory={addCategoryInWorkspace}
                handleUpdateCategory={handleUpdateCategory}
                handleDeleteCategory={handleDeleteCategory}
                handleAddRecurring={addRecurringInWorkspace}
                handleUpdateRecurring={handleUpdateRecurring}
                handleDeleteRecurring={handleDeleteRecurring}
                handleToggleRecurring={handleToggleRecurring}
                handleSettleUp={handleSettleUp}
                addToast={addToast}
                workspaceId={workspaceId}
                onWorkspaceChange={setWorkspaceId}
              />
            </Suspense>
          </ViewErrorBoundary>
          </div>
        </div>
      </main>

      <Suspense fallback={null}>
        <DesktopShortcuts
          language={state.language}
          onNavigate={handleNavigate}
          onNewEntry={handleOpenAddTransaction}
          onAddMenu={() => modals.openAddMenu()}
        />
        <ReceiptDropZone
          language={state.language}
          onReceiptFile={file => {
            setSharedReceiptImage(null);
            setDroppedReceipt(file);
            modals.setIsReceiptScanModalOpen(true);
          }}
        />
      </Suspense>

      <AppModals
        modals={modals}
        state={viewState}
        selectedTransaction={selectedTransaction}
        selectedPerson={selectedPerson}
        onOpenEvent={(event: Event) => {
          setSelectedPerson(null);
          setSelectedEvent(event);
          handleViewChange('events');
        }}
        personToEdit={personToEdit}
        splitTransactionContext={splitTransactionContext}
        activeEvent={activeEvent}
        linkToActiveEvent={linkToActiveEvent}
        setSelectedPerson={setSelectedPerson}
        setPersonToEdit={setPersonToEdit}
        setSplitTransactionContext={setSplitTransactionContext}
        setSelectedTransaction={setSelectedTransaction}
        onSaveAsTemplate={handleSaveAsTemplate}
        createId={createId}
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
        handleCreateEvent={createEventInWorkspace}
        addTransaction={addTransaction}
        handleUnifiedSplit={handleUnifiedSplit}
        addToast={addToast}
        t={t}
        sharedReceiptImage={sharedReceiptImage}
        droppedReceipt={droppedReceipt}
        clearSharedReceiptImage={() => setSharedReceiptImage(null)}
        onSavePaymentDetails={details => setState(prev => ({ ...prev, paymentDetails: details }))}
      />

      <AppSheets
        modals={modals}
        state={viewState}
        setState={setState}
        onCustomizeHome={() => {
          handleViewChange('dashboard');
          setHomeEditing(true);
        }}
        onOpenBudgets={() => handleViewChange('budgets')}
        onOpenSettings={() => handleViewChange('settings')}
        onSignOut={() => {
          void handleLogout().then(setState);
        }}
        onParsed={handleParsedTransaction}
        onManual={type => handleOpenAddTransaction(type)}
        onScanReceipt={() => modals.setIsReceiptScanModalOpen(true)}
        onSplitBill={() => modals.setIsSplitExpenseModalOpen(true)}
        onUseTemplate={handleUseTemplate}
        workspaceId={workspaceId}
        onWorkspaceChange={setWorkspaceId}
      />

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
    </BackLayerContext.Provider>
  );
};

// Wrap App with top-level ErrorBoundary

// LazyMotion + `m` components keep drag/layout/projection code out of the shared
// motion chunk; only the Settings account reorder list pulls in the domMax features.
const AppWithErrorBoundary: React.FC = () => (
  <ErrorBoundary>
    <LazyMotion features={domAnimation}>
      <MotionConfig reducedMotion="user">
        <App />
      </MotionConfig>
    </LazyMotion>
  </ErrorBoundary>
);

export default AppWithErrorBoundary;

