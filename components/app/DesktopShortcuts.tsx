import React, { useEffect, useRef, useState } from 'react';
import type { View } from '../../types';
import { TRANSLATIONS } from '../../constants';
import { GlassSheet } from '../ui/GlassSheet';
import { useBackLayer } from '../../hooks/useBackLayer';
import { SHORTCUT_STRINGS } from './shortcutStrings';
import { SHORTCUTS_HELP_EVENT } from './AppNavigation';

interface DesktopShortcutsProps {
  language: 'en' | 'sr';
  onNavigate: (view: View) => void;
  onNewEntry: () => void;
  onAddMenu: () => void;
}

/** Number keys go to the tabs, then Budgets and Settings. */
const GO_TO: Record<string, View> = { 1: 'dashboard', 2: 'transactions', 3: 'events', 4: 'analytics', 5: 'budgets', 6: 'settings' };

/** Keys typed here belong to the field. */
const TYPING = 'input, textarea, select, [contenteditable="true"], [contenteditable=""]';

/** On screen and usable: not hidden, and not on a parked or peeking page (those are inert). */
const usable = (element: HTMLElement) => element.isConnected && element.getClientRects().length > 0 && !element.closest('[inert]');
const find = (selector: string) => Array.from(document.querySelectorAll<HTMLElement>(selector)).find(usable) ?? null;

const focusSearch = (): boolean => {
  const field = find('[data-shortcut-search]');
  if (!field) return false;
  field.focus();
  if (field instanceof HTMLInputElement) field.select();
  return true;
};

/** Focuses the screen's search, pressing its search button first when the field is hidden behind one. */
const focusOrOpenSearch = (): boolean => {
  if (focusSearch()) return true;
  const opener = find('[data-shortcut-search-open]');
  if (!opener) return false;
  opener.click();
  return true;
};

/**
 * Single-key shortcuts for a keyboard (N, A, /, 1 to 6, E, ?), ignored while typing or while a
 * dialog is open. Loaded lazily after the app is up; Ctrl+N and Esc stay in useKeyboardShortcuts.
 */
const DesktopShortcuts: React.FC<DesktopShortcutsProps> = ({ language, onNavigate, onNewEntry, onAddMenu }) => {
  const [helpOpen, setHelpOpen] = useState(false);
  const close = () => setHelpOpen(false);
  useBackLayer('keyboard-shortcuts', helpOpen, close);

  const handlers = useRef({ onNavigate, onNewEntry, onAddMenu });
  handlers.current = { onNavigate, onNewEntry, onAddMenu };

  useEffect(() => {
    let searchTimer: number | undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(TYPING)) return;
      // A dialog, or the entry form open in the Activity pane (a key must not throw the edit away).
      if (document.querySelector('[aria-modal="true"], [data-pane-editing]')) return;
      // An open menu (header ⋯, an entry's actions) is not modal but owns the keys while it is up.
      if (find('[role="menu"]')) return;
      const key = event.key;
      // "?" needs Shift on most layouts; every other shortcut is a plain key.
      if (event.shiftKey && key !== '?') return;
      const { onNavigate: go, onNewEntry: newEntry, onAddMenu: addMenu } = handlers.current;

      if (key === '?') setHelpOpen(true);
      else if (key === 'n' || key === 'N') newEntry();
      else if (key === 'a' || key === 'A') addMenu();
      else if (key === '/') {
        // The screen's own search, or Activity's when the screen has none.
        if (!focusOrOpenSearch()) {
          go('transactions');
          const started = Date.now();
          window.clearInterval(searchTimer);
          searchTimer = window.setInterval(() => {
            if (focusSearch() || Date.now() - started > 2000) window.clearInterval(searchTimer);
          }, 80);
        }
      } else if (key === 'e' || key === 'E') {
        const edit = find('[data-shortcut-edit]');
        if (!edit) return;
        edit.click();
      } else if (GO_TO[key]) go(GO_TO[key]);
      else return;
      event.preventDefault();
    };
    const openHelp = () => setHelpOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener(SHORTCUTS_HELP_EVENT, openHelp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(SHORTCUTS_HELP_EVENT, openHelp);
      window.clearInterval(searchTimer);
    };
  }, []);

  const s = SHORTCUT_STRINGS[language];
  const t = TRANSLATIONS[language];
  const groups: Array<[string, Array<[string[], string]>]> = [
    [s.groupGeneral, [
      [['N'], s.newEntry],
      [['A'], s.addMenu],
      [['/'], s.search],
      [['Esc'], s.closeOpen],
      [['?'], s.help],
    ]],
    [s.groupGo, [
      [['1'], t.navHome],
      [['2'], t.navActivity],
      [['3'], t.navEvents],
      [['4'], t.navInsights],
      [['5'], t.budgets],
      [['6'], t.settings],
    ]],
    [s.groupActivity, [
      [['↑', '↓'], s.nextPrevious],
      [['J', 'K'], s.nextPrevious],
      [['E'], s.edit],
    ]],
  ];

  return (
    <GlassSheet isOpen={helpOpen} onClose={close} title={s.title} closeLabel={s.close}>
      <p className="px-1 pb-3 text-[14px] text-muted">{s.intro}</p>
      <div className="flex flex-col gap-4 pb-2">
        {groups.map(([title, rows]) => (
          <section key={title} aria-label={title}>
            <h3 className="px-1 pb-1.5 text-[12px] font-semibold uppercase tracking-[0.6px] text-muted">{title}</h3>
            <dl className="paper-tile divide-y divide-[var(--paper-line)] px-4">
              {rows.map(([keys, label]) => (
                <div key={`${keys.join('')}-${label}`} className="flex min-h-[46px] items-center justify-between gap-4 py-2">
                  <dt className="text-[15px] font-medium">{label}</dt>
                  <dd className="flex shrink-0 gap-1.5">
                    {keys.map(key => (
                      <kbd
                        key={key}
                        className="flex h-8 min-w-8 items-center justify-center rounded-[10px] bg-chip px-2 font-sans text-[14px] font-semibold shadow-[inset_0_-1px_0_var(--paper-line)]"
                      >
                        {key}
                      </kbd>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </GlassSheet>
  );
};

export default DesktopShortcuts;
