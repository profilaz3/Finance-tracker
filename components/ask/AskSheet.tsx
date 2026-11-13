import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { m } from 'motion/react';
import { AlertCircle, ArrowUp, Check, Copy, Loader2, Mic, RotateCcw, Sparkles, Square } from 'lucide-react';
import type { AppState } from '../../types';
import { TRANSLATIONS } from '../../constants';
import { MOTION } from '../../config';
import { GlassSheet } from '../ui/GlassSheet';
import { isVoiceRecordingSupported, MAX_RECORDING_MS, useVoiceRecorder, type VoiceRecording } from '../../hooks/useVoiceRecorder';
import { blobToBase64 } from '../../utils/blobBase64';
import { formatPercent } from '../../utils/locale';
import { selectPeopleWithBalances } from '../../domain/balances';
import { LIMITS, type QueryExecution } from '../../domain/financeQuery';
import { transcribeQuestion, type AskFailure } from '../../services/askService';
import { useAskConversation, type AskTurn } from './useAskConversation';
import { AskChart } from './AskChart';
import { AskExplain } from './AskExplain';
import { formatAskValue } from './askFormat';

type Strings = (typeof TRANSLATIONS)['en'];

interface AskSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** Active workspace state, so answers match what the user sees. */
  state: AppState;
  /** A question to ask as soon as the sheet opens (from a chip elsewhere). */
  seed?: { question: string; nonce: number } | null;
}

const errorText = (error: AskFailure | undefined, t: Strings): string => {
  switch (error) {
    case 'quota': return t.askErrQuota;
    case 'offline':
    case 'network': return t.askErrOffline;
    case 'rejected': return t.askErrRejected;
    case 'expired': return t.askErrExpired;
    default: return t.askErrFailed;
  }
};

const formatElapsed = (ms: number): string => {
  const seconds = Math.min(Math.floor(ms / 1000), MAX_RECORDING_MS / 1000);
  return `0:${String(seconds).padStart(2, '0')}`;
};

const TypingDots: React.FC<{ label: string }> = ({ label }) => (
  <div className="flex items-center gap-2 text-[14px] text-muted" role="status">
    <span className="flex gap-1" aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="h-2 w-2 animate-bounce rounded-full bg-accent motion-reduce:animate-none"
          style={{ animationDelay: `${index * 140}ms`, animationDuration: '900ms' }}
        />
      ))}
    </span>
    {label}
  </div>
);

const Headline: React.FC<{ execution: QueryExecution; language: 'en' | 'sr' }> = ({ execution, language }) => {
  const { table } = execution;
  if (table.dataset === 'balances' || table.rows.length > 0 || table.count === 0) return null;
  const change = table.changePct;
  // More spending reads as bad, more income as good.
  const good = change !== undefined && (change > 0) === (table.dataset === 'transactions' && table.type !== 'expense');
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span className="text-[26px] font-bold leading-none tracking-[-0.5px] tabular-nums">{formatAskValue(table.total, table, language)}</span>
      {change !== undefined && (
        <span className={clsx('rounded-full px-2 py-0.5 text-[12px] font-semibold tabular-nums', good ? 'bg-pos/15 text-pos' : 'bg-neg/15 text-neg')}>
          {change > 0 ? '+' : ''}{formatPercent(change, Math.abs(change) < 10 ? 1 : 0, language)}
        </span>
      )}
    </div>
  );
};

const TurnView: React.FC<{
  turn: AskTurn;
  language: 'en' | 'sr';
  t: Strings;
  onRetry: (id: string) => void;
}> = ({ turn, language, t, onRetry }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!turn.answer) return;
    try {
      await navigator.clipboard.writeText(turn.answer);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <m.li
      className="flex flex-col gap-2"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={MOTION.modal.spring}
    >
      <div className="flex justify-end">
        <p className="max-w-[85%] break-words rounded-[20px] rounded-br-[6px] bg-accent px-3.5 py-2 text-[15px] text-on-accent">
          <span className="sr-only">{t.askYouAsked}: </span>
          {turn.question}
        </p>
      </div>
      <div className="flex flex-col gap-3 rounded-[22px] bg-tile p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
        {turn.status === 'thinking' && <TypingDots label={t.askThinking} />}
        {turn.status === 'error' && (
          <div className="flex items-start gap-2.5">
            <AlertCircle size={18} aria-hidden="true" className="mt-0.5 flex-none text-neg" />
            <div className="min-w-0 flex-1">
              <p role="alert" className="text-[15px]">{errorText(turn.error, t)}</p>
              {turn.error !== 'quota' && (
                <button
                  type="button"
                  onClick={() => onRetry(turn.id)}
                  className="mt-2 flex h-9 items-center gap-1.5 rounded-full bg-chip px-3.5 text-[13px] font-semibold"
                >
                  <RotateCcw size={14} aria-hidden="true" />
                  {t.askRetry}
                </button>
              )}
            </div>
          </div>
        )}
        {turn.status === 'clarify' && <p className="text-[15px] leading-relaxed">{turn.answer}</p>}
        {turn.status === 'done' && (
          <>
            {turn.execution && <Headline execution={turn.execution} language={language} />}
            <p className={clsx('whitespace-pre-line text-[15px] leading-relaxed', turn.localOnly && 'text-muted')}>{turn.answer}</p>
            {turn.execution && turn.chart && (
              <AskChart table={turn.execution.table} hint={turn.chart} language={language} />
            )}
            <div className="flex flex-col gap-2">
              {turn.plan && turn.execution && <AskExplain plan={turn.plan} execution={turn.execution} language={language} />}
              <div className="flex">
                <button
                  type="button"
                  onClick={() => void copy()}
                  className="flex h-9 items-center gap-1.5 rounded-full bg-chip px-3.5 text-[13px] font-semibold text-muted"
                >
                  {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                  {copied ? t.askCopied : t.askCopy}
                </button>
                <span className="sr-only" aria-live="polite">{copied ? t.askCopied : ''}</span>
              </div>
            </div>
          </>
        )}
      </div>
    </m.li>
  );
};

/** "Ask your finances": a chat sheet that answers with exact, locally computed numbers. */
export const AskSheet: React.FC<AskSheetProps> = ({ isOpen, onClose, state, seed }) => {
  const t = TRANSLATIONS[state.language];
  const language = state.language;
  const [input, setInput] = useState('');
  const [transcribing, setTranscribing] = useState(false);
  const [voiceFailure, setVoiceFailure] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const voiceSupported = isVoiceRecordingSupported();

  const formatTotal = useCallback(
    (execution: QueryExecution) => formatAskValue(execution.table.total, execution.table, language),
    [language],
  );
  const { turns, ask, retry, reset, busy } = useAskConversation(state, formatTotal);

  const submit = (question: string) => {
    if (!question.trim() || busy) return;
    setInput('');
    setVoiceFailure(null);
    void ask(question);
  };

  const handledSeed = useRef<number | null>(null);
  useEffect(() => {
    if (!isOpen || !seed || handledSeed.current === seed.nonce) return;
    handledSeed.current = seed.nonce;
    void ask(seed.question);
  }, [isOpen, seed, ask]);

  useEffect(() => {
    if (turns.length > 0) endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [turns]);

  const handleRecording = async (recording: VoiceRecording) => {
    setTranscribing(true);
    setVoiceFailure(null);
    try {
      const result = await transcribeQuestion(await blobToBase64(recording.blob), recording.mimeType, language);
      if (result.ok) submit(result.value);
      else setVoiceFailure(errorText(result.error, t));
    } catch {
      setVoiceFailure(t.askErrFailed);
    } finally {
      setTranscribing(false);
    }
  };
  const voice = useVoiceRecorder((recording) => void handleRecording(recording));
  const recording = voice.status !== 'idle';
  const voiceError = voiceFailure
    ?? (voice.error === 'denied' ? t.voiceMicDenied
      : voice.error === 'unavailable' ? t.voiceMicUnavailable
      : voice.error === 'empty' ? t.voiceHeardNothing
      : null);

  const close = () => {
    voice.cancel();
    voice.clearError();
    onClose();
  };

  const suggestions = useMemo(() => {
    const list = [t.askSuggestMonth, t.askSuggestAutumn, t.askSuggestSubs];
    const event = [...state.events].sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''))[0];
    if (event) list.splice(1, 0, t.askSuggestEvent.replace('{event}', event.name));
    const owing = selectPeopleWithBalances(state.people, state.transactions)
      .find((person) => person.id !== state.userProfile?.id && Object.values(person.balances).some((value) => value > 0));
    list.push(owing ? t.askSuggestPerson.replace('{name}', owing.name) : t.askSuggestOwe);
    return list;
  }, [state.events, state.people, state.transactions, state.userProfile?.id, t]);

  const footer = (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit(input);
      }}
      className="flex flex-col gap-1.5"
    >
      <div className={clsx('paper-field flex items-center gap-2 rounded-[22px] p-1.5 pl-4 transition-shadow', recording && 'ring-2 ring-neg/40')}>
        {transcribing
          ? <Loader2 size={18} aria-hidden="true" className="shrink-0 animate-spin text-accent" />
          : <Sparkles size={18} aria-hidden="true" className="shrink-0 text-accent" />}
        <label htmlFor="ask-input" className="sr-only">{t.askPlaceholder}</label>
        <input
          ref={inputRef}
          id="ask-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={
            recording ? t.voiceTapToStop.replace('{time}', formatElapsed(voice.elapsedMs))
            : transcribing ? t.voiceTranscribing
            : t.askPlaceholder
          }
          readOnly={recording || transcribing}
          maxLength={LIMITS.question}
          autoComplete="off"
          enterKeyHint="send"
          className="h-11 min-w-0 flex-1 rounded-[14px] bg-transparent text-[16px] text-on-surface placeholder:text-faint focus:outline-none"
        />
        {voiceSupported && (
          <span
            ref={(element) => { voice.levelRef.current = element; }}
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
                setVoiceFailure(null);
                void voice.start();
              }}
              disabled={transcribing || busy || voice.status === 'starting'}
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
          aria-label={t.askSend}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent disabled:opacity-40"
        >
          {busy ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <ArrowUp size={18} aria-hidden="true" />}
        </button>
      </div>
      <span className="sr-only" aria-live="polite">{recording ? t.listening : transcribing ? t.voiceTranscribing : ''}</span>
      {voiceError && <p role="alert" className="px-2 text-[13px] font-medium text-neg">{voiceError}</p>}
    </form>
  );

  return (
    <GlassSheet
      isOpen={isOpen}
      onClose={close}
      title={t.askTitle}
      closeLabel={t.close}
      className="md:max-w-[560px]"
      footer={footer}
      headerAction={turns.length > 0 ? (
        <button
          type="button"
          onClick={() => {
            reset();
            inputRef.current?.focus();
          }}
          aria-label={t.askNewChat}
          title={t.askNewChat}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-chip text-muted"
        >
          <RotateCcw size={16} aria-hidden="true" />
        </button>
      ) : undefined}
    >
      <div className="flex min-h-[40dvh] flex-col gap-4">
        {turns.length === 0 ? (
          <div className="flex flex-col gap-3">
            <p className="text-[13px] leading-snug text-muted">{t.askPrivacy}</p>
            <span className="text-[13px] font-semibold text-muted">{t.askTryAsking}</span>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => submit(suggestion)}
                  className="min-h-10 max-w-full rounded-[20px] bg-chip px-3.5 py-2 text-left text-[14px] font-semibold"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ol className="flex flex-col gap-5">
            {turns.map((turn) => (
              <TurnView key={turn.id} turn={turn} language={language} t={t} onRetry={retry} />
            ))}
          </ol>
        )}
        <div ref={endRef} />
      </div>
    </GlassSheet>
  );
};
