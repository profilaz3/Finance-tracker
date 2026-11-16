import { useEffect } from 'react';
import { setStatusBarOverColour } from '../utils/appearance';

/**
 * Headers on screen, oldest first. The newest one decides (a person's page over the Shared tab),
 * and closing it hands the status bar back to the one below instead of resetting it.
 */
const headers: Array<{ over: boolean }> = [];
const applyTop = () => setStatusBarOverColour(headers.length > 0 && headers[headers.length - 1].over);

/** On phones a screen header runs under the status bar: light icons and no paper scrim while it is there. */
export function useStatusBarOverHeader(ref: React.RefObject<HTMLElement | null>, enabled: boolean) {
  useEffect(() => {
    const element = ref.current;
    if (!enabled || !element || typeof IntersectionObserver === 'undefined') return;
    const narrow = window.matchMedia('(max-width: 767px)');
    const entry = { over: true };
    headers.push(entry);
    let visible = true;
    const apply = () => {
      entry.over = narrow.matches && visible;
      applyTop();
    };
    // The root is the top strip of the screen: the header is "under the status bar" while it overlaps it.
    const observer = new IntersectionObserver(([change]) => {
      visible = change.isIntersecting;
      apply();
    }, { rootMargin: '0px 0px -94% 0px' });
    observer.observe(element);
    narrow.addEventListener('change', apply);
    apply();
    return () => {
      observer.disconnect();
      narrow.removeEventListener('change', apply);
      headers.splice(headers.indexOf(entry), 1);
      applyTop();
    };
  }, [ref, enabled]);
}
