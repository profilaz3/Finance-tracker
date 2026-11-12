import { useState, useCallback } from 'react';

export function useModals() {
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isSplitModalOpen, setIsSplitModalOpen] = useState(false);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [isAddPersonModalOpen, setIsAddPersonModalOpen] = useState(false);
  const [isEventCreationModalOpen, setIsEventCreationModalOpen] = useState(false);
  const [isReceiptScanModalOpen, setIsReceiptScanModalOpen] = useState(false);
  const [isSplitExpenseModalOpen, setIsSplitExpenseModalOpen] = useState(false);
  const [isUserProfileModalOpen, setIsUserProfileModalOpen] = useState(false);

  const closeAllModals = useCallback(() => {
    setIsEditModalOpen(false);
    setIsReceiptModalOpen(false);
    setIsSplitModalOpen(false);
    setIsAddPersonModalOpen(false);
    setIsEventCreationModalOpen(false);
    setIsReceiptScanModalOpen(false);
    setIsSplitExpenseModalOpen(false);
    setIsUserProfileModalOpen(false);
  }, []);

  return {
    isEditModalOpen, setIsEditModalOpen,
    isSplitModalOpen, setIsSplitModalOpen,
    isReceiptModalOpen, setIsReceiptModalOpen,
    isAddPersonModalOpen, setIsAddPersonModalOpen,
    isEventCreationModalOpen, setIsEventCreationModalOpen,
    isReceiptScanModalOpen, setIsReceiptScanModalOpen,
    isSplitExpenseModalOpen, setIsSplitExpenseModalOpen,
    isUserProfileModalOpen, setIsUserProfileModalOpen,
    closeAllModals,
  };
}
