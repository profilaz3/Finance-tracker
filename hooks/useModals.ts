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
  const [isAddSheetOpen, setIsAddSheetOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isAppearanceSheetOpen, setIsAppearanceSheetOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isAskOpen, setIsAskOpen] = useState(false);

  const closeAllModals = useCallback(() => {
    setIsEditModalOpen(false);
    setIsReceiptModalOpen(false);
    setIsSplitModalOpen(false);
    setIsAddPersonModalOpen(false);
    setIsEventCreationModalOpen(false);
    setIsReceiptScanModalOpen(false);
    setIsSplitExpenseModalOpen(false);
    setIsUserProfileModalOpen(false);
    setIsAddSheetOpen(false);
    setIsProfileMenuOpen(false);
    setIsAppearanceSheetOpen(false);
    setIsExportModalOpen(false);
    setIsAskOpen(false);
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
    isAddSheetOpen, setIsAddSheetOpen,
    isProfileMenuOpen, setIsProfileMenuOpen,
    isAppearanceSheetOpen, setIsAppearanceSheetOpen,
    isExportModalOpen, setIsExportModalOpen,
    isAskOpen, setIsAskOpen,
    closeAllModals,
  };
}
