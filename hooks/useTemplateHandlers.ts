import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { AppState, Transaction } from '../types';
import { TRANSLATIONS } from '../constants';
import { useTemplateDeleteRequests } from './entryBus';
import { draftFromTemplate } from '../domain/transactions';

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
    addToast(TRANSLATIONS[state.language].templateSaved, 'success');
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

    const newTransaction = draftFromTemplate(template, { createId: uuidv4 });

    setSelectedTransaction(newTransaction);
    setIsEditModalOpen(true);
  }, [setIsEditModalOpen, setSelectedTransaction, setState, state.templates]);

  /** Deletes a template with an Undo that puts it back in its old place. */
  const handleDeleteTemplate = useCallback((templateId: string) => {
    const index = state.templates.findIndex(t => t.id === templateId);
    const template = state.templates[index];
    setState(prev => ({
      ...prev,
      templates: prev.templates.filter(t => t.id !== templateId),
    }));
    const strings = TRANSLATIONS[state.language];
    if (!template) {
      addToast(strings.templateDeleted, 'success');
      return;
    }
    addToast(strings.templateDeleted, 'info', {
      label: strings.undo,
      onClick: () => setState(prev => {
        if (prev.templates.some(t => t.id === templateId)) return prev;
        const templates = [...prev.templates];
        templates.splice(Math.min(index, templates.length), 0, template);
        return { ...prev, templates };
      }),
    });
  }, [addToast, setState, state.language, state.templates]);

  // The Add sheet's template chips (edit mode or long-press) ask for deletes through the entry bus.
  useTemplateDeleteRequests(handleDeleteTemplate);

  return {
    handleSaveAsTemplate,
    handleUseTemplate,
    handleDeleteTemplate,
  };
}
