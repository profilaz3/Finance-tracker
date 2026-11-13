// Decides whether a touch that starts on `target` may become a view-switching swipe.
// Swipes must not hijack gestures that belong to the element under the finger:
// horizontally scrollable rows (chips, tabs, tables), form controls, sliders and charts.

const FORM_CONTROL_SELECTOR = 'input, textarea, select, [contenteditable="true"], [role="slider"]';
const NO_SWIPE_SELECTOR = '[data-no-swipe], .recharts-wrapper';

const canScrollHorizontally = (element: Element): boolean => {
  if (element.scrollWidth <= element.clientWidth + 1) return false;
  const { overflowX } = window.getComputedStyle(element);
  return overflowX === 'auto' || overflowX === 'scroll';
};

export function shouldIgnoreSwipeStart(target: EventTarget | null, root: Element | null): boolean {
  if (!(target instanceof Element)) return false;

  if (target.closest(NO_SWIPE_SELECTOR) || target.closest(FORM_CONTROL_SELECTOR)) {
    return true;
  }

  for (let element: Element | null = target; element && element !== root; element = element.parentElement) {
    if (canScrollHorizontally(element)) {
      return true;
    }
  }

  return false;
}
