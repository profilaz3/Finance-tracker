import { useEffect } from 'react';
import { setStatusBarOverColour } from '../utils/appearance';

/** On phones a screen header runs under the status bar: light icons and no paper scrim while it is there. */
export function useStatusBarOverHeader(ref: React.RefObject<HTMLElement | null>, enabled: boolean) {
  useEffect(() => {
    const element = ref.current;
    if (!enabled || !element || typeof IntersectionObserver === 'undefined') return;
    const narrow = window.matchMedia('(max-width: 767px)');
    let visible = true;
    const apply = () => setStatusBarOverColour(narrow.matches && visible);
    // The root is the top strip of the screen: the header is "under the status bar" while it overlaps it.
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      apply();
    }, { rootMargin: '0px 0px -94% 0px' });
    observer.observe(element);
    narrow.addEventListener('change', apply);
    apply();
    return () => {
      observer.disconnect();
      narrow.removeEventListener('change', apply);
      setStatusBarOverColour(false);
    };
  }, [ref, enabled]);
}
