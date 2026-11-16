import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { m } from 'motion/react';
import { Flashlight, FlashlightOff, ImageIcon, QrCode, X } from 'lucide-react';
import { useDialog } from '../../hooks/useFocusTrap';
import { vibrate, HAPTIC_PATTERNS } from '../../utils/haptics';
import { classifyScannedQr, decodeQrPixels, detectQrTexts, getNativeQrDetector, loadJsQr, pickQrText, type NativeQrDetector, type ScannedQr } from './qr';

export interface QrScannerLabels {
  title: string;
  hint: string;
  notFiscal: string;
  cameraUnavailable: string;
  choosePhoto: string;
  torch: string;
  close: string;
}

interface QrScannerProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called once with a validated fiscal receipt URL or an IPS payment code (a bill). */
  onResult: (result: ScannedQr) => void;
  /** Fallback when the camera cannot be used: pick a photo of the receipt instead. */
  onChoosePhoto: () => void;
  labels: QrScannerLabels;
}

const SCAN_INTERVAL_MS = 140;
// jsQR fallback: a fiscal QR has about 105 modules and jsQR needs about 4 px each, so every
// other frame is read at the camera's own resolution (capped for speed); the frames between
// are read smaller, which is fast and sometimes catches a code the full size misses.
const NATIVE_SAMPLE_CAP = 1000;
const SMALL_SAMPLE_SIZES = [640, 760] as const;

type FocusCapabilities = MediaTrackCapabilities & { focusMode?: string[]; torch?: boolean };

/** Keeps a close-up receipt sharp where the camera allows it (Chrome on Android). */
const enableContinuousFocus = (track: MediaStreamTrack | undefined) => {
  if (!track || typeof track.getCapabilities !== 'function') return;
  const { focusMode } = track.getCapabilities() as FocusCapabilities;
  if (!focusMode?.includes('continuous')) return;
  void track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] }).catch(() => undefined);
};

/** Torch is a non-standard capability (Chrome on Android); absent from the DOM types. */
const hasTorch = (track: MediaStreamTrack | undefined): boolean => {
  if (!track || typeof track.getCapabilities !== 'function') return false;
  return Boolean((track.getCapabilities() as FocusCapabilities).torch);
};

/**
 * Full screen camera viewfinder that reads fiscal receipt and IPS bill QR codes.
 * Portaled to <body>: the receipt sheet uses backdrop-filter, which would otherwise
 * become the containing block of this fixed overlay.
 */
export const QrScanner: React.FC<QrScannerProps> = ({ isOpen, onClose, onResult, onChoosePhoto, labels }) => {
  const { dialogProps, titleId } = useDialog(isOpen, onClose);
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const [status, setStatus] = useState<'starting' | 'scanning' | 'unavailable'>('starting');
  const [notice, setNotice] = useState<string | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  const notFiscalRef = useRef(labels.notFiscal);
  notFiscalRef.current = labels.notFiscal;

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    let frame = 0;
    let lastScan = 0;
    let busy = false;
    let lastRejected = '';
    let sampleIndex = 0;
    let noticeTimer = 0;
    let native: NativeQrDetector | null = null;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    setStatus('starting');
    setNotice(null);
    setTorchOn(false);
    setTorchSupported(false);

    /** The QR text in this frame, if any: the platform reader on the whole frame, else jsQR on the viewfinder square. */
    const readFrame = async (video: HTMLVideoElement): Promise<string | null> => {
      if (native) return pickQrText(await detectQrTexts(native, video));
      if (!ctx) return null;
      // Sample the square in the middle of the frame, where the viewfinder is.
      const side = Math.min(video.videoWidth, video.videoHeight) * 0.8;
      if (!side) return null;
      const sx = (video.videoWidth - side) / 2;
      const sy = (video.videoHeight - side) / 2;
      const turn = sampleIndex++;
      const size = turn % 2 === 0
        ? Math.round(Math.min(side, NATIVE_SAMPLE_CAP))
        : SMALL_SAMPLE_SIZES[(turn >> 1) % SMALL_SAMPLE_SIZES.length];
      canvas.width = size;
      canvas.height = size;
      ctx.drawImage(video, sx, sy, side, side, 0, 0, size, size);
      const { data } = ctx.getImageData(0, 0, size, size);
      return decodeQrPixels(data, size, size);
    };

    const tick = (now: number) => {
      if (cancelled) return;
      frame = requestAnimationFrame(tick);
      const video = videoRef.current;
      if (busy || !video || video.readyState < 2 || now - lastScan < SCAN_INTERVAL_MS) return;
      lastScan = now;
      busy = true;
      void readFrame(video)
        .then((text) => {
          if (cancelled || !text) return;
          const scanned = classifyScannedQr(text);
          if (scanned) {
            cancelled = true;
            vibrate(HAPTIC_PATTERNS.success);
            onResultRef.current(scanned);
            return;
          }
          if (text !== lastRejected) {
            lastRejected = text;
            vibrate(HAPTIC_PATTERNS.error);
            setNotice(notFiscalRef.current);
            window.clearTimeout(noticeTimer);
            noticeTimer = window.setTimeout(() => {
              lastRejected = '';
              setNotice(null);
            }, 2500);
          }
        })
        .catch(() => undefined)
        .finally(() => {
          busy = false;
        });
    };

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('unavailable');
        return;
      }
      try {
        // Find a decoder while the camera starts: the platform reader, else warm up jsQR.
        const detectorReady = getNativeQrDetector().then((detector) => {
          native = detector;
          if (!detector) void loadJsQr().catch(() => undefined);
        });
        // Full HD where available: a dense fiscal QR needs the pixels.
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        await detectorReady;
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play().catch(() => undefined);
        const track = stream.getVideoTracks()[0] as MediaStreamTrack | undefined;
        trackRef.current = track ?? null;
        enableContinuousFocus(track);
        setTorchSupported(hasTorch(track));
        setStatus('scanning');
        frame = requestAnimationFrame(tick);
      } catch {
        if (!cancelled) setStatus('unavailable');
      }
    };
    void start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      window.clearTimeout(noticeTimer);
      stream?.getTracks().forEach((track) => track.stop());
      trackRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [isOpen]);

  const toggleTorch = async () => {
    const track = trackRef.current;
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch {
      setTorchSupported(false);
    }
  };

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <m.div
      {...dialogProps}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="modal-safe-area fixed inset-0 z-[80] flex flex-col bg-black text-white outline-none"
    >
      <video
        ref={videoRef}
        playsInline
        muted
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover"
      />

      {/* Viewfinder: a clear square, the rest dimmed. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="relative aspect-square w-[72vmin] max-w-[340px] rounded-[30px] shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]">
          {(['left-0 top-0 border-l-4 border-t-4 rounded-tl-[30px]', 'right-0 top-0 border-r-4 border-t-4 rounded-tr-[30px]', 'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-[30px]', 'bottom-0 right-0 border-b-4 border-r-4 rounded-br-[30px]'] as const).map((corner) => (
            <span key={corner} className={`absolute h-12 w-12 border-white ${corner}`} />
          ))}
          {status === 'scanning' && <span className="qr-scan-line absolute inset-x-6 top-6 h-[2px] rounded-full bg-white/80" />}
        </div>
      </div>

      <div className="relative flex items-center justify-between px-4 pt-[max(12px,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={onClose}
          aria-label={labels.close}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-black/45 backdrop-blur-md"
        >
          <X size={20} aria-hidden="true" />
        </button>
        <h2 id={titleId} className="flex items-center gap-2 rounded-full bg-black/45 px-4 py-2 text-[15px] font-semibold backdrop-blur-md">
          <QrCode size={16} aria-hidden="true" />
          {labels.title}
        </h2>
        {torchSupported ? (
          <button
            type="button"
            onClick={() => void toggleTorch()}
            aria-label={labels.torch}
            aria-pressed={torchOn}
            className={`flex h-11 w-11 items-center justify-center rounded-full backdrop-blur-md ${torchOn ? 'bg-white text-black' : 'bg-black/45'}`}
          >
            {torchOn ? <FlashlightOff size={20} aria-hidden="true" /> : <Flashlight size={20} aria-hidden="true" />}
          </button>
        ) : (
          <span className="h-11 w-11" aria-hidden="true" />
        )}
      </div>

      <div className="relative mt-auto flex flex-col items-center gap-3 px-6 pb-[max(28px,env(safe-area-inset-bottom))]">
        {notice && (
          <p role="alert" className="rounded-full bg-neg px-4 py-2 text-center text-[14px] font-semibold text-white">
            {notice}
          </p>
        )}
        {status === 'unavailable' ? (
          <div className="flex flex-col items-center gap-3 rounded-[24px] bg-black/55 px-5 py-4 text-center backdrop-blur-md">
            <p className="text-[15px]">{labels.cameraUnavailable}</p>
            <button
              type="button"
              onClick={onChoosePhoto}
              className="flex h-11 items-center gap-2 rounded-full bg-white px-5 text-[15px] font-semibold text-black"
            >
              <ImageIcon size={18} aria-hidden="true" />
              {labels.choosePhoto}
            </button>
          </div>
        ) : (
          <p className="rounded-full bg-black/45 px-4 py-2 text-center text-[14px] backdrop-blur-md" role="status">
            {labels.hint}
          </p>
        )}
      </div>
    </m.div>,
    document.body,
  );
};
