import React, { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Check, Plus, X } from 'lucide-react';
import type { HomeHeader, HomeHeaderFace, HomeHeaderTone } from '../../types';
import {
  HEADER_FACES,
  HEADER_STATS,
  MAX_HEADER_STATS,
  addStat,
  isStatAvailable,
  removeStat,
  shownFace,
  tripToday,
  walletIdOf,
  walletStat,
} from '../../domain/homeHeader';
import { GlassSheet } from '../ui/GlassSheet';
import { Segmented } from '../ui/Segmented';
import { NOOP_ACTIONS } from './BlockPreview';
import { HomeHero, headerContext, statLabel } from './HomeHero';
import { fill } from './parts';
import type { HomeData } from './useHomeData';
import { HEADER_STRINGS } from './headerStrings';

interface HeaderSettingsSheetProps {
  isOpen: boolean;
  header: HomeHeader;
  data: HomeData;
  onClose: () => void;
  onSave: (header: HomeHeader) => void;
}

/** A small white sketch of each face for its option tile. */
const FaceSketch: React.FC<{ face: HomeHeaderFace }> = ({ face }) => {
  switch (face) {
    case 'budget':
      return (
        <span className="flex h-1.5 gap-[2px] overflow-hidden rounded-full bg-white/25">
          <span className="w-[34%] bg-white/90" />
          <span className="w-[22%] bg-white/60" />
          <span className="w-[12%] bg-white/40" />
        </span>
      );
    case 'today':
      return (
        <span className="flex h-4 items-end gap-[3px]">
          {[40, 55, 25, 80, 100, 70, 15].map((height, i) => (
            <span key={i} className={clsx('flex-1 rounded-[2px]', i === 5 ? 'bg-white' : 'bg-white/50')} style={{ height: `${height}%` }} />
          ))}
        </span>
      );
    case 'month':
      return (
        <span className="flex flex-col gap-[3px]">
          <span className="h-1.5 w-full rounded-full bg-white/90" />
          <span className="h-1.5 w-[70%] rounded-full bg-white/50" />
        </span>
      );
    case 'owed':
      return (
        <span className="flex">
          {[0, 1, 2].map(i => (
            <span key={i} className={clsx('h-4 w-4 rounded-full ring-[1.5px] ring-white/50', i > 0 && '-ml-1.5', ['bg-white/80', 'bg-white/55', 'bg-white/35'][i])} />
          ))}
        </span>
      );
    default:
      return (
        <svg viewBox="0 0 100 18" preserveAspectRatio="none" className="h-4 w-full">
          <path
            d={face === 'rate' ? 'M0 12 L14 10 L28 13 L42 8 L56 9 L70 5 L84 7 L100 4' : 'M0 15 L12 14 L22 5 L40 6 L58 8 L76 9 L100 7'}
            fill="none"
            stroke="white"
            strokeWidth="2"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      );
  }
};

const Switch: React.FC<{ checked: boolean; onChange: (checked: boolean) => void; label: string }> = ({ checked, onChange, label }) => (
  <>
    <input
      type="checkbox"
      role="switch"
      aria-label={label}
      checked={checked}
      onChange={event => onChange(event.target.checked)}
      className="peer sr-only"
    />
    <span
      aria-hidden="true"
      className={clsx(
        'relative h-[30px] w-[50px] shrink-0 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2',
        checked ? 'bg-accent' : 'bg-chip',
      )}
    >
      <span
        className={clsx(
          'absolute left-[2px] top-[2px] h-[26px] w-[26px] rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.18)] transition-transform duration-300 ease-[cubic-bezier(0.34,1.32,0.64,1)]',
          checked && 'translate-x-5',
        )}
      />
    </span>
  </>
);

export const HeaderSettingsSheet: React.FC<HeaderSettingsSheetProps> = ({ isOpen, header, data, onClose, onSave }) => {
  const { t } = data;
  const h = HEADER_STRINGS[data.language];
  const [draft, setDraft] = useState<HomeHeader>(header);

  useEffect(() => {
    if (isOpen) setDraft(header);
    // Start from the saved header each time the sheet opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const context = headerContext(data);
  const full = draft.stats.length >= MAX_HEADER_STATS;
  const addable = [
    ...HEADER_STATS.filter(stat => isStatAvailable(stat, context)),
    ...data.wallets.map(wallet => walletStat(wallet.account.id)),
  ].filter(stat => !draft.stats.includes(stat));
  const trip = data.event ? tripToday(data.event.event) : null;
  const fallbackNote = draft.face === 'budget' && shownFace('budget', context) !== 'budget' ? h.headerNoBudgetNote : null;

  return (
    <GlassSheet
      isOpen={isOpen}
      onClose={onClose}
      title={h.headerTitle}
      closeLabel={t.close}
      footer={
        <button
          type="button"
          onClick={() => onSave(draft)}
          className="h-12 w-full rounded-full bg-accent text-[15px] font-semibold text-on-accent"
        >
          {t.save}
        </button>
      }
    >
      <div className="flex flex-col gap-6">
        <p className="text-[14px] text-muted">{h.headerIntro}</p>

        {/* The picked face with the draft applied (a trip on today would cover it; the switch below says so). */}
        <div aria-hidden="true" inert className="pointer-events-none select-none" style={{ zoom: 0.86 }}>
          <HomeHero data={data} header={{ ...draft, trip: false }} actions={NOOP_ACTIONS} editing={false} topBar={null} onChangeHeader={() => {}} preview />
        </div>

        <section className="flex flex-col gap-2.5">
          <h3 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-muted">{h.headerMainNumber}</h3>
          <div role="radiogroup" aria-label={h.headerMainNumber} className="grid grid-cols-2 gap-2 min-[420px]:grid-cols-3">
            {HEADER_FACES.map(face => {
              const selected = draft.face === face;
              return (
                <button
                  key={face}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setDraft(prev => ({ ...prev, face }))}
                  className={clsx(
                    'relative flex min-h-[44px] flex-col rounded-[20px] bg-tile p-1.5 text-left transition-shadow',
                    selected ? 'shadow-[0_0_0_2px_rgb(var(--accent-rgb))]' : 'shadow-[0_0_0_1px_var(--paper-line)]',
                  )}
                >
                  <span className={clsx('hero-bg flex h-[54px] flex-col justify-end rounded-[15px] px-2.5 pb-2.5', draft.tone === 'dark' && 'hero-dark')}>
                    <FaceSketch face={face} />
                  </span>
                  {selected && (
                    <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-white text-[#14171A]">
                      <Check size={13} strokeWidth={3} aria-hidden="true" />
                    </span>
                  )}
                  <span className="mt-2 px-1 text-[14px] font-semibold leading-tight">{h[`face_${face}` as const]}</span>
                  <span className="mb-1 px-1 text-[12px] leading-snug text-muted">{h[`faceDesc_${face}` as const]}</span>
                </button>
              );
            })}
          </div>
          {fallbackNote && <p className="text-[13px] text-muted">{fallbackNote}</p>}
        </section>

        <section className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-muted">{h.headerNumbersUnder}</h3>
            <span className="text-[12px] text-muted">{full ? h.headerNumbersFull : h.headerNumbersHint}</span>
          </div>
          {draft.stats.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {draft.stats.map(stat => {
                const label = statLabel(stat, data);
                return (
                  <button
                    key={stat}
                    type="button"
                    onClick={() => setDraft(prev => ({ ...prev, stats: removeStat(prev.stats, stat) }))}
                    aria-label={fill(h.headerRemoveNumber, { name: label })}
                    className="flex min-h-[48px] min-w-0 items-center justify-between gap-1 rounded-2xl bg-chip py-2 pl-3 pr-2 text-left"
                  >
                    <span className="min-w-0 truncate text-[14px] font-semibold">{label}</span>
                    <X size={16} aria-hidden="true" className="shrink-0 text-muted" />
                  </button>
                );
              })}
            </div>
          )}
          {[addable.filter(stat => !walletIdOf(stat)), addable.filter(stat => walletIdOf(stat))].map((group, index) =>
            group.length === 0 ? null : (
              <div key={index} className="flex flex-col gap-2">
                {index === 1 && <span className="mt-1 text-[12px] font-semibold text-muted">{t.block_wallets}</span>}
                <div className="flex flex-wrap gap-2">
                  {group.map(stat => {
                    const label = statLabel(stat, data);
                    return (
                      <button
                        key={stat}
                        type="button"
                        disabled={full}
                        onClick={() => setDraft(prev => ({ ...prev, stats: addStat(prev.stats, stat) }))}
                        aria-label={fill(h.headerAddNumber, { name: label })}
                        className="flex h-10 max-w-full items-center gap-1.5 rounded-full px-3.5 text-[14px] font-semibold shadow-[0_0_0_1px_var(--paper-line)] disabled:opacity-40"
                      >
                        <Plus size={15} aria-hidden="true" className="shrink-0" />
                        <span className="truncate">{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ),
          )}
        </section>

        <label className="flex min-h-[52px] cursor-pointer items-center justify-between gap-4">
          <span className="flex min-w-0 flex-col">
            <span className="text-[15px] font-semibold">{h.headerTrip}</span>
            <span className="text-[13px] text-muted">
              {trip && data.event
                ? fill(h.headerTripOn, { name: data.event.event.name, face: h[`face_${shownFace(draft.face, context)}` as const] })
                : h.headerTripOff}
            </span>
          </span>
          <Switch checked={draft.trip} onChange={checked => setDraft(prev => ({ ...prev, trip: checked }))} label={h.headerTrip} />
        </label>

        <div className="flex flex-col gap-2 pb-1">
          <div className="flex items-center justify-between gap-4">
            <span className="text-[15px] font-semibold">{h.headerColour}</span>
            <Segmented<HomeHeaderTone>
              ariaLabel={h.headerColour}
              value={draft.tone}
              onChange={tone => setDraft(prev => ({ ...prev, tone }))}
              options={[
                { value: 'accent', label: h.headerToneAccent },
                { value: 'dark', label: h.headerToneDark },
              ]}
              className="w-[190px]"
            />
          </div>
          <span className="text-[13px] text-muted">{h.headerToneHint}</span>
        </div>
      </div>
    </GlassSheet>
  );
};
