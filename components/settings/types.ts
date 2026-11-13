import { Variants } from 'motion/react';
import { AppState, Account, Person, TransactionType, Currency, Category, RecurringTransaction } from '../../types';

export interface SettingsViewProps {
    state: AppState;
    setState: React.Dispatch<React.SetStateAction<AppState>>;
    handleUpdateAccount: (id: string, updates: Partial<Account>) => void;
    handleAddAccount: (account: Account) => void;
    handleDeleteAccount: (id: string) => void;
    setIsAddPersonModalOpen: (isOpen: boolean) => void;
    setSelectedPerson: (person: Person | null) => void;
    handleOpenAddTransaction: (type?: TransactionType, personId?: string) => void;

    getAccountBalance: (account: Account) => number;
    onLogout?: () => void;
    onDeleteAccount?: () => void;
    onAddCategory: (category: Category) => void;
    onUpdateCategory: (category: Category) => void;
    onDeleteCategory: (id: string) => void;
    onCreateUserProfile: () => void;
    onEditUserProfile: () => void;
    // Recurring transactions
    onAddRecurring?: (recurring: RecurringTransaction) => void;
    onUpdateRecurring?: (id: string, updates: Partial<RecurringTransaction>) => void;
    onDeleteRecurring?: (id: string) => void;
    onToggleRecurring?: (id: string) => void;
    onProcessRecurring?: () => void;
    // Settle up
    onSettleUp?: (personId: string, currency: Currency) => void;
    // Toasts with an action (clean-up undo)
    onToast?: (message: string, type: 'success' | 'error' | 'info' | 'warning', action?: { label: string; onClick: () => void }) => void;
    // Teams: which workspace the app shows (null is personal)
    workspaceId?: string | null;
    onWorkspaceChange?: (teamId: string | null) => void;
}

export const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: {
            staggerChildren: 0.04,
            delayChildren: 0.05,
            when: "beforeChildren"
        }
    },
    exit: {
        opacity: 0,
        transition: { duration: 0.2 }
    }
};
