import { useCallback, useEffect, useRef, useState } from 'react';

export const MAX_RECORDING_MS = 30_000;

// Android WebView (Chromium) records webm/opus; Safari/iOS records mp4/aac.
const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/aac'];

export const pickRecordingMimeType = (isSupported: (type: string) => boolean): string | null =>
  MIME_CANDIDATES.find(type => {
    try {
      return isSupported(type);
    } catch {
      return false;
    }
  }) ?? null;

export const isVoiceRecordingSupported = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.MediaRecorder !== 'undefined' &&
  !!navigator.mediaDevices?.getUserMedia;

export type VoiceStatus = 'idle' | 'starting' | 'recording';
export type VoiceError = 'denied' | 'unavailable' | 'empty';

export interface VoiceRecording {
  blob: Blob;
  mimeType: string;
  durationMs: number;
}

/**
 * Records a short voice note with MediaRecorder. The live input level is written to the
 * `--voice-level` CSS variable (0..1) on `levelRef`, so the meter animates without re-renders.
 */
export function useVoiceRecorder(onRecorded: (recording: VoiceRecording) => void) {
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [error, setError] = useState<VoiceError | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const levelRef = useRef<HTMLElement | null>(null);
  const onRecordedRef = useRef(onRecorded);
  onRecordedRef.current = onRecorded;
  const session = useRef<{
    recorder: MediaRecorder;
    stream: MediaStream;
    context: AudioContext | null;
    frame: number;
    timer: number;
    startedAt: number;
    cancelled: boolean;
  } | null>(null);

  const teardown = useCallback(() => {
    const current = session.current;
    if (!current) return;
    cancelAnimationFrame(current.frame);
    window.clearInterval(current.timer);
    current.stream.getTracks().forEach(track => track.stop());
    void current.context?.close().catch(() => undefined);
    levelRef.current?.style.setProperty('--voice-level', '0');
  }, []);

  const stop = useCallback(() => {
    const current = session.current;
    if (current && current.recorder.state !== 'inactive') current.recorder.stop();
  }, []);

  const cancel = useCallback(() => {
    const current = session.current;
    if (!current) return;
    current.cancelled = true;
    if (current.recorder.state !== 'inactive') current.recorder.stop();
    else teardown();
  }, [teardown]);

  const start = useCallback(async () => {
    if (session.current || !isVoiceRecordingSupported()) {
      if (!isVoiceRecordingSupported()) setError('unavailable');
      return;
    }
    setError(null);
    setStatus('starting');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (cause) {
      const name = (cause as DOMException | null)?.name;
      setError(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable');
      setStatus('idle');
      return;
    }

    const mimeType = pickRecordingMimeType(type => MediaRecorder.isTypeSupported(type));
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 32_000 }) : new MediaRecorder(stream);
    const chunks: Blob[] = [];
    recorder.ondataavailable = event => {
      if (event.data.size > 0) chunks.push(event.data);
    };

    let context: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    try {
      const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        context = new AudioContextClass();
        analyser = context.createAnalyser();
        analyser.fftSize = 512;
        context.createMediaStreamSource(stream).connect(analyser);
      }
    } catch {
      context = null;
      analyser = null;
    }

    const startedAt = performance.now();
    const current = { recorder, stream, context, frame: 0, timer: 0, startedAt, cancelled: false };
    session.current = current;

    const samples = analyser ? new Uint8Array(analyser.fftSize) : null;
    let smoothed = 0;
    const tick = () => {
      if (analyser && samples) {
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (const sample of samples) {
          const centered = (sample - 128) / 128;
          sum += centered * centered;
        }
        const rms = Math.sqrt(sum / samples.length);
        // Speech RMS sits around 0.02 to 0.3; stretch it so the meter moves visibly.
        const level = Math.min(1, rms * 4.5);
        smoothed = level > smoothed ? level : smoothed * 0.86 + level * 0.14;
        levelRef.current?.style.setProperty('--voice-level', smoothed.toFixed(3));
      }
      current.frame = requestAnimationFrame(tick);
    };
    current.frame = requestAnimationFrame(tick);
    current.timer = window.setInterval(() => {
      const elapsed = performance.now() - startedAt;
      setElapsedMs(elapsed);
      if (elapsed >= MAX_RECORDING_MS) stop();
    }, 200);

    recorder.onstop = () => {
      const durationMs = performance.now() - startedAt;
      teardown();
      session.current = null;
      setStatus('idle');
      setElapsedMs(0);
      if (current.cancelled) return;
      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' });
      if (blob.size < 1024 || durationMs < 400) {
        setError('empty');
        return;
      }
      onRecordedRef.current({ blob, mimeType: blob.type, durationMs });
    };

    recorder.start(250);
    setElapsedMs(0);
    setStatus('recording');
  }, [stop, teardown]);

  useEffect(() => () => {
    const current = session.current;
    if (!current) return;
    current.cancelled = true;
    if (current.recorder.state !== 'inactive') current.recorder.stop();
    teardown();
    session.current = null;
  }, [teardown]);

  return { status, error, elapsedMs, levelRef, start, stop, cancel, clearError: () => setError(null) };
}
