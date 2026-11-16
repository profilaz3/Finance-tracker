import React from 'react';
import clsx from 'clsx';
import { ArrowLeft, Check, Pencil, Plus, QrCode, Search, Users, X } from 'lucide-react';
import type { HomeHeaderTone, Person, Team } from '../../types';
import { HeroIconButton, ON_COLOUR, ScreenHero } from '../ui/ScreenHero';
import { initials } from '../home/parts';
import { stableColor } from '../../utils/stableColor';
import type { SettingsStrings } from './settingsStrings';

interface SettingsHeroProps {
  tone: HomeHeaderTone;
  title: string;
  backLabel: string;
  onBack: () => void;
  profile?: Person;
  onEditProfile: () => void;
  onOpenPayments: () => void;
  teams: Team[];
  workspaceId: string | null;
  onWorkspaceChange?: (teamId: string | null) => void;
  onNewTeam: () => void;
  query: string;
  onQuery: (query: string) => void;
  s: SettingsStrings;
}

const CHIP = 'flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[15px] font-semibold';

/** You, the workspace on screen and settings search, over the Home header colour. */
export const SettingsHero: React.FC<SettingsHeroProps> = ({
  tone, title, backLabel, onBack, profile, onEditProfile, onOpenPayments, teams, workspaceId, onWorkspaceChange, onNewTeam, query, onQuery, s,
}) => {
  const photo = profile && /^(data:|http)/.test(profile.avatar ?? '') ? profile.avatar : undefined;
  const workspaces: Array<{ id: string | null; name: string }> = [{ id: null, name: s.personal }, ...teams.map(team => ({ id: team.id, name: team.name }))];
  return (
    <ScreenHero tone={tone} label={title}>
      <div className="flex h-[60px] items-center justify-between gap-2 px-3 md:px-4">
        {/* The sidebar does this from md up; invisible keeps the header balanced. */}
        <HeroIconButton icon={ArrowLeft} label={backLabel} onClick={onBack} className="md:invisible" />
        <h1 className="sr-only">{title}</h1>
        <HeroIconButton icon={QrCode} label={s.paymentQr} onClick={onOpenPayments} />
      </div>

      <div className="flex flex-col gap-5 px-4 pb-[42px] pt-2 md:px-5 md:pb-5">
        <button type="button" onClick={onEditProfile} className="-mx-1 flex min-w-0 items-center gap-4 rounded-[24px] px-1 py-1 text-left">
          <span
            aria-hidden="true"
            className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full text-[22px] font-bold shadow-[0_0_0_3px_rgba(255,255,255,0.2)]"
            style={{ background: profile ? profile.color || stableColor(profile.name) : 'rgba(255,255,255,0.14)' }}
          >
            {photo ? <img src={photo} alt="" className="h-full w-full object-cover" /> : profile ? initials(profile.name) : <Plus size={26} />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[28px] font-bold leading-[1.15] tracking-[-0.025em]">{profile?.name ?? s.setUpProfile}</span>
            <span className="flex items-center gap-1.5 text-[14px] text-white/75">
              {profile ? s.editProfile : s.setUpHint}
              {profile && <Pencil size={12} aria-hidden="true" className="shrink-0" />}
            </span>
          </span>
        </button>

        {onWorkspaceChange && (
          <div>
            <h2 id="settings-workspace" className="text-[12px] font-semibold uppercase tracking-[0.06em] text-white/65">{s.workspace}</h2>
            <div role="group" aria-labelledby="settings-workspace" className="scrollbar-none -mx-4 mt-2 flex gap-2 overflow-x-auto px-4 md:-mx-5 md:px-5">
              {workspaces.map(workspace => {
                const selected = workspace.id === workspaceId;
                return (
                  <button
                    key={workspace.id ?? 'personal'}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onWorkspaceChange(workspace.id)}
                    className={clsx(CHIP, selected ? 'bg-white text-[#0B0D0C] shadow-[0_2px_8px_rgba(0,0,0,0.18)]' : ON_COLOUR)}
                  >
                    {selected
                      ? <Check size={15} strokeWidth={2.6} aria-hidden="true" />
                      : workspace.id && <Users size={15} aria-hidden="true" />}
                    <span className="max-w-[160px] truncate">{workspace.name}</span>
                  </button>
                );
              })}
              <button type="button" onClick={onNewTeam} className={clsx(CHIP, ON_COLOUR)}>
                <Plus size={15} aria-hidden="true" />
                {s.newTeam}
              </button>
            </div>
          </div>
        )}

        <div className={clsx(ON_COLOUR, 'relative flex h-12 items-center rounded-full')}>
          <Search size={18} aria-hidden="true" className="pointer-events-none absolute left-4 text-white/75" />
          <input
            type="search"
            data-shortcut-search=""
            value={query}
            onChange={event => onQuery(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Escape' && query) {
                event.stopPropagation();
                onQuery('');
              }
            }}
            placeholder={s.search}
            aria-label={s.search}
            enterKeyHint="search"
            autoComplete="off"
            className="h-full w-full rounded-full bg-transparent pl-11 pr-12 text-[16px] text-white placeholder:text-white/65 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              onClick={() => onQuery('')}
              aria-label={s.clearSearch}
              className="absolute right-1 flex h-10 w-10 items-center justify-center rounded-full text-white/85"
            >
              <X size={18} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </ScreenHero>
  );
};
