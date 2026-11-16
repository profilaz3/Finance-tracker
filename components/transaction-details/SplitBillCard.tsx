import React, { useId, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import clsx from 'clsx';
import { Check, Plus, Split } from 'lucide-react';
import type { Person } from '../../types';
import type { TRANSLATIONS } from '../../constants';
import type { AppLanguage } from '../../utils/locale';
import { pluralText } from '../../utils/plural';
import { PersonAvatar } from './DebtsCard';
import type { DetailsStrings } from './detailsStrings';

interface SplitBillCardProps {
  /** People to offer as chips, best guess first (`suggestSplitPeople`). */
  people: Person[];
  language: AppLanguage;
  t: typeof TRANSLATIONS['en'];
  d: DetailsStrings;
  /** Opens the split form with these people picked (evenly), or with nobody picked. */
  onSplit: (personIds: string[]) => void;
}

/**
 * "Split this bill" on an entry nobody shares yet: your usual people as one-tap chips, then a
 * "Split 3 ways" button that opens the split form with them already picked. "+" opens the form
 * to pick anyone else.
 */
export const SplitBillCard: React.FC<SplitBillCardProps> = ({ people, language, t, d, onSplit }) => {
  const [picked, setPicked] = useState<string[]>([]);
  const headingId = useId();
  const toggle = (id: string) => setPicked(list => (list.includes(id) ? list.filter(item => item !== id) : [...list, id]));
  const ways = pluralText(picked.length + 1, language, { one: d.splitWaysOne, few: d.splitWaysFew, other: d.splitWaysOther });

  return (
    <section className="paper-tile px-4 pb-4 pt-4" aria-labelledby={headingId}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 id={headingId} className="text-[16px] font-semibold leading-snug">{t.detailsSplitThisBill}</h3>
          <p className="mt-0.5 text-[13.5px] font-medium text-muted">{people.length > 0 ? d.whoWasWithYou : d.noPeopleYet}</p>
        </div>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Split size={20} aria-hidden="true" />
        </span>
      </div>

      <div className="mt-3.5 flex flex-wrap gap-1.5" role="group" aria-label={d.whoWasWithYou}>
        {people.map(person => {
          const on = picked.includes(person.id);
          return (
            <button
              key={person.id}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(person.id)}
              className={clsx(
                'flex h-11 min-w-0 max-w-full items-center gap-2 rounded-full pl-1.5 pr-3.5 text-[15px] font-semibold transition-colors duration-150',
                on ? 'bg-accent text-on-accent' : 'bg-chip text-on-surface',
              )}
            >
              {on ? (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-accent" aria-hidden="true">
                  <Check size={17} strokeWidth={3} />
                </span>
              ) : (
                <PersonAvatar person={person} size={32} />
              )}
              <span className="truncate">{person.name}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => onSplit(picked)}
          aria-label={d.otherPeople}
          title={d.otherPeople}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-chip text-on-surface"
        >
          <Plus size={20} aria-hidden="true" />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {picked.length > 0 && (
          <m.div
            key="split"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 520, damping: 42 }}
            className="overflow-hidden"
          >
            <div className="pt-3.5">
              <button
                type="button"
                onClick={() => onSplit(picked)}
                className="flex h-[52px] w-full items-center justify-center gap-2 rounded-full bg-accent text-[16px] font-semibold text-on-accent"
              >
                <Split size={18} aria-hidden="true" /> {ways}
              </button>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </section>
  );
};
