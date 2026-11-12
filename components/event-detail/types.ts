import { AppState, Event, Transaction, SharedExpense, Person, Currency } from '../../types';

export interface EventDetailViewProps {
    event: Event;
    state: AppState;
    onBack: () => void;
    onUpdateEvent: (id: string, updates: Partial<Event>) => void;
    onShareEvent: (id: string, email: string) => Promise<void>;
    onDeleteEvent: (id: string) => void;
    onAddSharedExpense: (expense: SharedExpense) => void;
    onUpdateSharedExpense: (expense: SharedExpense) => void;
    onDeleteSharedExpense: (id: string) => void;
    // Transactions are managed globally
    onEditTransaction: (transaction: Transaction) => void;
    onDeleteTransaction?: (id: string) => void;
    onShowToast?: (message: string, type: 'success' | 'error' | 'info') => void;
}

export type UnifiedExpense =
    | { type: 'transaction'; data: Transaction; date: Date }
    | { type: 'sharedExpense'; data: SharedExpense; date: Date };

export type ActiveTab = 'shared' | 'summary';
