import { useEffect } from 'react';

interface ShortcutHandlers {
  onNewTransaction: () => void;
  onEscape: () => void;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        handlers.onNewTransaction();
        return;
      }
      // Dialogs with their own Escape handling (useEscapeKey) mark the event as handled.
      if (e.key === 'Escape' && !e.defaultPrevented) {
        handlers.onEscape();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlers]);
}
