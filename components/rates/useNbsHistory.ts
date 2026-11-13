import { useCallback, useEffect, useRef, useState } from 'react';
import { belgradeToday } from '../../utils/nbsRates';
import { cachedNbsHistory, fetchNbsHistory, type NbsHistory } from '../../services/nbsRatesService';

export type HistoryStatus = 'loading' | 'ready' | 'offline' | 'error';

/**
 * NBS history from `from` to today. Paints the stored series at once, then refreshes (only the
 * missing days are fetched). A failed refresh keeps whatever was stored.
 */
export const useNbsHistory = (from: string, enabled = true) => {
  const [history, setHistory] = useState<NbsHistory | null>(() => cachedNbsHistory());
  const [status, setStatus] = useState<HistoryStatus>(() => (cachedNbsHistory() ? 'ready' : 'loading'));
  const [attempt, setAttempt] = useState(0);
  const latestRequest = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    const request = ++latestRequest.current;
    const stored = cachedNbsHistory();
    const covered = stored && stored.coveredFrom <= from && stored.fetchedDay === belgradeToday();
    if (!covered) setStatus(stored && stored.coveredFrom <= from ? 'ready' : 'loading');
    void fetchNbsHistory(from).then((result) => {
      if (request !== latestRequest.current) return;
      if (result.ok) {
        setHistory(result.history);
        setStatus('ready');
        return;
      }
      if (result.history) setHistory(result.history);
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      setStatus(offline ? 'offline' : 'error');
    });
  }, [from, enabled, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { history, status, retry };
};
