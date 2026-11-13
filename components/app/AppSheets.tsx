import React, { Suspense, useState } from 'react';
import type { AppState, TransactionType } from '../../types';
import { TRANSLATIONS } from '../../constants';
import type { ParsedTransaction } from '../../services/aiService';
import { lazyWithReload } from '../../utils/lazyWithReload';
import { GlassSheet } from '../ui/GlassSheet';
import { AddSheet } from './AddSheet';
import { ProfileMenu } from './ProfileMenu';
import { useRatesRequests } from '../rates/ratesBus';

const ExportModal = lazyWithReload(() => import('../ExportModal').then(m => ({ default: m.ExportModal })));
// Lazy: the appearance sheet opens from the profile menu, so its controls stay out of the entry chunk.
const AppearanceSettings = lazyWithReload(() => import('../settings/AppearanceSettings').then(m => ({ default: m.AppearanceSettings })));
const RatesSheet = lazyWithReload(() => import('../rates/RatesSheet').then(m => ({ default: m.RatesSheet })));

interface AppSheetsState {
  isAddSheetOpen: boolean;
  setIsAddSheetOpen: (isOpen: boolean) => void;
  isProfileMenuOpen: boolean;
  setIsProfileMenuOpen: (isOpen: boolean) => void;
  isAppearanceSheetOpen: boolean;
  setIsAppearanceSheetOpen: (isOpen: boolean) => void;
  isExportModalOpen: boolean;
  setIsExportModalOpen: (isOpen: boolean) => void;
}

interface AppSheetsProps {
  modals: AppSheetsState;
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  onCustomizeHome: () => void;
  onOpenBudgets: () => void;
  onOpenSettings: () => void;
  onSignOut: () => void;
  onParsed: (parsed: ParsedTransaction) => void;
  onManual: (type: TransactionType) => void;
  onScanReceipt: () => void;
  onSplitBill: () => void;
  onUseTemplate: (templateId: string) => void;
  workspaceId: string | null;
  onWorkspaceChange: (teamId: string | null) => void;
}

/** The redesign's chrome overlays: Add sheet, profile menu, appearance sheet and export. */
export const AppSheets: React.FC<AppSheetsProps> = ({
  modals,
  state,
  setState,
  onCustomizeHome,
  onOpenBudgets,
  onOpenSettings,
  onSignOut,
  onParsed,
  onManual,
  onScanReceipt,
  onSplitBill,
  onUseTemplate,
  workspaceId,
  onWorkspaceChange,
}) => {
  const t = TRANSLATIONS[state.language];
  // Exchange rates sheet: loaded on first open (Home rates block, Settings), then kept for its exit animation.
  const [ratesMounted, setRatesMounted] = useState(false);
  const [isRatesOpen, setIsRatesOpen] = useState(false);
  useRatesRequests(() => {
    setRatesMounted(true);
    setIsRatesOpen(true);
  });
  return (
    <>
      <AddSheet
        isOpen={modals.isAddSheetOpen}
        onClose={() => modals.setIsAddSheetOpen(false)}
        state={state}
        onParsed={onParsed}
        onManual={onManual}
        onScanReceipt={onScanReceipt}
        onSplitBill={onSplitBill}
        onUseTemplate={onUseTemplate}
      />
      <ProfileMenu
        isOpen={modals.isProfileMenuOpen}
        onClose={() => modals.setIsProfileMenuOpen(false)}
        t={t}
        profile={state.userProfile}
        onCustomizeHome={onCustomizeHome}
        onBudgets={onOpenBudgets}
        onAppearance={() => modals.setIsAppearanceSheetOpen(true)}
        onSettings={onOpenSettings}
        onExport={() => modals.setIsExportModalOpen(true)}
        onSignOut={onSignOut}
        teams={state.teams}
        workspaceId={workspaceId}
        onWorkspaceChange={onWorkspaceChange}
      />
      <GlassSheet
        isOpen={modals.isAppearanceSheetOpen}
        onClose={() => modals.setIsAppearanceSheetOpen(false)}
        title={t.appearanceLabel}
        closeLabel={t.close}
      >
        <Suspense fallback={<div className="min-h-[320px]" aria-hidden="true" />}>
          <AppearanceSettings state={state} setState={setState} />
        </Suspense>
      </GlassSheet>
      {modals.isExportModalOpen && (
        <Suspense fallback={null}>
          <ExportModal isOpen onClose={() => modals.setIsExportModalOpen(false)} state={state} />
        </Suspense>
      )}
      {ratesMounted && (
        <Suspense fallback={null}>
          <RatesSheet isOpen={isRatesOpen} onClose={() => setIsRatesOpen(false)} state={state} />
        </Suspense>
      )}
    </>
  );
};
