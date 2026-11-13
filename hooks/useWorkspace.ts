import { useCallback, useState } from 'react';
import { CONFIG } from '../config';

const readStored = (): string | null => {
  try {
    return localStorage.getItem(CONFIG.WORKSPACE_KEY) || null;
  } catch {
    return null;
  }
};

/** The workspace the app shows: a team id, or null for personal. Remembered per device. */
export function useWorkspace() {
  const [storedWorkspaceId, setStored] = useState<string | null>(readStored);

  const setWorkspaceId = useCallback((teamId: string | null) => {
    setStored(teamId);
    try {
      if (teamId) localStorage.setItem(CONFIG.WORKSPACE_KEY, teamId);
      else localStorage.removeItem(CONFIG.WORKSPACE_KEY);
    } catch {
      // Storage can be unavailable (private mode); the choice still applies for this session.
    }
  }, []);

  return { storedWorkspaceId, setWorkspaceId };
}
