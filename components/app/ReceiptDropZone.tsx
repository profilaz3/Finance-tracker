import React, { useEffect, useRef, useState } from 'react';
import { ScanLine } from 'lucide-react';

interface ReceiptDropZoneProps {
  language: 'en' | 'sr';
  /** A file was dropped onto the window: open the receipt scanner with it. */
  onReceiptFile: (file: File) => void;
}

const COPY = {
  en: { title: 'Drop to scan the receipt', hint: 'A photo of a receipt or an IPS bill' },
  sr: { title: 'Pusti da skeniraš račun', hint: 'Fotografija računa ili IPS uplatnice' },
} as const;

const carriesFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes('Files');
/** A dialog is open (the scanner has its own drop area): leave the drag to it. */
const dialogOpen = () => !!document.querySelector('[aria-modal="true"]');

/**
 * Drag a receipt photo from the desktop onto the app window to scan it. While a file is over the
 * window a full-window target says what will happen; dropping opens the scanner with the file (which
 * checks the type and says so if it cannot read it). Lazy: it only matters with a mouse.
 */
const ReceiptDropZone: React.FC<ReceiptDropZoneProps> = ({ language, onReceiptFile }) => {
  const [active, setActive] = useState(false);
  const depth = useRef(0);
  const onFile = useRef(onReceiptFile);
  onFile.current = onReceiptFile;

  useEffect(() => {
    const enter = (event: DragEvent) => {
      if (!carriesFiles(event) || dialogOpen()) return;
      depth.current += 1;
      setActive(true);
    };
    const over = (event: DragEvent) => {
      if (!carriesFiles(event) || dialogOpen()) return;
      // Without this the browser opens the dropped file in the tab instead.
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };
    const leave = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setActive(false);
    };
    const drop = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      const reset = () => {
        depth.current = 0;
        setActive(false);
      };
      if (dialogOpen()) {
        reset();
        return;
      }
      event.preventDefault();
      reset();
      const file = event.dataTransfer?.files?.[0];
      if (file) onFile.current(file);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, []);

  if (!active) return null;
  const copy = COPY[language];
  return (
    <div className="paper-scrim pointer-events-none fixed inset-0 z-[60] flex items-center justify-center p-6" role="status" aria-live="polite">
      <div className="flex w-full max-w-[420px] flex-col items-center gap-3 rounded-[32px] border-2 border-dashed border-on-accent/60 bg-accent px-8 py-12 text-center text-on-accent shadow-[0_28px_70px_-24px_rgba(0,0,0,0.5)]">
        <ScanLine size={40} aria-hidden="true" />
        <p className="text-[20px] font-bold tracking-[-0.3px]">{copy.title}</p>
        <p className="text-[14.5px] font-medium opacity-85">{copy.hint}</p>
      </div>
    </div>
  );
};

export default ReceiptDropZone;
