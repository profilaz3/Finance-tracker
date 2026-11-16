import React from 'react';
import clsx from 'clsx';
import { ArrowLeft, ChevronRight, MoreHorizontal, Pencil, Plane, SlidersHorizontal, Trash2, X } from 'lucide-react';
import type { Currency, HomeHeaderTone, Person } from '../../types';
import { getIntlLocale, type AppLanguage } from '../../utils/locale';
import { HeroIconButton, HeroMenu, ON_COLOUR, ScreenHero } from '../ui/ScreenHero';
import { Big, fitFont, initials } from '../home/parts';
import { stableColor } from '../../utils/stableColor';
import type { PersonStrings } from './personStrings';

export interface PersonHeroChip {
  key: string;
  label: string;
  /** Opens what the chip is about (an event); a plain chip without it. */
  onClick?: () => void;
  event?: boolean;
}

export interface PersonHeroTile {
  label: string;
  value: string;
  sub: string;
}

interface PersonHeroProps {
  person: Person;
  tone: HomeHeaderTone;
  titleId: string;
  /** Their open balance in one currency (+ they owe me), or null when everything is settled. */
  main: { currency: Currency; amount: number } | null;
  /** "Owes you since 24 Oct" and the like. */
  status: string;
  chips: PersonHeroChip[];
  tiles: PersonHeroTile[];
  language: AppLanguage;
  backLabel: string;
  /** Beside the Shared or People list: Close (×) with this label instead of the back arrow. */
  closeLabel?: string;
  editLabel: string;
  onBack: () => void;
  onEdit: () => void;
  onEditBalances: () => void;
  onDelete: () => void;
  s: PersonStrings;
}

const isImage = (value?: string) => !!value && /^(data:|http)/.test(value);

/** The number on its own, with cents only when there are any; the currency code goes after it, smaller. */
const plainNumber = (value: number, language: AppLanguage): string => {
  const digits = Math.round(Math.abs(value) * 100) % 100 !== 0 ? 2 : 0;
  return new Intl.NumberFormat(getIntlLocale(language), { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Math.abs(value));
};

/**
 * The top of a person's page, in the Home header colour: who they are, what is open between you
 * and since when, anything open in other currencies or events, and three facts about the two of you.
 */
export const PersonHero: React.FC<PersonHeroProps> = ({
  person, tone, titleId, main, status, chips, tiles, language, backLabel, closeLabel, editLabel, onBack, onEdit, onEditBalances, onDelete, s,
}) => {
  const number = main ? plainNumber(main.amount, language) : s.settledBig;
  const fitText = main ? `${number} ${main.currency}` : number;
  return (
    <ScreenHero tone={tone} label={person.name}>
      <div className="flex h-[60px] items-center gap-2 px-3 md:px-4">
        <HeroIconButton icon={closeLabel ? X : ArrowLeft} label={closeLabel ?? backLabel} onClick={onBack} />
        <span className="flex-1" />
        <HeroIconButton icon={Pencil} label={editLabel} onClick={onEdit} data-shortcut-edit="" />
        <HeroMenu
          label={s.actions}
          icon={MoreHorizontal}
          items={[
            { icon: SlidersHorizontal, label: s.editBalances, onSelect: onEditBalances },
            { icon: Trash2, label: s.deletePerson, onSelect: onDelete, danger: true },
          ]}
        />
      </div>

      <div className="px-4 pb-[42px] pt-1 md:px-5 md:pb-5">
        <div className="flex items-center gap-3.5">
          <span
            aria-hidden="true"
            className="flex h-[60px] w-[60px] shrink-0 items-center justify-center overflow-hidden rounded-full text-[20px] font-bold text-white shadow-[0_0_0_3px_rgba(255,255,255,0.22)]"
            style={{ background: person.color || stableColor(person.name) }}
          >
            {isImage(person.avatar)
              ? <img src={person.avatar} alt="" className="h-full w-full object-cover" />
              : person.avatar && !isImage(person.avatar) ? <span className="text-[28px]">{person.avatar}</span> : initials(person.name)}
          </span>
          <div className="min-w-0">
            <h1 id={titleId} className="truncate text-[26px] font-bold leading-tight tracking-[-0.025em] text-white">{person.name}</h1>
            <p className="text-[14px] font-medium text-white/75">{status}</p>
          </div>
        </div>

        <div className="mt-4" style={{ containerType: 'inline-size' }}>
          <p
            className="whitespace-nowrap font-bold leading-[1.06] tracking-[-0.04em] tabular-nums text-white"
            style={{ fontSize: fitFont(46, fitText, 0.62) }}
          >
            {number}
            {main && <span className="ml-1.5 text-[0.44em] font-semibold tracking-normal text-white/60">{main.currency}</span>}
          </p>
        </div>

        {chips.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {chips.map(chip => {
              const body = (
                <>
                  {chip.event && <Plane size={14} aria-hidden="true" className="shrink-0" />}
                  <span className="min-w-0 truncate">{chip.label}</span>
                  {chip.onClick && <ChevronRight size={14} aria-hidden="true" className="shrink-0 text-white/70" />}
                </>
              );
              const className = clsx(ON_COLOUR, 'inline-flex max-w-full items-center gap-1.5 rounded-full px-3 text-[13.5px] font-semibold text-white');
              return chip.onClick
                ? <button key={chip.key} type="button" onClick={chip.onClick} className={clsx(className, 'h-10')}>{body}</button>
                : <span key={chip.key} className={clsx(className, 'h-[34px]')}>{body}</span>;
            })}
          </div>
        )}

        <dl className="mt-4 grid grid-cols-3 gap-2">
          {tiles.map(tile => (
            <div key={tile.label} className={clsx(ON_COLOUR, 'flex min-w-0 flex-col rounded-[18px] px-3 pb-2.5 pt-2')}>
              <dt className="truncate text-[12.5px] font-semibold text-white/75">{tile.label}</dt>
              <dd className="mt-0.5 text-white">
                <Big size={17}>{tile.value}</Big>
                <span className="block truncate text-[11.5px] font-medium text-white/60">{tile.sub}</span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </ScreenHero>
  );
};
