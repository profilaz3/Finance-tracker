import React, { useContext, useEffect, useState } from 'react';
import { Plus, UserPlus, Users } from 'lucide-react';
import { personPane } from './personPane';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { PageActiveContext } from '../../hooks/useBackLayer';
import { WIDE_PANE_QUERY } from '../../utils/paneSlot';
import { SHARED_STRINGS } from './sharedStrings';
import { TRANSLATIONS } from '../../constants';

interface SharedSplitProps {
  language: 'en' | 'sr';
  /** The Shared overview or the People list. */
  list: React.ReactNode;
  /** The open event's page, if one is open. */
  detail?: React.ReactNode;
  /** A person is open: App renders their page into this layout's slot. */
  personOpen: boolean;
  /** People page: the empty pane talks about people only. */
  peopleOnly?: boolean;
  onCreateEvent?: () => void;
  onAddPerson: () => void;
}

/**
 * Shared on wide windows: the list stays on the left (scrolling on its own when it is long) and
 * the open event or person fills the right. With nothing open the right says what will appear.
 */
export const SharedSplit: React.FC<SharedSplitProps> = ({ language, list, detail, personOpen, peopleOnly = false, onCreateEvent, onAddPerson }) => {
  const s = SHARED_STRINGS[language];
  const t = TRANSLATIONS[language];
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!slot) return;
    personPane.set(slot);
    return () => personPane.release(slot);
  }, [slot]);

  const empty = !detail && !personOpen;

  return (
    <div className="mx-auto flex max-w-[920px] items-start gap-6">
      {/* The column runs from the top of the window so the header's shadow is not cut off. */}
      <div className="custom-scrollbar sticky top-0 -mx-4 -my-8 max-h-[100dvh] w-[412px] shrink-0 overflow-y-auto overscroll-contain px-4 py-8">
        {list}
      </div>
      <section aria-label={s.paneLabel} className="min-w-0 flex-1">
        {detail}
        <div ref={setSlot} />
        {empty && (
          <div className="flex min-h-[360px] flex-col items-center justify-center rounded-[32px] border-[1.5px] border-dashed border-[var(--paper-line)] px-8 py-10 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-chip text-muted">
              <Users size={24} aria-hidden="true" />
            </span>
            <p className="mt-4 text-[17px] font-bold tracking-[-0.2px]">{peopleOnly ? s.peoplePaneEmpty : s.paneEmpty}</p>
            <p className="mt-1 max-w-[300px] text-[14px] font-medium text-muted">{peopleOnly ? s.peoplePaneEmptyHint : s.paneEmptyHint}</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {!peopleOnly && onCreateEvent && (
                <button
                  type="button"
                  onClick={onCreateEvent}
                  className="flex h-11 items-center gap-2 rounded-full bg-accent px-4 text-[15px] font-semibold text-on-accent"
                >
                  <Plus size={18} aria-hidden="true" />
                  {t.newEvent}
                </button>
              )}
              <button
                type="button"
                onClick={onAddPerson}
                className="flex h-11 items-center gap-2 rounded-full bg-tile px-4 text-[15px] font-semibold text-on-surface ring-1 ring-inset ring-hair"
              >
                <UserPlus size={18} aria-hidden="true" />
                {t.addPerson}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

interface SplitWhenWideProps extends Omit<SharedSplitProps, 'list' | 'detail'> {
  /** The list; `split` says it sits beside the open item (mark it, and opening one replaces the other). */
  renderList: (split: boolean) => React.ReactNode;
  /** The open event's page, if one is open; on narrow windows it replaces the list. */
  renderDetail?: (split: boolean) => React.ReactNode;
}

/** Shared and People: one page at a time, or on wide windows the list beside the open event or person. */
const SplitWhenWide: React.FC<SplitWhenWideProps> = ({ renderList, renderDetail, ...rest }) => {
  const wide = useMediaQuery(WIDE_PANE_QUERY);
  // A parked or peeking copy of the page never splits (and never takes the person pane).
  const pageActive = useContext(PageActiveContext);
  if (!(wide && pageActive)) return <>{renderDetail ? renderDetail(false) : renderList(false)}</>;
  return <SharedSplit list={renderList(true)} detail={renderDetail?.(true)} {...rest} />;
};

export default SplitWhenWide;
