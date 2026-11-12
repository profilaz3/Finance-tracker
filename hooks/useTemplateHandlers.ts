import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { AppState, Transaction } from '../types';

type ToastType = 'success' | 'error' | 'warning' | 'info';
type AddToast = (message: string, type: ToastType, action?: { label: string; onClick: () => void }) => void;

interface UseTemplateHandlersOptions {
  state: AppState;
  setState: Dispatch<SetStateAction<AppState>>;
  setSelectedTransaction: Dispatch<SetStateAction<Transaction | null>>;
  setIsEditModalOpen: (isOpen: boolean) => void;
  addToast: AddToast;
}

export function useTemplateHandlers({
  state,
  setState,
  setSelectedTransaction,
  setIsEditModalOpen,
  addToast,
}: UseTemplateHandlersOptions) {
  const handleSaveAsTemplate = useCallback((transaction: Transaction) => {
    const category = state.categories.find(c => c.id === transaction.categoryId);
    const templateName = transaction.note || category?.name || 'Template';

    const newTemplate = {
      id: uuidv4(),
      name: templateName,
      amount: transaction.amount,
      currency: transaction.currency,
      categoryId: transaction.categoryId,
      accountId: transaction.accountId,
      type: transaction.type,
      note: transaction.note,
      subcategory: transaction.subcategory,
      usageCount: 0,
      lastUsed: undefined,
    };

    setState(prev => ({
      ...prev,
      templates: [...prev.templates, newTemplate],
    }));
    addToast(state.language === 'sr' ? 'Sablon sacuvan' : 'Template saved', 'success');
  }, [addToast, setState, state.categories, state.language]);

  const handleUseTemplate = useCallback((templateId: string) => {
    const template = state.templates.find(t => t.id === templateId);
    if (!template) return;

    setState(prev => ({
      ...prev,
      templates: prev.templates.map(t =>
        t.id === templateId
          ? { ...t, usageCount: t.usageCount + 1, lastUsed: new Date().toISOString() }
          : t
      ),
    }));

    const newTransaction: Transaction = {
      id: uuidv4(),
      date: new Date().toISOString(),
      amount: template.amount || 0,
      currency: template.currency,
      categoryId: template.categoryId,
      accountId: template.accountId,
      type: template.type,
      note: template.note,
      subcategory: template.subcategory,
    };

    setSelectedTransaction(newTransaction);
    setIsEditModalOpen(true);
  }, [setIsEditModalOpen, setSelectedTransaction, setState, state.templates]);

  const handleDeleteTemplate = useCallback((templateId: string) => {
    setState(prev => ({
      ...prev,
      templates: prev.templates.filter(t => t.id !== templateId),
    }));
    addToast(state.language === 'sr' ? 'Sablon obrisan' : 'Template deleted', 'success');
  }, [addToast, setState, state.language]);

  return {
    handleSaveAsTemplate,
    handleUseTemplate,
    handleDeleteTemplate,
  };
}
