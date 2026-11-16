import { useCallback, useState } from 'react';
import { readViewerPick, writeViewerPick, type ViewerPick } from '../domain/eventViewer';

/**
 * A guest's answer to "Which one are you?" for one event, kept on this device per sign-in user
 * (domain/eventViewer). `undefined` until they answer; null means "I'm not listed". If storage is
 * unavailable the answer still holds for this visit.
 */
export function useEventViewerPick(
  userId: string | null | undefined,
  eventId: string,
): [ViewerPick | undefined, (pick: ViewerPick) => void] {
  const key = userId ? `${userId}\n${eventId}` : '';
  const [entry, setEntry] = useState(() => ({ key, pick: readViewerPick(userId, eventId) }));

  // Another event or user: read that one's answer (render-time reset, no flash of the old answer).
  let current = entry;
  if (entry.key !== key) {
    current = { key, pick: readViewerPick(userId, eventId) };
    setEntry(current);
  }

  const setPick = useCallback((pick: ViewerPick) => {
    if (!userId) return;
    writeViewerPick(userId, eventId, pick);
    setEntry({ key, pick });
  }, [eventId, key, userId]);

  return [current.pick, setPick];
}
