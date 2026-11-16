import React, { useEffect, useRef, useState } from 'react';
import { ReceiptText } from 'lucide-react';
import { openTransactionDetails, releaseDetailsPaneSlot, setDetailsPaneSlot } from '../transaction-details/detailsBus';
import { ACTIVITY_STRINGS } from './activityStrings';

interface ActivityDetailsPaneProps {
  language: 'en' | 'sr';
  /** The entry open in the pane, if any. */
  selectedId: string | null;
  /** The list as shown (filters applied), top to bottom: what the arrow keys step through. */
  entryIds: string[];
}

/** Keys typed here belong to the control, not to the list. */
const OWN_KEYS = 'input, textarea, select, [contenteditable="true"], [role="menu"], [role="radiogroup"], [role="listbox"], [role="tablist"], [role="slider"]';

const focusRow = (id: string) => {
  // The list scrolls the row into view first; it may need a frame or two to render it.
  window.setTimeout(() => {
    const row = document.querySelector<HTMLElement>(`[data-transaction-id="${CSS.escape(id)}"] [role="button"]`);
    row?.focus({ preventScroll: true });
  }, 60);
};

/**
 * The right-hand column of Activity on wide windows. App renders the open entry's details card into
 * it (see `setDetailsPaneSlot`); with nothing open it says what will appear. ↑/↓ (or J/K) step
 * through the list while no form or dialog is open.
 */
export const ActivityDetailsPane: React.FC<ActivityDetailsPaneProps> = ({ language, selectedId, entryIds }) => {
  const s = ACTIVITY_STRINGS[language];
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!slot) return;
    setDetailsPaneSlot(slot);
    return () => releaseDetailsPaneSlot(slot);
  }, [slot]);

  const latest = useRef({ selectedId, entryIds });
  latest.current = { selectedId, entryIds };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const step = event.key === 'ArrowDown' || event.key === 'j' ? 1 : event.key === 'ArrowUp' || event.key === 'k' ? -1 : 0;
      if (!step) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(OWN_KEYS)) return;
      // A dialog, or the entry form open in the pane: the keys are not for the list.
      if (document.querySelector('[aria-modal="true"], [data-pane-editing]')) return;
      const { selectedId: current, entryIds: ids } = latest.current;
      if (ids.length === 0) return;
      const index = current ? ids.indexOf(current) : -1;
      const next = index === -1 ? (step > 0 ? 0 : ids.length - 1) : Math.min(ids.length - 1, Math.max(0, index + step));
      event.preventDefault();
      if (next === index) return;
      openTransactionDetails(ids[next], null);
      focusRow(ids[next]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <aside aria-label={s.paneLabel} className="sticky top-8 flex max-h-[calc(100dvh-4rem)] w-[400px] shrink-0 flex-col">
      {!selectedId && (
        <div className="flex min-h-[300px] flex-col items-center justify-center rounded-[32px] border-[1.5px] border-dashed border-[var(--paper-line)] px-8 py-10 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-chip text-muted">
            <ReceiptText size={24} aria-hidden="true" />
          </span>
          <p className="mt-4 text-[17px] font-bold tracking-[-0.2px]">{s.paneEmpty}</p>
          <p className="mt-1 max-w-[260px] text-[14px] font-medium text-muted">{s.paneEmptyHint}</p>
          {entryIds.length > 0 && <p className="mt-5 text-[12.5px] font-medium text-muted">{s.paneKeys}</p>}
        </div>
      )}
      <div ref={setSlot} className="flex min-h-0 flex-col" />
    </aside>
  );
};
