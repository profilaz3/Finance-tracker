import React, { useMemo, useState, useSyncExternalStore } from 'react';
import clsx from 'clsx';
import { ArrowUp, Loader2, Mic, ShieldCheck, Sparkles, Square } from 'lucide-react';
import type { AppState } from '../../types';
import { TRANSLATIONS } from '../../constants';
import { isVoiceRecordingSupported, useVoiceRecorder, type VoiceRecording } from '../../hooks/useVoiceRecorder';
import { blobToBase64 } from '../../utils/blobBase64';
import { LIMITS } from '../../domain/financeQuery';
import { transcribeQuestion } from '../../services/askService';
import { openAsk } from './askBus';
import { askSuggestions } from './askSuggestions';
import { getLastAnswer, subscribeLastAnswer } from './lastAnswer';
import { Headline } from './AskHeadline';
import { AskChart } from './AskChart';

interface AskPanelProps {
  /** Active workspace state, for the suggestions. */
  state: AppState;
  labels: {
    totalsOnly: string;
    askAnything: string;
    lastQuestion: string;
    workedOut: string;
    openChat: string;
  };
}

/**
 * "Ask about your money" on the Insights page: the last answer of this session, questions to
 * start with, and the Ask field. Asking opens the Ask sheet, which holds the conversation.
 */
export const AskPanel: React.FC<AskPanelProps> = ({ state, labels }) => {
  const language = state.language;
  const t = TRANSLATIONS[language];
  const last = useSyncExternalStore(subscribeLastAnswer, getLastAnswer, getLastAnswer);
  const suggestions = useMemo(() => askSuggestions(state, t), [state, t]);
  const [input, setInput] = useState('');
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [voiceFailure, setVoiceFailure] = useState<string | null>(null);
  const voiceSupported = isVoiceRecordingSupported();

  const submit = (question: string) => {
    const text = question.trim();
    if (!text) return;
    setInput('');
    setVoiceFailure(null);
    openAsk(text);
  };

  const handleRecording = async (recording: VoiceRecording) => {
    setTranscribing(true);
    setVoiceFailure(null);
    try {
      const result = await transcribeQuestion(await blobToBase64(recording.blob), recording.mimeType, language);
      if (result.ok) submit(result.value);
      else setVoiceFailure(t.askErrFailed);
    } catch {
      setVoiceFailure(t.askErrFailed);
    } finally {
      setTranscribing(false);
    }
  };
  const voice = useVoiceRecorder(recording => void handleRecording(recording));
  const recording = voice.status !== 'idle';
  const voiceError = voiceFailure
    ?? (voice.error === 'denied' ? t.voiceMicDenied
      : voice.error === 'unavailable' ? t.voiceMicUnavailable
      : voice.error === 'empty' ? t.voiceHeardNothing
      : null);

  return (
    <section aria-labelledby="ask-panel-title" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 px-1">
        <h2 id="ask-panel-title" className="text-[19px] font-bold tracking-[-0.3px]">{t.askBarPrompt}</h2>
        <button
          type="button"
          onClick={() => setPrivacyOpen(open => !open)}
          aria-expanded={privacyOpen}
          aria-controls="ask-panel-privacy"
          className="-mr-2 flex h-10 shrink-0 items-center gap-1.5 rounded-full px-2 text-[13.5px] font-semibold text-muted"
        >
          <ShieldCheck size={15} aria-hidden="true" />
          {labels.totalsOnly}
        </button>
      </div>
      {privacyOpen && <p id="ask-panel-privacy" className="-mt-1 px-1 text-[13.5px] leading-snug text-muted">{t.askPrivacy}</p>}

      {last && (
        <article aria-label={labels.lastQuestion} className="paper-tile flex flex-col gap-3 p-4">
          <p className="flex items-start gap-2 text-[14.5px] font-medium text-muted">
            <Sparkles size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-accent" />
            <span className="min-w-0 break-words">{last.question}</span>
          </p>
          {last.execution && <Headline execution={last.execution} language={language} size={32} />}
          <p className={clsx('line-clamp-4 whitespace-pre-line text-[15px] leading-relaxed', last.localOnly && 'text-muted')}>{last.answer}</p>
          {last.execution && last.chart && <AskChart table={last.execution.table} hint={last.chart} language={language} />}
          <div className="flex flex-wrap items-center justify-between gap-x-3">
            <button type="button" onClick={() => openAsk()} className="-ml-1 h-10 rounded-full px-1 text-[14.5px] font-semibold text-accent">
              {labels.openChat}
            </button>
            <span className="text-[12.5px] text-muted">{labels.workedOut}</span>
          </div>
        </article>
      )}

      {/* A swipeable strip on phones; on wider screens the questions wrap onto more lines. */}
      <div data-no-swipe className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5 md:flex-wrap md:overflow-visible">
        {suggestions.map(suggestion => (
          <button
            key={suggestion}
            type="button"
            onClick={() => submit(suggestion)}
            className="h-11 shrink-0 whitespace-nowrap rounded-full bg-tile px-4 text-[14.5px] font-semibold shadow-[0_0_0_1px_var(--paper-line)]"
          >
            {suggestion}
          </button>
        ))}
      </div>

      <form
        onSubmit={event => {
          event.preventDefault();
          submit(input);
        }}
        className="flex flex-col gap-1.5"
      >
        <div className={clsx('paper-field flex items-center gap-2 rounded-[24px] p-1.5 pl-4', recording && 'ring-2 ring-neg/40')}>
          {transcribing
            ? <Loader2 size={18} aria-hidden="true" className="shrink-0 animate-spin text-accent" />
            : <Sparkles size={18} aria-hidden="true" className="shrink-0 text-accent" />}
          <label htmlFor="ask-panel-input" className="sr-only">{labels.askAnything}</label>
          <input
            id="ask-panel-input"
            value={input}
            onChange={event => setInput(event.target.value)}
            placeholder={recording ? t.listening : transcribing ? t.voiceTranscribing : labels.askAnything}
            readOnly={recording || transcribing}
            maxLength={LIMITS.question}
            autoComplete="off"
            enterKeyHint="send"
            className="h-11 min-w-0 flex-1 bg-transparent text-[16px] text-on-surface placeholder:text-faint focus:outline-none"
          />
          {voiceSupported && (
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
              disabled={transcribing || voice.status === 'starting'}
              aria-label={recording ? t.voiceStop : t.speak}
              aria-pressed={recording}
              className={clsx(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-50',
                recording ? 'bg-neg text-white' : 'text-muted',
              )}
            >
              {recording ? <Square size={14} fill="currentColor" aria-hidden="true" /> : <Mic size={19} aria-hidden="true" />}
            </button>
          )}
          <button
            type="submit"
            disabled={!input.trim() || recording}
            aria-label={t.askSend}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent disabled:opacity-40"
          >
            <ArrowUp size={19} aria-hidden="true" />
          </button>
        </div>
        <span className="sr-only" aria-live="polite">{recording ? t.listening : transcribing ? t.voiceTranscribing : ''}</span>
        {voiceError && <p role="alert" className="px-2 text-[13px] font-medium text-neg">{voiceError}</p>}
      </form>
    </section>
  );
};
