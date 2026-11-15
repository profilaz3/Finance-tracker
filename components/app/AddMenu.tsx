import React, { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { AnimatePresence, m, useIsPresent } from 'motion/react';
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Camera, Loader2, Mic, PenLine, Plus, Sparkles, Split, Square, Users, X, type LucideIcon } from 'lucide-react';
import type { AppState, TransactionType } from '../../types';
import { TRANSLATIONS } from '../../constants';
import { MOTION } from '../../config';
import { isAIAvailable, type ParsedTransaction } from '../../services/aiService';
import { parseWithHabits, transcribeWithHabits } from '../../services/smartEntry';
import { isVoiceRecordingSupported, MAX_RECORDING_MS, useVoiceRecorder, type VoiceRecording } from '../../hooks/useVoiceRecorder';
import { useDialog } from '../../hooks/useFocusTrap';
import { selectDashboardTemplates } from '../../utils/qolSuggestions';
import { CategoryGlyph } from '../ui/CategoryGlyph';
import { lgStyle } from '../ui/LiquidGlassDefs';
import { money } from '../home/parts';
import { defaultCategoryId, splitAmountFromText, type EntryKind } from '../../domain/transactions';
import { requestTemplateDelete } from '../../hooks/entryBus';
import { findAddTrigger, placeAddMenu, type AnchorRect } from './addMenuPlacement';

interface AddMenuProps {
  isOpen: boolean;
  onClose: () => void;
  /** The button that opened the menu; null grows it from whichever Add button is on screen. */
  anchor: HTMLElement | null;
  state: AppState;
  onParsed: (parsed: ParsedTransaction) => void;
  /** Method syntax on purpose: callers typed for expense/income still accept 'transfer' and pass it on. */
  onManual(type: EntryKind): void;
  onScanReceipt: () => void;
  onSplitBill: () => void;
  onUseTemplate: (templateId: string) => void;
  /** Which workspace new entries go to; shown only when the person belongs to a team. */
  workspaceName?: string;
}

interface Way {
  id: string;
  icon: LucideIcon;
  label: string;
  onSelect: () => void;
  /** Expense is the everyday action and the only solid one; income reads green like income amounts. */
  tone?: 'solid' | 'pos';
}

const formatElapsed = (ms: number): string => {
  const seconds = Math.min(Math.floor(ms / 1000), MAX_RECORDING_MS / 1000);
  return `0:${String(seconds).padStart(2, '0')}`;
};

// After a voice parse the transcript stays on screen this long before the form opens.
const TRANSCRIPT_HOLD_MS = 650;
// Holding a template chip this long switches the chips to delete mode.
const TEMPLATE_HOLD_MS = 500;
// Each way rises a beat after the one below it, nearest the + first.
const STAGGER_S = 0.03;
const RISE_SPRING = { type: 'spring' as const, stiffness: 520, damping: 34, mass: 0.7 };

const rise = {
  hidden: { opacity: 0, y: 14, scale: 0.92 },
  shown: (step: number) => ({ opacity: 1, y: 0, scale: 1, transition: { ...RISE_SPRING, delay: step * STAGGER_S } }),
  gone: { opacity: 0, y: 8, scale: 0.96, transition: { duration: 0.12 } },
};

const measure = (anchor: HTMLElement | null): AnchorRect | null => {
  const rect = findAddTrigger(anchor)?.getBoundingClientRect();
  return rect ? { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height } : null;
};

const readViewport = () => ({ width: window.innerWidth, height: window.innerHeight });

/**
 * How much of the layout viewport the on-screen keyboard covers. Chrome on Android only shrinks
 * the visual viewport for it, so fixed things at the bottom would sit under the keys; where the
 * page itself resizes (the app's WebView) this stays 0 and the resize moves everything instead.
 */
const useKeyboardInset = (): number => {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => {
      // Pinch zoom shrinks the visual viewport too; that is not a keyboard.
      if (viewport.scale > 1.01) return;
      setInset(Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop)));
    };
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
    };
  }, []);
  return inset;
};

/**
 * The + button's menu: the ways to add an entry rise from the button, Expense nearest the thumb,
 * with the "type or say it" field at the bottom and recent templates on top. Typing hides the
 * list so the field and keyboard have the room.
 */
export const AddMenu: React.FC<AddMenuProps> = ({ isOpen, ...rest }) => (
  <AnimatePresence>{isOpen && <AddMenuPanel isOpen {...rest} />}</AnimatePresence>
);

const AddMenuPanel: React.FC<AddMenuProps> = ({
  onClose,
  anchor,
  state,
  onParsed,
  onManual,
  onScanReceipt,
  onSplitBill,
  onUseTemplate,
  workspaceName,
}) => {
  const t = TRANSLATIONS[state.language];
  const { dialogProps, titleId } = useDialog(true, onClose);
  // False while the menu animates out: late voice or parse results must not open the form then.
  const present = useIsPresent();
  const presentRef = useRef(present);
  presentRef.current = present;
  const stateRef = useRef(state);
  stateRef.current = state;

  const keyboard = useKeyboardInset();
  const [rect, setRect] = useState(() => measure(anchor));
  const [viewport, setViewport] = useState(readViewport);
  useEffect(() => {
    const update = () => {
      setRect(measure(anchor));
      setViewport(readViewport());
    };
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [anchor]);
  const placement = placeAddMenu(rect, viewport, keyboard);
  const up = placement.direction === 'up';

  const [input, setInput] = useState('');
  const [focused, setFocused] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  // The text could not be read: the manual form opens with it instead of an empty one.
  const [parseFailed, setParseFailed] = useState(false);
  const [editingTemplates, setEditingTemplates] = useState(false);
  const holdTimer = useRef<number | null>(null);
  const heldTemplate = useRef(false);
  const aiAvailable = isAIAvailable();
  const voiceSupported = isVoiceRecordingSupported();
  const templates = selectDashboardTemplates(state.templates, 4);

  const close = (then?: () => void) => {
    onClose();
    then?.();
  };

  const handleRecording = async (recording: VoiceRecording) => {
    setTranscribing(true);
    setError(null);
    try {
      const result = await transcribeWithHabits(recording, stateRef.current);
      if (!presentRef.current) return;
      if (!result) {
        setError(t.voiceFailed);
        return;
      }
      setInput(result.transcript);
      if (result.parsed) {
        const parsed = result.parsed;
        window.setTimeout(() => {
          if (!presentRef.current) return;
          close(() => onParsed(parsed));
        }, TRANSCRIPT_HOLD_MS);
      } else {
        setError(t.couldNotParse);
        setParseFailed(true);
      }
    } catch (voiceError) {
      console.error('Voice entry failed:', voiceError);
      if (presentRef.current) setError(t.voiceFailed);
    } finally {
      setTranscribing(false);
    }
  };

  const voice = useVoiceRecorder(recording => void handleRecording(recording));
  const recording = voice.status !== 'idle';
  const voiceError = voice.error === 'denied' ? t.voiceMicDenied
    : voice.error === 'unavailable' ? t.voiceMicUnavailable
    : voice.error === 'empty' ? t.voiceHeardNothing
    : null;

  const submit = async () => {
    const text = input.trim();
    if (!text || parsing) return;
    setParsing(true);
    setError(null);
    try {
      const result = await parseWithHabits(text, state);
      if (!presentRef.current) return;
      if (result) {
        close(() => onParsed(result));
      } else {
        setError(t.couldNotParse);
        setParseFailed(true);
      }
    } catch (parseError) {
      console.error('Smart parsing failed:', parseError);
      if (presentRef.current) {
        setError(t.couldNotParse);
        setParseFailed(true);
      }
    } finally {
      setParsing(false);
    }
  };

  const toggleVoice = () => {
    if (recording) {
      voice.stop();
      return;
    }
    setError(null);
    voice.clearError();
    void voice.start();
  };

  const busy = parsing || transcribing;
  const carriesText = parseFailed && !!input.trim();
  // On a phone the keyboard takes half the screen: while typing, only the field stays.
  const typing = up && (focused || !!input.trim() || busy || recording);

  /** Opens the form with what the unreadable text still says: its amount, the rest as the note. */
  const enterManually = (type: TransactionType) => {
    const { amount, note } = splitAmountFromText(input, state.language);
    const category = state.categories.find(c => c.id === defaultCategoryId(type, state.categories, state.transactions));
    onParsed({
      amount,
      currency: state.accounts[0]?.currency ?? state.baseCurrency,
      categoryName: category?.name ?? '',
      type,
      note,
      date: new Date().toISOString(),
    });
  };

  const manual = (type: TransactionType) => (carriesText ? enterManually(type) : onManual(type));

  // Top to bottom as they rise: the everyday ones end up nearest the +.
  const ways: Way[] = [
    { id: 'transfer', icon: ArrowLeftRight, label: t.transferType, onSelect: () => onManual('transfer'), hidden: state.accounts.length < 2 },
    { id: 'split', icon: Split, label: t.splitBill, onSelect: onSplitBill },
    { id: 'income', icon: ArrowDownLeft, label: t.incomeType, onSelect: () => manual('income'), tone: 'pos' as const },
    { id: 'scan', icon: Camera, label: t.scanReceipt, onSelect: onScanReceipt, hidden: !aiAvailable },
    { id: 'expense', icon: ArrowUpRight, label: t.expenseType, onSelect: () => manual('expense'), tone: 'solid' as const },
  ].filter(way => !way.hidden);
  // Dropping from a button at the top, the order flips so Expense is still nearest.
  const orderedWays = up ? ways : [...ways].reverse();

  const stopHold = () => {
    if (holdTimer.current !== null) window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };
  const startHold = () => {
    stopHold();
    heldTemplate.current = false;
    holdTimer.current = window.setTimeout(() => {
      heldTemplate.current = true;
      setEditingTemplates(true);
    }, TEMPLATE_HOLD_MS);
  };
  useEffect(() => stopHold, []);

  // Rising order: the field (step 0), then each way from the bottom up, then the templates.
  const fieldStep = 0;
  const wayStep = (index: number) => (aiAvailable ? 1 : 0) + (ways.length - 1 - index);
  const topStep = (aiAvailable ? 1 : 0) + ways.length;
  // Lines a way's icon up with the centre of the round + below it.
  const iconInset = up && placement.fab ? Math.max(0, Math.round((placement.fab.width - 48) / 2)) : 0;

  const workspaceChip = workspaceName ? (
    <span
      className={clsx(
        'flex h-8 max-w-[200px] items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-muted',
        up ? 'self-end bg-tile shadow-[var(--paper-tile-shadow)]' : 'self-start bg-chip',
      )}
      title={`${t.workspace}: ${workspaceName}`}
    >
      <Users size={14} aria-hidden="true" className="shrink-0" />
      <span className="sr-only">{t.workspace}: </span>
      <span className="truncate">{workspaceName}</span>
    </span>
  ) : null;

  const templateBlock = templates.length > 0 ? (
    <div className={clsx('flex flex-col gap-2', up && 'items-end')}>
      <div className={clsx('flex items-center gap-1', up && 'rounded-full bg-tile pl-3 shadow-[var(--paper-tile-shadow)]')}>
        <span className="text-[13px] font-semibold text-muted">{editingTemplates ? t.templatesEditHint : t.again}</span>
        <button
          type="button"
          onClick={() => setEditingTemplates(editing => !editing)}
          aria-pressed={editingTemplates}
          aria-label={editingTemplates ? t.done : t.editTemplates}
          className="flex h-10 shrink-0 items-center rounded-full px-3 text-[13px] font-semibold text-accent"
        >
          {editingTemplates ? t.done : t.edit}
        </button>
      </div>
      <div className={clsx('flex flex-wrap gap-2', up && 'justify-end')}>
        {templates.map(template => (
          <button
            key={template.id}
            type="button"
            onPointerDown={() => {
              if (editingTemplates) heldTemplate.current = false;
              else startHold();
            }}
            onPointerUp={stopHold}
            onPointerLeave={stopHold}
            onPointerCancel={stopHold}
            onContextMenu={event => event.preventDefault()}
            onClick={() => {
              if (heldTemplate.current) {
                heldTemplate.current = false;
                return;
              }
              if (editingTemplates) {
                requestTemplateDelete(template.id);
                return;
              }
              close(() => onUseTemplate(template.id));
            }}
            aria-label={editingTemplates ? t.deleteTemplateNamed.replace('{name}', template.name) : undefined}
            className={clsx(
              'flex h-10 max-w-full items-center gap-2 rounded-full pl-[7px] pr-3.5 text-sm font-semibold select-none [-webkit-touch-callout:none]',
              up ? 'bg-tile shadow-[var(--paper-tile-shadow)]' : 'bg-chip',
              editingTemplates && 'shadow-[inset_0_0_0_1.5px_var(--paper-neg)]',
            )}
          >
            <CategoryGlyph category={state.categories.find(category => category.id === template.categoryId)} size={26} className="!rounded-full" />
            <span className="truncate">{template.name}</span>
            {editingTemplates ? (
              <X size={16} aria-hidden="true" className="shrink-0 text-neg" />
            ) : template.amount != null && (
              <span className="shrink-0 font-medium text-muted">{money(template.amount, template.currency, state.language, true)}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  ) : null;

  const wayIcon = (way: Way, size: number) => (
    <span
      aria-hidden="true"
      className={clsx(
        'flex shrink-0 items-center justify-center rounded-full',
        way.tone === 'solid' ? 'bg-accent text-on-accent' : up ? 'bg-tile shadow-[var(--paper-tile-shadow)]' : 'bg-chip',
        way.tone !== 'solid' && (way.tone === 'pos' ? 'text-pos' : 'text-accent'),
      )}
      style={{ width: size, height: size }}
    >
      <way.icon size={size >= 48 ? 22 : 19} strokeWidth={2.2} />
    </span>
  );

  const field = aiAvailable ? (
    <form
      onSubmit={event => {
        event.preventDefault();
        void submit();
      }}
    >
      <label htmlFor="add-menu-describe" className="sr-only">{t.describeEntry}</label>
      <div
        className={clsx(
          'flex items-center gap-2 rounded-[26px] p-1.5 pl-4 transition-shadow',
          up ? 'bg-tile shadow-[var(--paper-tile-shadow)]' : 'paper-field',
          recording ? 'ring-2 ring-neg/40' : focused && 'ring-2 ring-accent',
        )}
      >
        {busy
          ? <Loader2 size={18} aria-hidden="true" className="shrink-0 animate-spin text-accent" />
          : <Sparkles size={18} aria-hidden="true" className="shrink-0 text-accent" />}
        <input
          id="add-menu-describe"
          data-focus-ring="parent"
          value={input}
          onChange={event => {
            setInput(event.target.value);
            if (parseFailed) setParseFailed(false);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={
            recording ? t.voiceTapToStop.replace('{time}', formatElapsed(voice.elapsedMs))
            : transcribing ? t.voiceTranscribing
            : t.typeOrSayPlaceholder
          }
          readOnly={recording || transcribing}
          autoComplete="off"
          enterKeyHint="go"
          className="h-11 min-w-0 flex-1 bg-transparent text-[16px] text-on-surface placeholder:text-faint focus:outline-none"
        />
        {voiceSupported && (
          <span
            ref={element => { voice.levelRef.current = element; }}
            className="relative flex h-10 w-10 shrink-0 items-center justify-center"
            style={{ ['--voice-level' as string]: 0 }}
          >
            {recording && (
              <>
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 rounded-full bg-neg/25"
                  style={{ transform: 'scale(calc(1 + var(--voice-level) * 0.75))', transition: 'transform 90ms linear' }}
                />
                <span aria-hidden="true" className="pointer-events-none absolute inset-0 animate-ping rounded-full bg-neg/15 motion-reduce:hidden" />
              </>
            )}
            <button
              type="button"
              onClick={toggleVoice}
              disabled={transcribing || voice.status === 'starting'}
              aria-label={recording ? t.voiceStop : t.speak}
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
        <button
          type="submit"
          disabled={!input.trim() || busy || recording}
          className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-accent px-4 text-sm font-semibold text-on-accent disabled:opacity-40"
        >
          {parsing && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
          {t.fillIn}
        </button>
      </div>
      <span className="sr-only" aria-live="polite">{recording ? t.listening : transcribing ? t.voiceTranscribing : ''}</span>
    </form>
  ) : null;

  const message = error ?? voiceError;
  const feedback = message || carriesText ? (
    <div className={clsx('flex flex-wrap items-center gap-2', up && 'justify-end')}>
      {message && (
        <p role="alert" className={clsx('text-[13px] font-medium text-neg', up && 'rounded-full bg-tile px-3.5 py-2.5 shadow-[var(--paper-tile-shadow)]')}>
          {message}
        </p>
      )}
      {carriesText && (
        <button
          type="button"
          onClick={() => close(() => enterManually('expense'))}
          className={clsx('flex h-10 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-semibold', up ? 'bg-tile shadow-[var(--paper-tile-shadow)]' : 'bg-chip')}
        >
          <PenLine size={16} aria-hidden="true" />
          {t.enterManually}
        </button>
      )}
    </div>
  ) : null;

  return (
    <div {...dialogProps} className="fixed inset-0 z-[70] outline-none">
      <h2 id={titleId} className="sr-only">{t.newEntry}</h2>
      <m.div
        className={clsx('paper-scrim absolute inset-0', up && 'backdrop-blur-[6px]')}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={MOTION.backdrop}
        onClick={() => close()}
        aria-hidden="true"
      />

      {placement.direction === 'up' ? (
        <m.div
          // Closing fades the whole column down toward the + (the ways' own exits are for typing).
          exit={{ opacity: 0, y: 10, transition: { duration: 0.14 } }}
          className="absolute flex flex-col gap-2.5"
          style={{ right: placement.right, bottom: placement.bottom, width: placement.width, maxHeight: `calc(${placement.maxHeight}px - env(safe-area-inset-top))` }}
        >
          {/* Scrolls on a short screen; the extra padding keeps tile shadows from being clipped. */}
          <div className="-m-2 flex min-h-0 flex-col gap-2.5 overflow-y-auto overscroll-contain p-2 [scrollbar-width:none]">
            <div className="mt-auto" />
            <AnimatePresence>
              {!typing && workspaceChip && (
                <m.div key="workspace" className="flex justify-end" variants={rise} custom={topStep} initial="hidden" animate="shown" exit="gone">
                  {workspaceChip}
                </m.div>
              )}
              {!typing && templateBlock && (
                <m.div key="templates" className="mb-1 origin-bottom-right" variants={rise} custom={topStep} initial="hidden" animate="shown" exit="gone">
                  {templateBlock}
                </m.div>
              )}
              {!typing && orderedWays.map((way, index) => (
                <m.button
                  key={way.id}
                  type="button"
                  onClick={() => close(way.onSelect)}
                  variants={rise}
                  custom={wayStep(index)}
                  initial="hidden"
                  animate="shown"
                  exit="gone"
                  style={{ paddingRight: iconInset }}
                  className="flex min-h-12 origin-right items-center gap-3 self-end rounded-full text-on-surface"
                >
                  <span className="flex h-10 items-center rounded-full bg-tile px-4 text-[15px] font-semibold tracking-[-0.2px] shadow-[var(--paper-tile-shadow)]">
                    {way.label}
                  </span>
                  {wayIcon(way, 48)}
                </m.button>
              ))}
            </AnimatePresence>
          </div>
          {feedback}
          {field && (
            <m.div variants={rise} custom={fieldStep} initial="hidden" animate="shown" className="origin-bottom-right">
              {field}
            </m.div>
          )}
        </m.div>
      ) : (
        <m.div
          initial={{ opacity: 0, scale: 0.96, y: -6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: -4, transition: { duration: 0.12 } }}
          transition={MOTION.modal.spring}
          className="absolute flex origin-top-left flex-col gap-3 overflow-y-auto overscroll-contain rounded-[28px] border border-hair bg-tile p-3 text-on-surface shadow-[0_18px_48px_-16px_rgba(0,0,0,0.3)]"
          style={{ left: placement.left, top: placement.top, width: placement.width, maxHeight: placement.maxHeight }}
        >
          {workspaceChip}
          {field}
          {feedback}
          <div className="flex flex-col">
            {orderedWays.map(way => (
              <button
                key={way.id}
                type="button"
                onClick={() => close(way.onSelect)}
                className="flex h-12 items-center gap-3 rounded-[18px] px-1.5 text-left text-[15px] font-semibold transition-colors hover:bg-chip"
              >
                {wayIcon(way, 36)}
                {way.label}
              </button>
            ))}
          </div>
          {templateBlock}
        </m.div>
      )}

      {placement.direction === 'up' && placement.fab && (
        // Covers the + it rose from (now under the scrim) and turns it into the close button.
        <button
          type="button"
          onClick={() => close()}
          aria-label={t.close}
          title={t.close}
          style={{ left: placement.fab.left, top: placement.fab.top, width: placement.fab.width, height: placement.fab.height, ...lgStyle('lg-fab') }}
          className="glass-accent absolute flex items-center justify-center rounded-full"
        >
          <m.span
            className="flex"
            initial={{ rotate: 0 }}
            animate={{ rotate: 45 }}
            exit={{ rotate: 0 }}
            transition={MOTION.modal.spring}
          >
            <Plus size={28} strokeWidth={2.4} aria-hidden="true" />
          </m.span>
        </button>
      )}
    </div>
  );
};
