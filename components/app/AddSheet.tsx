import React, { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { ArrowDownLeft, ArrowUpRight, Camera, Loader2, Mic, Sparkles, Split, Square } from 'lucide-react';
import type { AppState, TransactionType } from '../../types';
import { TRANSLATIONS } from '../../constants';
import { isAIAvailable, type ParsedTransaction } from '../../services/aiService';
import { parseWithHabits, transcribeWithHabits } from '../../services/smartEntry';
import { isVoiceRecordingSupported, MAX_RECORDING_MS, useVoiceRecorder, type VoiceRecording } from '../../hooks/useVoiceRecorder';
import { selectDashboardTemplates } from '../../utils/qolSuggestions';
import { GlassSheet } from '../ui/GlassSheet';
import { money } from '../home/parts';

interface AddSheetProps {
  isOpen: boolean;
  onClose: () => void;
  state: AppState;
  onParsed: (parsed: ParsedTransaction) => void;
  onManual: (type: TransactionType) => void;
  onScanReceipt: () => void;
  onSplitBill: () => void;
  onUseTemplate: (templateId: string) => void;
}

const formatElapsed = (ms: number): string => {
  const seconds = Math.min(Math.floor(ms / 1000), MAX_RECORDING_MS / 1000);
  return `0:${String(seconds).padStart(2, '0')}`;
};

// After a voice parse the transcript stays on screen this long before the form opens.
const TRANSCRIPT_HOLD_MS = 650;

/** The + button: describe an entry for AI, or pick how to add it. */
export const AddSheet: React.FC<AddSheetProps> = ({
  isOpen,
  onClose,
  state,
  onParsed,
  onManual,
  onScanReceipt,
  onSplitBill,
  onUseTemplate,
}) => {
  const t = TRANSLATIONS[state.language];
  const [input, setInput] = useState('');
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const aiAvailable = isAIAvailable();
  const voiceSupported = isVoiceRecordingSupported();
  const templates = selectDashboardTemplates(state.templates, 6);
  const stateRef = useRef(state);
  stateRef.current = state;
  const openRef = useRef(isOpen);
  openRef.current = isOpen;

  const handleRecording = async (recording: VoiceRecording) => {
    setTranscribing(true);
    setError(null);
    try {
      const result = await transcribeWithHabits(recording, stateRef.current);
      if (!openRef.current) return;
      if (!result) {
        setError(t.voiceFailed);
        return;
      }
      setInput(result.transcript);
      if (result.parsed) {
        const parsed = result.parsed;
        window.setTimeout(() => {
          if (!openRef.current) return;
          setInput('');
          close(() => onParsed(parsed));
        }, TRANSCRIPT_HOLD_MS);
      } else {
        setError(t.couldNotParse);
      }
    } catch (voiceError) {
      console.error('Voice entry failed:', voiceError);
      setError(t.voiceFailed);
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

  useEffect(() => {
    if (isOpen) return;
    voice.cancel();
    voice.clearError();
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const close = (then?: () => void) => {
    onClose();
    then?.();
  };

  const submit = async () => {
    const text = input.trim();
    if (!text || parsing) return;
    setParsing(true);
    setError(null);
    try {
      const result = await parseWithHabits(text, state);
      if (result) {
        setInput('');
        close(() => onParsed(result));
      } else {
        setError(t.couldNotParse);
      }
    } catch (parseError) {
      console.error('Smart parsing failed:', parseError);
      setError(t.couldNotParse);
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

  const actions = [
    { icon: Camera, label: t.scanReceipt, onSelect: onScanReceipt, hidden: !aiAvailable },
    { icon: ArrowUpRight, label: t.expense, onSelect: () => onManual('expense') },
    { icon: ArrowDownLeft, label: t.income, onSelect: () => onManual('income') },
    { icon: Split, label: t.splitBill, onSelect: onSplitBill },
  ].filter(action => !action.hidden);

  return (
    <GlassSheet isOpen={isOpen} onClose={() => close()} title={t.newEntry} closeLabel={t.close}>
      <div className="flex flex-col gap-5">
        {aiAvailable && (
          <form
            onSubmit={event => {
              event.preventDefault();
              void submit();
            }}
            className="flex flex-col gap-2"
          >
            <label htmlFor="add-sheet-describe" className="text-[13px] font-semibold text-muted">{t.describeEntry}</label>
            <div className={clsx('paper-field flex items-center gap-2 rounded-[22px] p-1.5 pl-4 transition-shadow', recording && 'ring-2 ring-neg/40')}>
              {busy
                ? <Loader2 size={18} aria-hidden="true" className="shrink-0 animate-spin text-accent" />
                : <Sparkles size={18} aria-hidden="true" className="shrink-0 text-accent" />}
              <input
                id="add-sheet-describe"
                value={input}
                onChange={event => setInput(event.target.value)}
                placeholder={
                  recording ? t.voiceTapToStop.replace('{time}', formatElapsed(voice.elapsedMs))
                  : transcribing ? t.voiceTranscribing
                  : t.describePlaceholder
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
            {(error ?? voiceError) && <p role="alert" className="text-[13px] font-medium text-neg">{error ?? voiceError}</p>}
          </form>
        )}

        <div className="grid grid-cols-2 gap-2">
          {actions.map(({ icon: Icon, label, onSelect }) => (
            <button
              key={label}
              type="button"
              onClick={() => close(onSelect)}
              className="flex h-[76px] flex-col items-start justify-between rounded-[22px] bg-tile p-3.5 text-left text-[15px] font-semibold shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
            >
              <Icon size={20} aria-hidden="true" className="text-accent" />
              {label}
            </button>
          ))}
        </div>

        {templates.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-semibold text-muted">{t.again}</span>
            <div className="flex flex-wrap gap-2">
              {templates.map(template => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => close(() => onUseTemplate(template.id))}
                  className="flex h-10 max-w-full items-center gap-2 rounded-full bg-chip px-3.5 text-sm font-semibold"
                >
                  <span className="truncate">{template.name}</span>
                  {template.amount != null && (
                    <span className="shrink-0 font-medium text-muted">{money(template.amount, template.currency, state.language, true)}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </GlassSheet>
  );
};
