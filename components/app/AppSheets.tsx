import React, { Suspense, useEffect, useState } from 'react';
import type { AppState, TransactionType } from '../../types';
import { TRANSLATIONS } from '../../constants';
import type { ParsedTransaction } from '../../services/aiService';
import { lazyWithReload } from '../../utils/lazyWithReload';
import { GlassSheet } from '../ui/GlassSheet';
import { useRatesRequests } from '../rates/ratesBus';
import { useBackLayer } from '../../hooks/useBackLayer';

const ExportModal = lazyWithReload(() => import('../ExportModal').then(m => ({ default: m.ExportModal })));
// Lazy: the appearance sheet opens from the profile menu, so its controls stay out of the entry chunk.
const AppearanceSettings = lazyWithReload(() => import('../settings/AppearanceSettings').then(m => ({ default: m.AppearanceSettings })));
const RatesSheet = lazyWithReload(() => import('../rates/RatesSheet').then(m => ({ default: m.RatesSheet })));
// Lazy (entry chunk budget): preloaded on idle so the first tap opens without a wait.
const AddMenu = lazyWithReload(() => import('./AddMenu').then(m => ({ default: m.AddMenu })));
const ProfileMenu = lazyWithReload(() => import('./ProfileMenu').then(m => ({ default: m.ProfileMenu })));
const ConfirmDialog = lazyWithReload(() => import('../ConfirmDialog').then(m => ({ default: m.ConfirmDialog })));

interface AppSheetsState {
  isAddMenuOpen: boolean;
  setIsAddMenuOpen: (isOpen: boolean) => void;
  addAnchor: HTMLElement | null;
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

/** The redesign's chrome overlays: Add menu, profile menu, appearance sheet and export. */
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
  useBackLayer('rates-sheet', isRatesOpen, () => setIsRatesOpen(false));
  // Signing out asks first: a stray tap in the profile menu should not end the session.
  const [signOutMounted, setSignOutMounted] = useState(false);
  const [isSignOutOpen, setIsSignOutOpen] = useState(false);
  useBackLayer('sign-out-confirm', isSignOutOpen, () => setIsSignOutOpen(false));
  // Add menu and profile menu mount on first open, then stay mounted for their exit animation.
  const [addMounted, setAddMounted] = useState(false);
  const [profileMounted, setProfileMounted] = useState(false);
  if (modals.isAddMenuOpen && !addMounted) setAddMounted(true);
  if (modals.isProfileMenuOpen && !profileMounted) setProfileMounted(true);
  useEffect(() => {
    const run = () => {
      void AddMenu.preload().catch(() => undefined);
      void ProfileMenu.preload().catch(() => undefined);
    };
    const hasIdle = 'requestIdleCallback' in window;
    const id = hasIdle ? window.requestIdleCallback(run, { timeout: 2000 }) : window.setTimeout(run, 1200);
    return () => {
      if (hasIdle) window.cancelIdleCallback(id);
      else window.clearTimeout(id);
    };
  }, []);
  return (
    <>
      {addMounted && (
        <Suspense fallback={null}>
          <AddMenu
            isOpen={modals.isAddMenuOpen}
            onClose={() => modals.setIsAddMenuOpen(false)}
            anchor={modals.addAnchor}
            state={state}
            onParsed={onParsed}
            onManual={onManual}
            onScanReceipt={onScanReceipt}
            onSplitBill={onSplitBill}
            onUseTemplate={onUseTemplate}
            workspaceName={state.teams && state.teams.length > 0
              ? (state.teams.find(team => team.id === workspaceId)?.name ?? t.workspacePersonal)
              : undefined}
          />
        </Suspense>
      )}
      {profileMounted && (
        <Suspense fallback={null}>
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
            onSignOut={() => {
              setSignOutMounted(true);
              setIsSignOutOpen(true);
            }}
            teams={state.teams}
            workspaceId={workspaceId}
            onWorkspaceChange={onWorkspaceChange}
          />
        </Suspense>
      )}
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
      {signOutMounted && (
        <Suspense fallback={null}>
          <ConfirmDialog
            isOpen={isSignOutOpen}
            type="warning"
            title={t.signOutConfirmTitle}
            message={t.signOutConfirmMessage}
            confirmLabel={t.signOut}
            cancelLabel={t.cancel}
            onCancel={() => setIsSignOutOpen(false)}
            onConfirm={() => {
              setIsSignOutOpen(false);
              onSignOut();
            }}
          />
        </Suspense>
      )}
    </>
  );
};
