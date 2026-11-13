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
import { TRANSLATIONS } from '../constants';
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
  addTransaction: (transaction: Transaction) => Promise<void>;
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
      addToast('Person saved locally, but sync failed', 'error');
    }
  }, [addToast, createId, promoteInlineAvatar, setState]);

  const updatePerson = useCallback(async (id: string, updates: Partial<Person>) => {
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
      addToast('Person updated locally, but sync failed', 'error');
    }
  }, [addToast, promoteInlineAvatar, selectedPerson?.id, setSelectedPerson, setState, state.people]);

  const createUserProfile = useCallback(async (name: string, defaultCurrency: Currency, color: string, avatar?: string) => {
    const supabaseService = await getSupabaseService();
    const user = await supabaseService.getUser();
    const profileId = normalizeUserProfileId(undefined, user?.id) ?? LEGACY_USER_PROFILE_ID;
    const newProfile = buildUserProfile({ profileId, name, defaultCurrency, color, avatar });

    setState(prev => ({ ...prev, userProfile: newProfile }));
    addToast(state.language === 'sr' ? 'Profil napravljen' : 'Profile created', 'success');
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
    addToast(state.language === 'sr' ? 'Profil azuriran' : 'Profile updated', 'success');
    closeUserProfileModal();
    await promoteInlineAvatar(updatedProfile.id, updates.avatar, 'profile');
  }, [addToast, closeUserProfileModal, promoteInlineAvatar, setState, state.language, state.userProfile]);

  const handleUpdatePersonBalance = useCallback(async (personId: string, currency: Currency, newBalance: number) => {
    const person = state.people.find(entry => entry.id === personId);
    if (!person) {
      return;
    }

    const { people, updatedPerson } = updatePersonBalanceInCollection(state.people, personId, currency, newBalance);
    if (!updatedPerson) {
      return;
    }

    setState(prev => ({
      ...prev,
      people: updatePersonBalanceInCollection(prev.people, personId, currency, newBalance).people,
    }));

    if (selectedPerson?.id === personId) {
      setSelectedPerson(updatedPerson);
    }

    try {
      const syncManager = await getSyncManager();
      await syncManager.syncPerson(updatedPerson);
      addToast(`Balance updated for ${person.name}`, 'success');
    } catch (error) {
      console.error('Failed to sync person balance:', error);
      addToast('Balance updated locally, but sync failed', 'error');
    }
  }, [addToast, selectedPerson?.id, setSelectedPerson, setState, state.people]);

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
      addToast('Person deleted locally, but sync failed', 'error');
    }
  }, [addToast, selectedPerson?.id, setSelectedPerson, setState]);

  const handleAddAccount = useCallback(async (account: Account) => {
    setState(prev => ({ ...prev, accounts: addAccountToCollection(prev.accounts, account) }));

    try {
      const syncManager = await getSyncManager();
      await syncManager.syncAccount(account);
      addToast('Account created', 'success');
    } catch (error) {
      console.error('Failed to sync new account:', error);
      addToast('Account created locally, but sync failed', 'error');
    }
  }, [addToast, setState]);

  const handleDeleteAccount = useCallback(async (id: string) => {
    if (state.accounts.length <= 1) {
      addToast(state.language === 'sr' ? 'Morate imati bar jedan racun.' : 'You must have at least one account.', 'error');
      return;
    }

    // The wallet row asks for confirmation (ConfirmDialog) before calling this.
    setState(prev => ({ ...prev, accounts: removeAccountFromCollection(prev.accounts, id) }));

    try {
      const syncManager = await getSyncManager();
      await syncManager.deleteAccount(id);
      addToast('Account deleted', 'info');
    } catch (error) {
      console.error('Failed to sync account deletion:', error);
      addToast('Account deleted locally, but sync failed', 'error');
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
      person,
      currency,
      categories: state.categories,
      defaultAccountId,
      settleAmount,
    });

    if (!settlement) {
      return;
    }

    await addTransaction(settlement.transaction);
    setState(prev => ({
      ...prev,
      people: updatePersonInCollection(prev.people, personId, { balances: settlement.updatedPerson.balances }),
    }));

    try {
      const syncManager = await getSyncManager();
      await syncManager.syncPerson(settlement.updatedPerson);
    } catch (error) {
      console.error('Failed to sync person settlement:', error);
    }

    addToast(settlement.isPartial ? 'Partial settlement recorded' : 'Debt settled', 'success');
  }, [addToast, addTransaction, createId, setState, state.accounts, state.categories, state.people]);

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

