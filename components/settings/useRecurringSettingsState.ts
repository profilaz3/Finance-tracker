import { useState } from 'react';
import type { Account, Category, Currency, RecurrenceFrequency, RecurringTransaction, TransactionType } from '../../types';

interface UseRecurringSettingsStateOptions {
  baseCurrency: Currency;
  categories: Category[];
  accounts: Account[];
  onAddRecurring?: (recurring: RecurringTransaction) => void;
}

const getTodayDate = () => new Date().toISOString().split('T')[0];

const getInitialRecurringState = () => ({
  isAddingRecurring: false,
  newRecurringName: '',
  newRecurringAmount: '',
  newRecurringFrequency: 'monthly' as RecurrenceFrequency,
  newRecurringType: 'expense' as TransactionType,
  newRecurringCategoryId: '',
  newRecurringAccountId: '',
  newRecurringStartDate: getTodayDate(),
});

export function useRecurringSettingsState({
  baseCurrency,
  categories,
  accounts,
  onAddRecurring,
}: UseRecurringSettingsStateOptions) {
  const initialState = getInitialRecurringState();
  const [isAddingRecurring, setIsAddingRecurring] = useState(initialState.isAddingRecurring);
  const [newRecurringName, setNewRecurringName] = useState(initialState.newRecurringName);
  const [newRecurringAmount, setNewRecurringAmount] = useState(initialState.newRecurringAmount);
  const [newRecurringFrequency, setNewRecurringFrequency] = useState<RecurrenceFrequency>(initialState.newRecurringFrequency);
  const [newRecurringType, setNewRecurringType] = useState<TransactionType>(initialState.newRecurringType);
  const [newRecurringCategoryId, setNewRecurringCategoryId] = useState(initialState.newRecurringCategoryId);
  const [newRecurringAccountId, setNewRecurringAccountId] = useState(initialState.newRecurringAccountId);
  const [newRecurringStartDate, setNewRecurringStartDate] = useState(initialState.newRecurringStartDate);

  const resetRecurringForm = () => {
    const nextInitialState = getInitialRecurringState();
    setIsAddingRecurring(nextInitialState.isAddingRecurring);
    setNewRecurringName(nextInitialState.newRecurringName);
    setNewRecurringAmount(nextInitialState.newRecurringAmount);
    setNewRecurringFrequency(nextInitialState.newRecurringFrequency);
    setNewRecurringType(nextInitialState.newRecurringType);
    setNewRecurringCategoryId(nextInitialState.newRecurringCategoryId);
    setNewRecurringAccountId(nextInitialState.newRecurringAccountId);
    setNewRecurringStartDate(nextInitialState.newRecurringStartDate);
  };

  const handleCreateRecurring = () => {
    if (!newRecurringName.trim() || !newRecurringAmount || !onAddRecurring) {
      return;
    }

    const categoryId = newRecurringCategoryId || categories.find(category => category.type === newRecurringType)?.id || categories[0]?.id || '';
    const accountId = newRecurringAccountId || accounts[0]?.id || '';
    const startDate = newRecurringStartDate || getTodayDate();

    onAddRecurring({
      id: crypto.randomUUID(),
      name: newRecurringName.trim(),
      amount: Number.parseFloat(newRecurringAmount),
      currency: baseCurrency,
      categoryId,
      accountId,
      type: newRecurringType,
      frequency: newRecurringFrequency,
      startDate,
      nextDue: startDate,
      isActive: true,
    });

    resetRecurringForm();
  };

  return {
    isAddingRecurring,
    setIsAddingRecurring,
    newRecurringName,
    setNewRecurringName,
    newRecurringAmount,
    setNewRecurringAmount,
    newRecurringFrequency,
    setNewRecurringFrequency,
    newRecurringType,
    setNewRecurringType,
    newRecurringCategoryId,
    setNewRecurringCategoryId,
    newRecurringAccountId,
    setNewRecurringAccountId,
    newRecurringStartDate,
    setNewRecurringStartDate,
    handleCreateRecurring,
    resetRecurringForm,
  };
}
