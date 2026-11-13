import React, { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { ArrowRight, Check, Loader2, Shapes, SpellCheck, Merge } from 'lucide-react';
import type { AppState } from '../../types';
import { TRANSLATIONS } from '../../constants';
import {
  aiSuggestions,
  applyCleanup,
  buildCleanupPlan,
  combineSuggestions,
  habitSuggestions,
  suggestionCount,
  undoCleanup,
  type AppliedCleanup,
  type CleanupKind,
  type CleanupSuggestion,
} from '../../domain/cleanup';
import { commitTransactionChanges, runCleanupBatches } from '../../services/cleanupService';
import { GlassSheet } from '../ui/GlassSheet';
import { fill } from '../home/parts';

type ToastFn = (message: string, type: 'success' | 'error' | 'info' | 'warning', action?: { label: string; onClick: () => void }) => void;

interface CleanupSheetProps {
  isOpen: boolean;
  onClose: () => void;
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  onToast?: ToastFn;
}

type Phase =
  | { name: 'working'; done: number; total: number }
  | { name: 'ready'; notice?: string };

const KIND_ICON: Record<CleanupKind, typeof Merge> = { merge: Merge, category: Shapes, note: SpellCheck };

export const CleanupSheet: React.FC<CleanupSheetProps> = ({ isOpen, onClose, state, setState, onToast }) => {
  const t = TRANSLATIONS[state.language];
  const [phase, setPhase] = useState<Phase>({ name: 'working', done: 0, total: 0 });
  const [suggestions, setSuggestions] = useState<CleanupSuggestion[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  // Snapshot at open: the review list must not shift while the user reads it.
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (!isOpen) return;
    const signal = { cancelled: false };
    const { transactions, categories, language } = stateRef.current;
    setPhase({ name: 'working', done: 0, total: 0 });
    setSuggestions([]);

    const habit = habitSuggestions(transactions, categories);
    const covered = new Set(habit.flatMap(s => s.changes.map(c => c.transactionId)));
    const plan = buildCleanupPlan(transactions, categories, covered);

    void (async () => {
      const result = plan.batches.length
        ? await runCleanupBatches(plan.batches, categories, language, (done, total) => {
            if (!signal.cancelled) setPhase({ name: 'working', done, total });
          }, signal)
        : ({ ok: true, value: [] } as const);
      if (signal.cancelled) return;
      const ai = result.ok ? aiSuggestions(result.value, plan, categories, covered) : [];
      const all = combineSuggestions(habit, ai);
      setSuggestions(all);
      setSelected(new Set(all.map(s => s.id)));
      const notice = result.ok
        ? undefined
        : result.reason === 'quota'
          ? t.cleanupQuota
          : result.reason === 'offline' || result.reason === 'network'
            ? t.cleanupOffline
            : t.cleanupFailed;
      setPhase({ name: 'ready', notice });
    })();
    return () => {
      signal.cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per opening
  }, [isOpen]);

  const groups = useMemo(() => {
    const order: CleanupKind[] = ['merge', 'category', 'note'];
    return order
      .map(kind => ({ kind, items: suggestions.filter(s => s.kind === kind) }))
      .filter(group => group.items.length > 0);
  }, [suggestions]);

  const selectedCount = useMemo(
    () => new Set(suggestions.filter(s => selected.has(s.id)).flatMap(s => s.changes.map(c => c.transactionId))).size,
    [suggestions, selected],
  );

  const toggle = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const apply = async () => {
    const chosen = suggestions.filter(s => selected.has(s.id));
    if (chosen.length === 0) return;
    setApplying(true);
    let applied: AppliedCleanup = { updated: [], originals: [] };
    const { rows, synced } = await commitTransactionChanges(setState, current => {
      applied = applyCleanup(current, chosen);
      return applied.updated;
    });
    setApplying(false);
    onClose();
    if (rows.length === 0) return;
    const snapshot = applied;
    onToast?.(!synced ? t.cleanupSyncFailed : rows.length === 1 ? t.cleanupAppliedOne : fill(t.cleanupApplied, { count: rows.length }), synced ? 'success' : 'warning', {
      label: t.undo,
      onClick: () => {
        void commitTransactionChanges(setState, current => undoCleanup(current, snapshot)).then(result => {
          if (result.rows.length > 0) onToast?.(t.cleanupUndone, 'info');
        });
      },
    });
  };

  const kindLabel: Record<CleanupKind, string> = { merge: t.cleanupMerge, category: t.cleanupCategory, note: t.cleanupNote };
  const working = phase.name === 'working';

  return (
    <GlassSheet
      isOpen={isOpen}
      onClose={onClose}
      title={t.cleanupTitle}
      closeLabel={t.close}
      footer={
        !working && suggestions.length > 0 ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSelected(selected.size > 0 ? new Set() : new Set(suggestions.map(s => s.id)))}
              className="h-12 shrink-0 rounded-full bg-chip px-4 text-[14px] font-semibold"
            >
              {selected.size > 0 ? t.cleanupSelectNone : t.selectAll}
            </button>
            <button
              type="button"
              onClick={() => void apply()}
              disabled={selectedCount === 0 || applying}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-accent text-[15px] font-semibold text-on-accent disabled:opacity-50"
            >
              {applying && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
              {fill(t.cleanupApply, { count: selectedCount })}
            </button>
          </div>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4" aria-busy={working}>
        {working && (
          <div className="flex flex-col items-center gap-3 py-10 text-center" role="status" aria-live="polite">
            <Loader2 size={28} className="animate-spin text-accent" aria-hidden="true" />
            <span className="text-[15px] font-semibold">
              {phase.total > 0 ? fill(t.cleanupChecking, { done: Math.min(phase.done + 1, phase.total), total: phase.total }) : t.cleanupLocal}
            </span>
            {phase.total > 0 && (
              <span className="block h-1.5 w-48 rounded-full bg-chip">
                <span className="block h-1.5 rounded-full bg-accent transition-[width]" style={{ width: `${(phase.done / phase.total) * 100}%` }} />
              </span>
            )}
            <p className="max-w-[300px] text-[13px] text-muted">{t.cleanupPrivacy}</p>
          </div>
        )}

        {!working && phase.notice && (
          <p className="rounded-[16px] bg-chip px-4 py-3 text-[13px] text-muted" role="status">{phase.notice}</p>
        )}

        {!working && suggestions.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-chip text-pos">
              <Check size={24} aria-hidden="true" />
            </span>
            <p className="text-[15px] font-semibold">{t.cleanupNone}</p>
          </div>
        )}

        {!working &&
          groups.map(group => {
            const Icon = KIND_ICON[group.kind];
            return (
              <section key={group.kind} className="flex flex-col gap-2">
                <h3 className="flex items-center gap-1.5 px-1 text-[13px] font-semibold uppercase tracking-wide text-faint">
                  <Icon size={14} aria-hidden="true" />
                  {kindLabel[group.kind]}
                </h3>
                <ul className="paper-tile overflow-hidden py-1">
                  {group.items.map((suggestion, index) => {
                    const count = suggestionCount(suggestion);
                    const checked = selected.has(suggestion.id);
                    const inputId = `cleanup-${index}-${group.kind}`;
                    return (
                      <li key={suggestion.id} className={clsx(index < group.items.length - 1 && 'border-b border-hair')}>
                        <label htmlFor={inputId} className="flex cursor-pointer items-start gap-3 px-4 py-3">
                          <input
                            id={inputId}
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggle(suggestion.id)}
                            className="peer sr-only"
                          />
                          <span
                            aria-hidden="true"
                            className={clsx(
                              'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2',
                              checked ? 'border-transparent bg-accent text-on-accent' : 'border-hair',
                            )}
                          >
                            {checked && <Check size={14} strokeWidth={3} />}
                          </span>
                          <span className="min-w-0 flex-1">
                            {suggestion.context && (
                              <span className="block truncate text-[13px] font-semibold text-muted">{suggestion.context}</span>
                            )}
                            <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[15px]">
                              <span className="min-w-0 break-words text-muted line-through decoration-1">
                                {suggestion.before.slice(0, 3).join(', ')}
                                {suggestion.before.length > 3 ? ` +${suggestion.before.length - 3}` : ''}
                              </span>
                              <ArrowRight size={14} className="shrink-0 text-faint" aria-hidden="true" />
                              <span className="min-w-0 break-words font-semibold">{suggestion.after}</span>
                            </span>
                            <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
                              {count === 1 ? t.cleanupCountOne : fill(t.cleanupCount, { count })}
                              {suggestion.source === 'habit' && (
                                <span className="rounded-full bg-chip px-2 py-0.5 text-[11px] font-semibold">{t.cleanupFromHabit}</span>
                              )}
                            </span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
      </div>
    </GlassSheet>
  );
};
