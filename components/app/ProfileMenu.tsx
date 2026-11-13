import React from 'react';
import { AnimatePresence, m } from 'motion/react';
import clsx from 'clsx';
import { Check, Download, LayoutGrid, LogOut, Palette, PiggyBank, Settings, Sparkles, User, UserRound } from 'lucide-react';
import { openAsk } from '../ask/askBus';
import type { Person, Team } from '../../types';
import { TRANSLATIONS } from '../../constants';
import { MOTION } from '../../config';
import { useDialog } from '../../hooks/useFocusTrap';
import { initials } from '../home/parts';

type Strings = (typeof TRANSLATIONS)['en'];

interface ProfileMenuProps {
  isOpen: boolean;
  onClose: () => void;
  t: Strings;
  profile?: Person;
  onCustomizeHome: () => void;
  onBudgets: () => void;
  onAppearance: () => void;
  onSettings: () => void;
  onExport: () => void;
  onSignOut: () => void;
  teams?: Team[];
  workspaceId?: string | null;
  onWorkspaceChange?: (teamId: string | null) => void;
}

const ProfileMenuPanel: React.FC<Omit<ProfileMenuProps, 'isOpen'>> = ({
  onClose,
  t,
  profile,
  onCustomizeHome,
  onBudgets,
  onAppearance,
  onSettings,
  onExport,
  onSignOut,
  teams,
  workspaceId = null,
  onWorkspaceChange,
}) => {
  const { dialogProps, titleId } = useDialog(true, onClose);
  const items: Array<{ icon: typeof User; label: string; onSelect: () => void; badge?: string; danger?: boolean }> = [
    { icon: LayoutGrid, label: t.customizeHome, onSelect: onCustomizeHome },
    { icon: PiggyBank, label: t.budgets, onSelect: onBudgets, badge: t.newBadge },
    { icon: Sparkles, label: t.askMenu, onSelect: () => openAsk() },
    { icon: Palette, label: t.appearanceLabel, onSelect: onAppearance },
    { icon: Settings, label: t.settings, onSelect: onSettings },
    { icon: Download, label: t.exportData, onSelect: onExport },
    { icon: LogOut, label: t.signOut, onSelect: onSignOut, danger: true },
  ];

  return (
    <div className="fixed inset-0 z-[65]">
      <m.div
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        aria-hidden="true"
      />
      <m.div
        {...dialogProps}
        initial={{ opacity: 0, scale: 0.92, y: -8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: -8 }}
        transition={MOTION.modal.spring}
        style={{ transformOrigin: 'top right' }}
        className="glass-sheet absolute right-[max(16px,env(safe-area-inset-right))] top-[calc(64px+env(safe-area-inset-top))] w-[270px] overflow-hidden rounded-[30px] p-2 text-on-surface outline-none md:right-8 md:top-20"
      >
        <h2 id={titleId} className="sr-only">{t.profileMenu}</h2>
        {profile && (
          <div className="flex items-center gap-3 px-3 pb-2.5 pt-2">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-bold text-white"
              style={{ background: profile.color }}
              aria-hidden="true"
            >
              {/^(data:|http)/.test(profile.avatar ?? '')
                ? <img src={profile.avatar} alt="" className="h-full w-full object-cover" />
                : profile.avatar || initials(profile.name)}
            </span>
            <span className="min-w-0 truncate text-[17px] font-semibold">{profile.name}</span>
          </div>
        )}
        {onWorkspaceChange && teams && teams.length > 0 && (
          <div role="radiogroup" aria-label={t.workspaceSwitch} className="mb-1 border-b border-hair pb-1">
            <p className="px-3 pb-1 pt-1 text-[12px] font-semibold uppercase tracking-wide text-faint">{t.workspace}</p>
            {[null, ...teams].map(team => {
              const id = team?.id ?? null;
              const selected = workspaceId === id;
              return (
                <button
                  key={id ?? 'personal'}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => {
                    onWorkspaceChange(id);
                    onClose();
                  }}
                  className="flex h-11 w-full items-center gap-3 rounded-[18px] px-3 text-left text-[15px] font-medium hover:bg-chip"
                >
                  {team ? (
                    <span
                      aria-hidden="true"
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[8px] text-[12px] font-bold text-white"
                      style={{ background: team.color || '#0891B2' }}
                    >
                      {team.name.trim().charAt(0).toUpperCase()}
                    </span>
                  ) : (
                    <UserRound size={20} aria-hidden="true" className="text-muted" />
                  )}
                  <span className="flex-1 truncate">{team?.name ?? t.workspacePersonal}</span>
                  {selected && <Check size={18} aria-hidden="true" className="shrink-0 text-accent" />}
                </button>
              );
            })}
          </div>
        )}
        <ul className="flex flex-col">
          {items.map(({ icon: Icon, label, onSelect, badge, danger }, i) => (
            <li key={label} className={clsx(i === items.length - 1 && 'mt-1 border-t border-hair pt-1')}>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onSelect();
                }}
                className={clsx(
                  'flex h-12 w-full items-center gap-3 rounded-[18px] px-3 text-left text-[16px] font-medium hover:bg-chip',
                  danger && 'text-neg',
                )}
              >
                <Icon size={20} aria-hidden="true" className={danger ? undefined : 'text-muted'} />
                <span className="flex-1 truncate">{label}</span>
                {badge && (
                  <span className="rounded-full bg-accent px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-on-accent">{badge}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </m.div>
    </div>
  );
};

/** Popover from the avatar on Home: customize, budgets, appearance, settings, export, sign out. */
export const ProfileMenu: React.FC<ProfileMenuProps> = ({ isOpen, ...rest }) => (
  <AnimatePresence>{isOpen && <ProfileMenuPanel key="profile-menu" {...rest} />}</AnimatePresence>
);
