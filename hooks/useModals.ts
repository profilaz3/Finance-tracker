import { useState, useCallback } from 'react';

export function useModals() {
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isSplitModalOpen, setIsSplitModalOpen] = useState(false);
  // Entry whose details sheet is open (it reads the live entry from state by id).
  const [detailsId, setDetailsId] = useState<string | null>(null);
  // The row the details card grows out of (and shrinks back into).
  const [detailsOrigin, setDetailsOrigin] = useState<Element | null>(null);
  const [isAddPersonModalOpen, setIsAddPersonModalOpen] = useState(false);
  const [isEventCreationModalOpen, setIsEventCreationModalOpen] = useState(false);
  const [isReceiptScanModalOpen, setIsReceiptScanModalOpen] = useState(false);
  const [isSplitExpenseModalOpen, setIsSplitExpenseModalOpen] = useState(false);
  const [isUserProfileModalOpen, setIsUserProfileModalOpen] = useState(false);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  // The button the Add menu grows from; null grows it from whichever Add button is on screen.
  const [addAnchor, setAddAnchor] = useState<HTMLElement | null>(null);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isAppearanceSheetOpen, setIsAppearanceSheetOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isAskOpen, setIsAskOpen] = useState(false);

  const closeAllModals = useCallback(() => {
    setIsEditModalOpen(false);
    setDetailsId(null);
    setIsSplitModalOpen(false);
    setIsAddPersonModalOpen(false);
    setIsEventCreationModalOpen(false);
    setIsReceiptScanModalOpen(false);
    setIsSplitExpenseModalOpen(false);
    setIsUserProfileModalOpen(false);
    setIsAddMenuOpen(false);
    setIsProfileMenuOpen(false);
    setIsAppearanceSheetOpen(false);
    setIsExportModalOpen(false);
    setIsAskOpen(false);
  }, []);

  const openAddMenu = useCallback((anchor?: HTMLElement | null) => {
    setAddAnchor(anchor ?? null);
    setIsAddMenuOpen(true);
  }, []);

  const openDetails = useCallback((transactionId: string, origin: Element | null = null) => {
    setDetailsOrigin(origin);
    setDetailsId(transactionId);
  }, []);
  const closeDetails = useCallback(() => setDetailsId(null), []);

  return {
    isEditModalOpen, setIsEditModalOpen,
    isSplitModalOpen, setIsSplitModalOpen,
    detailsId, detailsOrigin, openDetails, closeDetails,
    isAddPersonModalOpen, setIsAddPersonModalOpen,
    isEventCreationModalOpen, setIsEventCreationModalOpen,
    isReceiptScanModalOpen, setIsReceiptScanModalOpen,
    isSplitExpenseModalOpen, setIsSplitExpenseModalOpen,
    isUserProfileModalOpen, setIsUserProfileModalOpen,
    isAddMenuOpen, setIsAddMenuOpen, addAnchor, openAddMenu,
    isProfileMenuOpen, setIsProfileMenuOpen,
    isAppearanceSheetOpen, setIsAppearanceSheetOpen,
    isExportModalOpen, setIsExportModalOpen,
    isAskOpen, setIsAskOpen,
    closeAllModals,
  };
}
