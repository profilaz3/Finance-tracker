import React, { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { AnimatePresence, m, useIsPresent } from 'motion/react';
import { ArrowDownLeft, ArrowLeftRight, ArrowUp, ArrowUpRight, Loader2, Mic, PenLine, Plus, ScanLine, Sparkles, Split, Square, Users, X, type LucideIcon } from 'lucide-react';
import type { AppState, TransactionType } from '../../types';
import { TRANSLATIONS } from '../../constants';
import { MOTION } from '../../config';
import { isAIAvailable, type ParsedTransaction } from '../../services/aiService';
import { parseWithHabits, transcribeWithHabits } from '../../services/smartEntry';
import { isVoiceRecordingSupported, MAX_RECORDING_MS, useVoiceRecorder, type VoiceRecording } from '../../hooks/useVoiceRecorder';
import { useDialog } from '../../hooks/useFocusTrap';
import { selectDashboardTemplates } from '../../utils/qolSuggestions';
import { CategoryGlyph } from '../ui/CategoryGlyph';
import { ON_COLOUR } from '../ui/ScreenHero';
import { money } from '../home/parts';
import { formatNumber } from '../../utils/locale';
import { localizeCategoryName } from '../../utils/systemText';
import { resolveHomeHeader } from '../../domain/homeHeader';
import { ADD_MENU_STRINGS } from './addMenuStrings';
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
  /** Expense is the everyday action and the only solid one. */
  tone?: 'solid';
}

const formatElapsed = (ms: number): string => {
  const seconds = Math.min(Math.floor(ms / 1000), MAX_RECORDING_MS / 1000);
  return `0:${String(seconds).padStart(2, '0')}`;
};

// After a voice parse the transcript stays on screen this long before the form opens.
const TRANSCRIPT_HOLD_MS = 650;
// Holding a template chip this long switches the chips to delete mode.
const TEMPLATE_HOLD_MS = 500;
// The ways appear one after another in reading order.
const STAGGER_S = 0.025;
const TILE_SPRING = { type: 'spring' as const, stiffness: 520, damping: 34, mass: 0.7 };

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
 * The + button's menu: a panel in the Home header colour above the + (or below a button near the
 * top) with the ways to add an entry as a grid, your usual templates as chips, and the "type it"
 * field at the bottom. Typing hides the grid and chips so the field and keyboard have the room.
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
  const s = ADD_MENU_STRINGS[state.language];
  const dark = resolveHomeHeader(state.homeHeader).tone === 'dark';
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
  const typing = up && (focused || !!input.trim() || busy);

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

  // Reading order: the everyday ones first, Expense leading.
  const ways: Way[] = [
    { id: 'expense', icon: ArrowUpRight, label: t.expenseType, onSelect: () => close(() => manual('expense')), tone: 'solid' as const },
    { id: 'income', icon: ArrowDownLeft, label: t.incomeType, onSelect: () => close(() => manual('income')) },
    { id: 'transfer', icon: ArrowLeftRight, label: t.transferType, onSelect: () => close(() => onManual('transfer')), hidden: state.accounts.length < 2 },
    { id: 'scan', icon: ScanLine, label: t.scanReceipt, onSelect: () => close(onScanReceipt), hidden: !aiAvailable },
    { id: 'split', icon: Split, label: t.splitBill, onSelect: () => close(onSplitBill) },
    { id: 'speak', icon: Mic, label: t.speak, onSelect: toggleVoice, hidden: !aiAvailable || !voiceSupported },
  ].filter(way => !way.hidden);

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

  const templateDetail = (template: (typeof templates)[number]): string => {
    if (template.amount != null) {
      const amount = template.currency === state.baseCurrency
        ? formatNumber(template.amount, { maximumFractionDigits: 2 }, state.language)
        : money(template.amount, template.currency, state.language, true);
      const wallet = state.accounts.find(account => account.id === template.accountId)?.name;
      return [amount, wallet].filter(Boolean).join(' · ');
    }
    const category = state.categories.find(item => item.id === template.categoryId);
    return category ? localizeCategoryName(category, state.language) : '';
  };

  const tile = (way: Way, index: number) => {
    const isSpeak = way.id === 'speak';
    const stopping = isSpeak && recording;
    return (
      <m.button
        key={way.id}
        type="button"
        onClick={way.onSelect}
        disabled={isSpeak && (transcribing || voice.status === 'starting')}
        aria-pressed={isSpeak ? recording : undefined}
        aria-label={stopping ? t.voiceStop : undefined}
        initial={{ opacity: 0, y: 10, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1, transition: { ...TILE_SPRING, delay: 0.04 + index * STAGGER_S } }}
        className="flex min-w-0 flex-col items-center gap-2 rounded-[20px] px-1 py-1 text-[13px] font-semibold text-white disabled:opacity-50"
      >
        <span
          ref={isSpeak ? element => { voice.levelRef.current = element; } : undefined}
          className="relative flex h-14 w-14 items-center justify-center"
          style={isSpeak ? { ['--voice-level' as string]: 0 } : undefined}
          aria-hidden="true"
        >
          {stopping && (
            <>
              <span
                className="pointer-events-none absolute inset-0 rounded-full bg-white/25"
                style={{ transform: 'scale(calc(1 + var(--voice-level) * 0.6))', transition: 'transform 90ms linear' }}
              />
              <span className="pointer-events-none absolute inset-0 animate-ping rounded-full bg-white/15 motion-reduce:hidden" />
            </>
          )}
          <span
            className={clsx(
              'relative flex h-14 w-14 items-center justify-center rounded-full',
              stopping ? 'bg-neg text-white'
                : way.tone === 'solid' ? 'bg-white text-[#0B0D0C] shadow-[0_10px_22px_-10px_rgba(0,0,0,0.45)]'
                  : clsx(ON_COLOUR, 'text-white'),
            )}
          >
            {stopping ? <Square size={18} fill="currentColor" /> : <way.icon size={23} strokeWidth={2.2} />}
          </span>
        </span>
        <span className="max-w-full truncate">{stopping ? s.stop : way.label}</span>
      </m.button>
    );
  };

  const usual = templates.length > 0 ? (
    <div>
      <div className="flex min-h-10 items-center justify-between gap-3 px-1">
        <span className={clsx('min-w-0 truncate text-[12px] font-semibold', editingTemplates ? 'text-white/80' : 'uppercase tracking-[0.06em] text-white/60')}>
          {editingTemplates ? t.templatesEditHint : s.yourUsual}
        </span>
        <button
          type="button"
          onClick={() => setEditingTemplates(editing => !editing)}
          aria-pressed={editingTemplates}
          aria-label={editingTemplates ? t.done : t.editTemplates}
          className="-mr-2 flex h-10 shrink-0 items-center rounded-full px-3 text-[13px] font-semibold text-white/85"
        >
          {editingTemplates ? t.done : t.edit}
        </button>
      </div>
      <div className="scrollbar-none -mx-3.5 mt-1 flex gap-2 overflow-x-auto px-3.5 pb-0.5">
        {templates.map(template => {
          const detail = templateDetail(template);
          return (
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
                ON_COLOUR,
                'flex h-11 max-w-[260px] shrink-0 select-none items-center gap-2 rounded-full pl-1.5 pr-3.5 text-[14.5px] font-semibold text-white [-webkit-touch-callout:none]',
                editingTemplates && '!ring-2 !ring-white/70',
              )}
            >
              <CategoryGlyph category={state.categories.find(category => category.id === template.categoryId)} size={30} shape="circle" tone="solid" />
              <span className="min-w-0 truncate">{template.name}</span>
              {editingTemplates ? (
                <X size={16} aria-hidden="true" className="shrink-0" />
              ) : detail && (
                <span className="shrink-0 whitespace-nowrap text-[13px] font-medium tabular-nums text-white/60">{detail}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  ) : null;

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
          'flex h-14 items-center gap-2.5 rounded-[18px] bg-white pl-4 pr-1.5 text-[#111] shadow-[0_8px_24px_-14px_rgba(0,0,0,0.5)] transition-shadow',
          recording ? 'ring-2 ring-neg/60' : focused && 'ring-2 ring-white/70',
        )}
      >
        {busy
          ? <Loader2 size={20} aria-hidden="true" className="shrink-0 animate-spin text-accent" />
          : <Sparkles size={20} aria-hidden="true" className="shrink-0 text-accent" />}
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
            : s.typeIt
          }
          readOnly={recording || transcribing}
          autoComplete="off"
          enterKeyHint="go"
          className="h-11 min-w-0 flex-1 bg-transparent text-[16px] text-[#111] caret-accent placeholder:text-[#6B6F6D] focus:outline-none"
        />
        {recording ? (
          <button
            type="button"
            onClick={toggleVoice}
            aria-label={t.voiceStop}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-neg text-white"
          >
            <Square size={15} fill="currentColor" aria-hidden="true" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim() || busy}
            aria-label={t.fillIn}
            title={t.fillIn}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[image:var(--accent-card)] text-white disabled:opacity-35"
          >
            {parsing ? <Loader2 size={19} className="animate-spin" aria-hidden="true" /> : <ArrowUp size={20} strokeWidth={2.4} aria-hidden="true" />}
          </button>
        )}
      </div>
      <span className="sr-only" aria-live="polite">{recording ? t.listening : transcribing ? t.voiceTranscribing : ''}</span>
    </form>
  ) : null;

  const message = error ?? voiceError;
  const feedback = message || carriesText ? (
    <div className="flex flex-wrap items-center gap-2">
      {message && (
        <p role="alert" className="min-w-0 flex-1 rounded-[16px] bg-white/[0.12] px-3.5 py-2.5 text-[13.5px] font-medium text-white">
          {message}
        </p>
      )}
      {carriesText && (
        <button
          type="button"
          onClick={() => close(() => enterManually('expense'))}
          className={clsx(ON_COLOUR, 'flex h-11 items-center gap-1.5 rounded-full px-4 text-[14px] font-semibold text-white')}
        >
          <PenLine size={16} aria-hidden="true" />
          {t.enterManually}
        </button>
      )}
    </div>
  ) : null;

  const workspaceChip = workspaceName ? (
    <span
      className={clsx(ON_COLOUR, 'flex h-8 max-w-[220px] items-center gap-1.5 self-start rounded-full px-3 text-[13px] font-semibold text-white')}
      title={`${t.workspace}: ${workspaceName}`}
    >
      <Users size={14} aria-hidden="true" className="shrink-0" />
      <span className="sr-only">{t.workspace}: </span>
      <span className="truncate">{workspaceName}</span>
    </span>
  ) : null;

  // The panel's left edge, so its pointer can sit over the centre of the + below it.
  const panelLeft = up ? viewport.width - placement.right - placement.width : placement.left;
  const pointerX = up && placement.fab
    ? Math.min(Math.max(placement.fab.left + placement.fab.width / 2 - panelLeft, 30), placement.width - 30)
    : null;

  const panel = (
    <m.div
      initial={{ opacity: 0, y: up ? 14 : -8, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: up ? 10 : -6, scale: 0.97, transition: { duration: 0.14 } }}
      transition={MOTION.modal.spring}
      className={clsx(
        'hero-bg absolute flex flex-col rounded-[30px] shadow-[0_0_0_1px_rgba(255,255,255,0.1),0_30px_60px_-20px_rgba(0,0,0,0.7)]',
        dark && 'hero-dark',
      )}
      style={up
        ? {
          right: placement.right,
          bottom: placement.bottom,
          width: placement.width,
          maxHeight: `calc(${placement.maxHeight}px - env(safe-area-inset-top))`,
          transformOrigin: pointerX !== null ? `${pointerX}px calc(100% + 20px)` : '100% 100%',
        }
        : { left: placement.left, top: placement.top, width: placement.width, maxHeight: placement.maxHeight, transformOrigin: '24px 0' }}
    >
      <div className="flex min-h-0 flex-col gap-3.5 overflow-y-auto overscroll-contain rounded-[30px] px-3.5 pb-3.5 pt-4 [scrollbar-width:none]">
        <AnimatePresence initial={false}>
          {!typing && (
            <m.div
              key="ways"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 520, damping: 44 }}
              className="-mx-3.5 overflow-hidden px-3.5"
            >
              <div className="flex flex-col gap-3.5">
                {workspaceChip}
                <div className="grid grid-cols-3 gap-y-3.5">{ways.map(tile)}</div>
                {usual && (
                  <>
                    <div className="mx-1 h-px bg-white/[0.14]" aria-hidden="true" />
                    {usual}
                  </>
                )}
              </div>
            </m.div>
          )}
        </AnimatePresence>
        {feedback}
        {field}
      </div>
      {pointerX !== null && (
        <span
          aria-hidden="true"
          className={clsx('absolute -bottom-[7px] h-4 w-4 rotate-45 rounded-[3px]', dark && 'bg-[#0e100f]')}
          // The header colour is a gradient: zoom in on its bottom right end, where the + sits.
          style={dark ? { left: pointerX - 8 } : { left: pointerX - 8, backgroundImage: 'var(--accent-card)', backgroundSize: '2000% 2000%', backgroundPosition: '100% 100%' }}
        />
      )}
    </m.div>
  );

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

      {panel}

      {up && placement.fab && (
        // Covers the + it rose from (now under the scrim) and turns it into the close button.
        <button
          type="button"
          onClick={() => close()}
          aria-label={t.close}
          title={t.close}
          style={{ left: placement.fab.left, top: placement.fab.top, width: placement.fab.width, height: placement.fab.height }}
          className="absolute flex items-center justify-center rounded-full bg-white text-[#0B0D0C] shadow-[0_12px_28px_-12px_rgba(0,0,0,0.55)]"
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
