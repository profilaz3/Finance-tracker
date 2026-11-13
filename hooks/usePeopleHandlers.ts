import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { getSupabaseService, getSyncManager } from '../services/runtimeServices';
import { Account, AppState, Category, Currency, Person, Transaction } from '../types';
import {
  addAccountToCollection,
  buildPerson,
  buildSettlementDraft,
  buildUserProfile,
  removeAccountFromCollection,
  removePersonFromCollection,
  updatePersonBalanceInCollection,
  updatePersonInCollection,
} from '../domain/people';
import { LEGACY_USER_PROFILE_ID, normalizeUserProfileId } from '../utils/remotePeople';
import { calculateBalanceOffset, getEffectivePersonBalances } from '../domain/balances';
import { TRANSLATIONS } from '../constants';
import { getTranslations } from '../utils/i18n';
import { isInlineAvatar, uploadInlineAvatar } from '../utils/avatarUpload';

type ToastType = 'success' | 'error' | 'warning' | 'info';
type AddToast = (message: string, type: ToastType, action?: { label: string; onClick: () => void }) => void;

interface UsePeopleHandlersOptions {
  state: AppState;
  setState: Dispatch<SetStateAction<AppState>>;
  selectedPerson: Person | null;
  setSelectedPerson: Dispatch<SetStateAction<Person | null>>;
  closeUserProfileModal: () => void;
  addToast: AddToast;
  addTransaction: (transaction: Transaction, options?: { silent?: boolean }) => Promise<void>;
  createId: () => string;
}

export function usePeopleHandlers({
  state,
  setState,
  selectedPerson,
  setSelectedPerson,
  closeUserProfileModal,
  addToast,
  addTransaction,
  createId,
}: UsePeopleHandlersOptions) {
  /**
   * Upload a freshly picked inline avatar to Storage and swap the data URL for the public
   * URL in state, unless the avatar was changed again meanwhile. Returns the URL, or null
   * when the inline image is kept (offline / upload failed).
   */
  const promoteInlineAvatar = useCallback(async (
    ownerId: string,
    avatar: string | undefined,
    target: 'person' | 'profile',
  ): Promise<string | null> => {
    if (!isInlineAvatar(avatar)) {
      return null;
    }
    const url = await uploadInlineAvatar(avatar, ownerId, getSupabaseService);
    if (!url) {
      return null;
    }
    const swap = <T extends Person>(entry: T): T =>
      entry.id === ownerId && entry.avatar === avatar ? { ...entry, avatar: url } : entry;
    setState(prev => target === 'profile'
      ? { ...prev, userProfile: prev.userProfile ? swap(prev.userProfile) : prev.userProfile }
      : { ...prev, people: prev.people.map(swap) });
    if (target === 'person') {
      setSelectedPerson(prev => prev ? swap(prev) : prev);
    }
    return url;
  }, [setSelectedPerson, setState]);

  const addPerson = useCallback(async (name: string, defaultCurrency: Currency, color: string, avatar?: string) => {
    const newPerson = buildPerson({ createId, name, defaultCurrency, color, avatar });
    setState(prev => ({ ...prev, people: [...prev.people, newPerson] }));

    try {
      const avatarUrl = await promoteInlineAvatar(newPerson.id, newPerson.avatar, 'person');
      const syncManager = await getSyncManager();
      await syncManager.syncPerson(avatarUrl ? { ...newPerson, avatar: avatarUrl } : newPerson);
    } catch (error) {
      console.error('Failed to sync person:', error);
      addToast(getTranslations().personSavedSyncFailed, 'error');
    }
  }, [addToast, createId, promoteInlineAvatar, setState]);

  const updatePerson = useCallback(async (id: string, rawUpdates: Partial<Person>) => {
    // Balances are derived (domain/balances.ts); profile edits must not overwrite
    // the stored offsets with displayed (effective) balances.
    const { balances: _ignoredBalances, ...updates } = rawUpdates;
    const updatedPeople = updatePersonInCollection(state.people, id, updates);
    const updatedPerson = updatedPeople.find(person => person.id === id);

    setState(prev => ({
      ...prev,
      people: updatePersonInCollection(prev.people, id, updates),
    }));

    if (selectedPerson?.id === id) {
      setSelectedPerson(prev => prev ? { ...prev, ...updates } : null);
    }

    if (!updatedPerson) {
      return;
    }

    try {
      const avatarUrl = await promoteInlineAvatar(id, updates.avatar, 'person');
      const syncManager = await getSyncManager();
      await syncManager.syncPerson(avatarUrl ? { ...updatedPerson, avatar: avatarUrl } : updatedPerson);
    } catch (error) {
      console.error('Failed to sync person update:', error);
      addToast(getTranslations().personUpdatedSyncFailed, 'error');
    }
  }, [addToast, promoteInlineAvatar, selectedPerson?.id, setSelectedPerson, setState, state.people]);

  const createUserProfile = useCallback(async (name: string, defaultCurrency: Currency, color: string, avatar?: string) => {
    const supabaseService = await getSupabaseService();
    const user = await supabaseService.getUser();
    const profileId = normalizeUserProfileId(undefined, user?.id) ?? LEGACY_USER_PROFILE_ID;
    const newProfile = buildUserProfile({ profileId, name, defaultCurrency, color, avatar });

    setState(prev => ({ ...prev, userProfile: newProfile }));
    addToast(TRANSLATIONS[state.language].profileCreated, 'success');
    closeUserProfileModal();
    // Settings sync (useSync) picks up the swapped Storage URL.
    await promoteInlineAvatar(newProfile.id, newProfile.avatar, 'profile');
  }, [addToast, closeUserProfileModal, promoteInlineAvatar, setState, state.language]);

  const updateUserProfile = useCallback(async (_id: string, updates: Partial<Person>) => {
    if (!state.userProfile) {
      return;
    }

    const updatedProfile = { ...state.userProfile, ...updates };
    setState(prev => ({ ...prev, userProfile: updatedProfile }));
    addToast(TRANSLATIONS[state.language].profileUpdated, 'success');
    closeUserProfileModal();
    await promoteInlineAvatar(updatedProfile.id, updates.avatar, 'profile');
  }, [addToast, closeUserProfileModal, promoteInlineAvatar, setState, state.language, state.userProfile]);

  const handleUpdatePersonBalance = useCallback(async (personId: string, currency: Currency, newBalance: number) => {
    const person = state.people.find(entry => entry.id === personId);
    if (!person) {
      return;
    }

    // `newBalance` is the balance the user wants to see. Only the manual offset is
    // stored; transaction effects keep being derived on top of it.
    const offset = calculateBalanceOffset(person, state.transactions, currency, newBalance);
    const { updatedPerson } = updatePersonBalanceInCollection(state.people, personId, currency, offset);
    if (!updatedPerson) {
      return;
    }

    setState(prev => ({
      ...prev,
      people: updatePersonBalanceInCollection(prev.people, personId, currency, offset).people,
    }));

    try {
      const syncManager = await getSyncManager();
      await syncManager.syncPerson(updatedPerson);
      addToast(getTranslations().balanceUpdatedFor.replace('{name}', person.name), 'success');
    } catch (error) {
      console.error('Failed to sync person balance:', error);
      addToast(getTranslations().balanceUpdatedSyncFailed, 'error');
    }
  }, [addToast, setState, state.people, state.transactions]);

  const deletePerson = useCallback(async (id: string) => {
    setState(prev => ({ ...prev, people: removePersonFromCollection(prev.people, id) }));
    if (selectedPerson?.id === id) {
      setSelectedPerson(null);
    }

    try {
      const syncManager = await getSyncManager();
      await syncManager.deletePerson(id);
    } catch (error) {
      console.error('Failed to delete person from Supabase:', error);
      addToast(getTranslations().personDeletedSyncFailed, 'error');
    }
  }, [addToast, selectedPerson?.id, setSelectedPerson, setState]);

  const handleAddAccount = useCallback(async (account: Account) => {
    setState(prev => ({ ...prev, accounts: addAccountToCollection(prev.accounts, account) }));

    try {
      const syncManager = await getSyncManager();
      await syncManager.syncAccount(account);
      addToast(getTranslations().walletAccountCreated, 'success');
    } catch (error) {
      console.error('Failed to sync new account:', error);
      addToast(getTranslations().walletAccountCreatedSyncFailed, 'error');
    }
  }, [addToast, setState]);

  const handleDeleteAccount = useCallback(async (id: string) => {
    if (state.accounts.length <= 1) {
      addToast(TRANSLATIONS[state.language].atLeastOneAccount, 'error');
      return;
    }

    // The wallet row asks for confirmation (ConfirmDialog) before calling this.
    setState(prev => ({ ...prev, accounts: removeAccountFromCollection(prev.accounts, id) }));

    try {
      const syncManager = await getSyncManager();
      await syncManager.deleteAccount(id);
      addToast(getTranslations().walletAccountDeleted, 'info');
    } catch (error) {
      console.error('Failed to sync account deletion:', error);
      addToast(getTranslations().walletAccountDeletedSyncFailed, 'error');
    }
  }, [addToast, setState, state.accounts.length, state.language]);

  const handleSettleUp = useCallback(async (personId: string, currency: Currency, settleAmount?: number) => {
    const person = state.people.find(entry => entry.id === personId);
    const defaultAccountId = state.accounts[0]?.id;
    if (!person || !defaultAccountId) {
      return;
    }

    const settlement = buildSettlementDraft({
      createId,
      person: { ...person, balances: getEffectivePersonBalances(person, state.transactions) },
      currency,
      categories: state.categories,
      defaultAccountId,
      settleAmount,
    });

    if (!settlement) {
      return;
    }

    const { createdCategory } = settlement;
    if (createdCategory) {
      setState(prev => (
        prev.categories.some(category => category.id === createdCategory.id)
          ? prev
          : { ...prev, categories: [...prev.categories, createdCategory] }
      ));
      try {
        const syncManager = await getSyncManager();
        await syncManager.syncCategory(createdCategory);
      } catch (error) {
        console.error('Failed to sync repayment category:', error);
      }
    }

    // The settlement transaction itself moves the derived balance; nothing else to write.
    await addTransaction(settlement.transaction, { silent: true });

    // Undo removes exactly the recorded settlement (the balance is derived, so it comes back).
    const t = getTranslations();
    const settlementId = settlement.transaction.id;
    addToast(settlement.isPartial ? t.partialSettlementRecorded : t.debtSettled, 'success', {
      label: t.undo,
      onClick: () => {
        setState(prev => ({ ...prev, transactions: prev.transactions.filter(entry => entry.id !== settlementId) }));
        addToast(t.settlementRemoved, 'info');
        void getSyncManager()
          .then(syncManager => syncManager.deleteTransaction(settlementId))
          .catch(error => console.error('Failed to undo settlement:', error));
      },
    });
  }, [addToast, addTransaction, createId, setState, state.accounts, state.categories, state.people, state.transactions]);

  const handleAddCategory = useCallback(async (category: Category) => {
    setState(prev => ({ ...prev, categories: [...prev.categories, category] }));
    try {
      const syncManager = await getSyncManager();
      await syncManager.syncCategory(category);
    } catch (error) {
      console.error(error);
    }
  }, [setState]);

  const handleUpdateCategory = useCallback(async (category: Category) => {
    setState(prev => ({ ...prev, categories: prev.categories.map(existing => existing.id === category.id ? category : existing) }));
    try {
      const syncManager = await getSyncManager();
      await syncManager.syncCategory(category);
    } catch (error) {
      console.error(error);
    }
  }, [setState]);

  // Single-item delete: no confirm, an Undo toast puts the category back where it was.
  const handleDeleteCategory = useCallback(async (id: string) => {
    const index = state.categories.findIndex(category => category.id === id);
    const deleted = index === -1 ? undefined : state.categories[index];

    setState(prev => ({ ...prev, categories: prev.categories.filter(category => category.id !== id) }));
    try {
      const syncManager = await getSyncManager();
      await syncManager.deleteCategory(id);
    } catch (error) {
      console.error(error);
    }

    if (!deleted) return;
    const t = TRANSLATIONS[state.language];
    addToast(t.categoryDeleted, 'info', {
      label: t.undo,
      onClick: () => {
        setState(prev => {
          if (prev.categories.some(category => category.id === deleted.id)) return prev;
          const categories = [...prev.categories];
          categories.splice(Math.min(index, categories.length), 0, deleted);
          return { ...prev, categories };
        });
        void getSyncManager()
          .then(syncManager => syncManager.syncCategory(deleted))
          .catch(error => console.error('Failed to sync restored category:', error));
      },
    });
  }, [addToast, setState, state.categories, state.language]);

  return {
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
  };
}

