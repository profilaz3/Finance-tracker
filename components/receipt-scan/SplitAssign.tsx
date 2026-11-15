import React, { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { AlertCircle, Info, Loader2, Mic, Plus, Sparkles, Square, UserPlus, Wallet } from 'lucide-react';
import type { Currency, Person } from '../../types';
import { TRANSLATIONS } from '../../constants';
import { formatMoney } from '../../utils/locale';
import { Avatar } from '../home/parts';
import { stableColor } from '../../utils/stableColor';
import { isVoiceRecordingSupported, useVoiceRecorder, type VoiceRecording } from '../../hooks/useVoiceRecorder';
import { isAIAvailable } from '../../services/aiService';
import { assignReceiptSplit, transcribeInstruction, type SplitAiFailure } from '../../services/splitAssignService';
import {
  computeSplitTotals,
  matchPersonName,
  NEW_PERSON_PREFIX,
  replacePersonId,
  SELF_ID,
  toggleItemPerson,
  type AssignResult,
  type SplitItem,
} from '../../domain/receiptSplit';

interface SplitAssignProps {
  items: SplitItem[];
  receiptTotal: number;
  currency: Currency;
  language: 'en' | 'sr';
  /** People to split with; the user's own profile is already left out (it is "me"). */
  people: Person[];
  /** The user's profile, for the "me" avatar. */
  selfProfile?: Person;
  /** Adds a person by name; once they appear in `people`, the pending name resolves to them. */
  onAddPerson?: (name: string) => Promise<void>;
  onContinue: (split: { payerId: string; amounts: Record<string, number> }) => void;
}

const formatElapsed = (ms: number) => {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

/** Says who had which receipt line (typed, spoken or tapped) and shows what each person owes. */
export const SplitAssign: React.FC<SplitAssignProps> = ({
  items,
  receiptTotal,
  currency,
  language,
  people,
  selfProfile,
  onAddPerson,
  onContinue,
}) => {
  const t = TRANSLATIONS[language];
  const [result, setResult] = useState<AssignResult>(() => ({
    assignments: items.map(item => ({ itemId: item.id, personIds: [SELF_ID] })),
    payerId: SELF_ID,
    unknownNames: [],
    notes: '',
    guessedItemIds: [],
  }));
  const [extraIds, setExtraIds] = useState<string[]>([]);
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState<'assign' | 'transcribe' | null>(null);
  const [failure, setFailure] = useState<SplitAiFailure | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [addingName, setAddingName] = useState<string | null>(null);
  const aiAvailable = isAIAvailable();
  const voiceSupported = aiAvailable && isVoiceRecordingSupported();

  const personById = useMemo(() => new Map(people.map(person => [person.id, person])), [people]);

  // A pending name ("new:Marko") resolves as soon as a matching person exists, e.g. right after "Add Marko".
  useEffect(() => {
    if (result.unknownNames.length === 0) return;
    let next = result;
    for (const name of result.unknownNames) {
      const match = matchPersonName(name, people);
      if (match) next = replacePersonId(next, `${NEW_PERSON_PREFIX}${name}`, match.id);
    }
    if (next !== result) setResult(next);
  }, [people, result]);

  const runAssign = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy('assign');
    setFailure(null);
    const response = await assignReceiptSplit(items, people.map(({ id, name }) => ({ id, name })), trimmed, language);
    setBusy(null);
    if (!response.ok) {
      setFailure(response.reason);
      return;
    }
    setResult(response.value);
    setExtraIds([]);
  };

  const handleRecording = async (recording: VoiceRecording) => {
    setBusy('transcribe');
    setFailure(null);
    const response = await transcribeInstruction(recording, language);
    setBusy(null);
    if (!response.ok) {
      setFailure(response.reason);
      return;
    }
    setInstruction(response.value);
    await runAssign(response.value);
  };
  const voice = useVoiceRecorder(recording => void handleRecording(recording));
  const recording = voice.status !== 'idle';

  // Everyone on the split: me, whoever the assignment names, the payer, and people added by hand.
  const roster = useMemo(() => {
    const ids = [SELF_ID, ...result.assignments.flatMap(entry => entry.personIds), result.payerId, ...extraIds];
    return [...new Set(ids)];
  }, [result, extraIds]);

  const totals = useMemo(
    () => computeSplitTotals({ items, assignments: result.assignments, receiptTotal, currency, payerId: result.payerId }),
    [items, result, receiptTotal, currency],
  );

  const describe = (id: string): { name: string; color: string; image?: string; pending?: boolean } => {
    if (id === SELF_ID) return { name: t.me, color: selfProfile?.color || 'rgb(var(--accent-rgb))', image: selfProfile?.avatar };
    if (id.startsWith(NEW_PERSON_PREFIX)) return { name: id.slice(NEW_PERSON_PREFIX.length), color: 'var(--paper-muted)', pending: true };
    const person = personById.get(id);
    return { name: person?.name ?? '?', color: person?.color || stableColor(person?.name ?? '?'), image: person?.avatar };
  };

  const notOnSplit = people.filter(person => !roster.includes(person.id));
  const othersOwing = totals.order.some(id => id !== result.payerId && (totals.amounts[id] ?? 0) > 0);
  const blocker = result.unknownNames.length > 0
    ? t.splitResolveFirst.replace('{name}', result.unknownNames[0])
    : !othersOwing ? t.splitNeedsPeople : null;

  const failureMessage = failure === 'quota' ? t.splitAiQuota : failure === 'offline' || failure === 'network' ? t.splitAiOffline : failure ? t.splitAiFailed : null;
  const voiceError = voice.error === 'denied' ? t.voiceMicDenied
    : voice.error === 'unavailable' ? t.voiceMicUnavailable
    : voice.error === 'empty' ? t.voiceHeardNothing
    : null;

  const addPersonNamed = async (name: string) => {
    if (!onAddPerson || addingName) return;
    setAddingName(name);
    try {
      await onAddPerson(name);
    } finally {
      setAddingName(null);
    }
  };

  /** Avatar chip. `pick` chips (choose someone) look plain; toggles fade out when off. */
  const chip = (id: string, pressed: boolean, onClick: () => void, label: string, size = 30, pick = false) => {
    const info = describe(id);
    return (
      <button
        key={id}
        type="button"
        onClick={onClick}
        aria-pressed={pick ? undefined : pressed}
        aria-label={label}
        title={info.name}
        className={clsx(
          'flex shrink-0 items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-2.5 text-[13px] font-semibold outline-none transition-all focus-visible:ring-2 focus-visible:ring-accent',
          pressed ? 'bg-accent-soft text-on-surface shadow-[inset_0_0_0_1.5px_rgb(var(--accent-rgb))]'
            : pick ? 'bg-chip text-on-surface' : 'bg-chip text-faint',
        )}
      >
        <span className={clsx('transition-opacity', !pressed && !pick && 'opacity-35 grayscale')}>
          <Avatar name={info.name} color={info.color} image={info.image} size={size} />
        </span>
        <span className={clsx('max-w-[84px] truncate', info.pending && 'italic')}>{info.name}</span>
      </button>
    );
  };

  return (
    <div className="space-y-4">
      {aiAvailable && (
        <div className="paper-tile p-4">
          <label htmlFor="split-instruction" className="mb-2 block text-[15px] font-semibold">{t.splitHowPrompt}</label>
          <textarea
            id="split-instruction"
            value={instruction}
            onChange={event => setInstruction(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void runAssign(instruction);
              }
            }}
            readOnly={recording || busy !== null}
            rows={3}
            maxLength={600}
            placeholder={t.splitHowPlaceholder}
            className="w-full resize-none rounded-[14px] border-none bg-chip px-3 py-2.5 text-[15px] text-on-surface placeholder:text-faint outline-none focus:ring-2 focus:ring-accent"
          />
          <div className="mt-2.5 flex items-center gap-2">
            {voiceSupported && (
              <span
                ref={element => { voice.levelRef.current = element; }}
                className="relative flex h-10 w-10 shrink-0 items-center justify-center"
                style={{ ['--voice-level' as string]: 0 }}
              >
                {recording && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 rounded-full bg-neg/25"
                    style={{ transform: 'scale(calc(1 + var(--voice-level) * 0.75))', transition: 'transform 90ms linear' }}
                  />
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (recording) {
                      voice.stop();
                      return;
                    }
                    voice.clearError();
                    setFailure(null);
                    void voice.start();
                  }}
                  disabled={busy !== null || voice.status === 'starting'}
                  aria-label={recording ? t.voiceStop : t.splitSpeak}
                  aria-pressed={recording}
                  className={clsx(
                    'relative flex h-10 w-10 items-center justify-center rounded-full transition-colors disabled:opacity-50',
                    recording ? 'bg-neg text-white' : 'bg-chip text-muted',
                  )}
                >
                  {recording ? <Square size={14} fill="currentColor" aria-hidden="true" /> : <Mic size={18} aria-hidden="true" />}
                </button>
              </span>
            )}
            <span className="min-w-0 flex-1 truncate text-[13px] text-muted" aria-live="polite">
              {recording ? t.voiceTapToStop.replace('{time}', formatElapsed(voice.elapsedMs))
                : busy === 'transcribe' ? t.voiceTranscribing
                : busy === 'assign' ? t.splitAssigning
                : ''}
            </span>
            <button
              type="button"
              onClick={() => void runAssign(instruction)}
              disabled={!instruction.trim() || busy !== null || recording}
              className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-accent px-4 text-[14px] font-semibold text-on-accent disabled:opacity-40"
            >
              {busy === 'assign' ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Sparkles size={16} aria-hidden="true" />}
              {t.splitAssign}
            </button>
          </div>
          {(failureMessage ?? voiceError) && (
            <p role="alert" className="mt-2 flex items-start gap-1.5 text-[13px] font-medium text-neg">
              <AlertCircle size={15} className="mt-px shrink-0" aria-hidden="true" />
              {failureMessage ?? voiceError}
            </p>
          )}
        </div>
      )}

      {/* Names the AI could not match: pick an existing person or add a new one. */}
      {result.unknownNames.map(name => (
        <div key={name} className="rounded-[18px] bg-accent-soft/60 p-3.5">
          <p className="mb-2 text-[15px] font-semibold">{t.splitWhoIs.replace('{name}', name)}</p>
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 custom-scrollbar">
            {onAddPerson && (
              <button
                type="button"
                onClick={() => void addPersonNamed(name)}
                disabled={addingName !== null}
                className="flex h-[34px] shrink-0 items-center gap-1.5 rounded-full bg-accent px-3 text-[13px] font-semibold text-on-accent disabled:opacity-60"
              >
                {addingName === name ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <UserPlus size={15} aria-hidden="true" />}
                {t.splitAddNamed.replace('{name}', name)}
              </button>
            )}
            {people
              .filter(person => !roster.includes(person.id))
              .map(person => chip(person.id, false, () => setResult(prev => replacePersonId(prev, `${NEW_PERSON_PREFIX}${name}`, person.id)), person.name, 30, true))}
          </div>
        </div>
      ))}

      {result.notes && (
        <div role="status" className="flex items-start gap-2 rounded-[16px] bg-chip px-4 py-3">
          <Info className="mt-0.5 shrink-0 text-muted" size={18} aria-hidden="true" />
          <p className="text-[14px] text-on-surface">{result.notes}</p>
        </div>
      )}

      {/* Items with who had them */}
      <div className="paper-tile p-4">
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h4 className="text-[13px] font-semibold text-muted">{t.items}</h4>
            <p className="text-[12px] text-faint">{t.splitItemsHint}</p>
          </div>
          <button
            type="button"
            onClick={() => setIsPickerOpen(open => !open)}
            aria-expanded={isPickerOpen}
            disabled={notOnSplit.length === 0}
            className="flex h-8 shrink-0 items-center gap-1 rounded-full bg-accent-soft px-3 text-[13px] font-semibold text-accent disabled:opacity-40"
          >
            <Plus size={15} aria-hidden="true" />
            {t.splitAddToSplit}
          </button>
        </div>
        {isPickerOpen && notOnSplit.length > 0 && (
          <div className="-mx-1 mb-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-1 custom-scrollbar">
            {notOnSplit.map(person => chip(person.id, false, () => {
              setExtraIds(prev => [...prev, person.id]);
              setIsPickerOpen(false);
            }, person.name, 30, true))}
          </div>
        )}
        <div className="divide-y divide-hair">
          {items.map(item => {
            const assigned = result.assignments.find(entry => entry.itemId === item.id)?.personIds ?? [];
            const hint = assigned.length === 0 ? t.splitUnassigned : result.guessedItemIds.includes(item.id) ? t.splitGuessed : null;
            return (
              <div key={item.id} className="py-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 text-[14px] font-medium">
                    {item.quantity !== 1 && <span className="tabular-nums text-muted">{item.quantity}× </span>}
                    {item.name}
                  </span>
                  <span className="shrink-0 text-[14px] font-semibold tabular-nums">{formatMoney(item.total, currency, language)}</span>
                </div>
                {hint && <p className="mt-0.5 text-[12px] font-medium text-accent">{hint}</p>}
                <div className="-mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-0.5 custom-scrollbar">
                  {roster.map(id => chip(
                    id,
                    assigned.includes(id),
                    () => setResult(prev => ({
                      ...prev,
                      assignments: toggleItemPerson(prev.assignments, item.id, id),
                      guessedItemIds: prev.guessedItemIds.filter(guessed => guessed !== item.id),
                    })),
                    t.splitToggle.replace('{person}', describe(id).name).replace('{item}', item.name),
                    24,
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Who pays */}
      <div className="paper-tile p-4">
        <h4 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-muted">
          <Wallet size={14} aria-hidden="true" />
          {t.splitPaidBy}
        </h4>
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 custom-scrollbar" role="group" aria-label={t.splitPaidBy}>
          {roster.map(id => chip(id, result.payerId === id, () => setResult(prev => ({ ...prev, payerId: id })), describe(id).name))}
        </div>
      </div>

      {/* Per-person totals; they always add up to the receipt total. */}
      <div className="paper-tile p-4">
        <h4 className="mb-1 text-[13px] font-semibold text-muted">{t.splitPerPerson}</h4>
        <div className="divide-y divide-hair">
          {totals.order.map(id => {
            const info = describe(id);
            return (
              <div key={id} className="flex items-center gap-3 py-2">
                <Avatar name={info.name} color={info.color} image={info.image} size={32} />
                <span className={clsx('min-w-0 flex-1 truncate text-[15px] font-semibold', info.pending && 'italic')}>
                  {info.name}
                  {id === result.payerId && <span className="ml-2 rounded-full bg-chip px-2 py-0.5 text-[11px] font-semibold text-muted">{t.splitPaidBy}</span>}
                </span>
                <span className="shrink-0 text-[15px] font-bold tabular-nums">{formatMoney(totals.amounts[id] ?? 0, currency, language)}</span>
              </div>
            );
          })}
          <div className="flex items-center justify-between pt-2.5">
            <span className="text-[14px] text-muted">{t.total}</span>
            <span className="text-[15px] font-bold tabular-nums">{formatMoney(receiptTotal, currency, language)}</span>
          </div>
        </div>
        {Math.abs(totals.adjustment) >= 0.01 && (
          <p className="mt-2 text-[12px] text-faint">
            {t.splitAdjustment.replace('{amount}', formatMoney(totals.adjustment, currency, language))}
          </p>
        )}
      </div>

      {blocker && <p className="px-1 text-center text-[13px] font-medium text-muted" role="status">{blocker}</p>}
      <button
        type="button"
        onClick={() => onContinue({ payerId: result.payerId, amounts: totals.amounts })}
        disabled={blocker !== null || busy !== null}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-accent text-[16px] font-semibold text-on-accent disabled:opacity-40"
      >
        {t.splitContinue}
      </button>
    </div>
  );
};
