import { useEffect, useRef, useCallback, useId } from 'react';

const FOCUSABLE_SELECTOR = [
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    'a[href]',
    '[tabindex]:not([tabindex="-1"])',
].join(', ');

// Nested dialogs (an image picker sheet over a modal): only the newest trap handles Tab.
const activeTraps: Array<object> = [];

/**
 * Hook to trap focus within a container (useful for modals)
 * @param isActive - Whether the focus trap is active
 * @param options - Configuration options
 *
 * Initial focus: an element already focused inside (autoFocus) wins, then `initialFocus`,
 * then the container itself when it has tabIndex={-1} (so phones do not pop the keyboard
 * for a leading text field), then the first focusable element.
 */
export function useFocusTrap(
    isActive: boolean,
    options: {
        initialFocus?: string; // Selector for initial focus element
        returnFocus?: boolean; // Return focus to trigger element on close
    } = {}
) {
    const containerRef = useRef<HTMLDivElement>(null);
    const previousActiveElement = useRef<Element | null>(null);
    const trapToken = useRef<object>({});

    const { initialFocus, returnFocus = true } = options;

    const getFocusableElements = useCallback(() => {
        if (!containerRef.current) return [];

        return Array.from(
            containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
        ).filter(el => el.getClientRects().length > 0); // Filter out hidden elements
    }, []);

    const handleKeyDown = useCallback((event: KeyboardEvent) => {
        const container = containerRef.current;
        if (!isActive || event.key !== 'Tab' || !container) return;
        if (activeTraps[activeTraps.length - 1] !== trapToken.current) return;

        const focusableElements = getFocusableElements();
        if (focusableElements.length === 0) {
            event.preventDefault();
            container.focus();
            return;
        }

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        const active = document.activeElement;
        const focusOutsideItems = !active || active === container || !container.contains(active);

        // Shift + Tab on first element (or from the dialog itself) -> go to last
        if (event.shiftKey && (active === firstElement || focusOutsideItems)) {
            event.preventDefault();
            lastElement.focus();
        }
        // Tab on last element (or from outside) -> go to first
        else if (!event.shiftKey && (active === lastElement || focusOutsideItems)) {
            event.preventDefault();
            firstElement.focus();
        }
    }, [isActive, getFocusableElements]);

    useEffect(() => {
        if (!isActive) return;

        // Store current focus
        previousActiveElement.current = document.activeElement;

        const container = containerRef.current;
        if (container && !container.contains(document.activeElement)) {
            const initialElement = initialFocus
                ? container.querySelector<HTMLElement>(initialFocus)
                : null;
            if (initialElement) {
                initialElement.focus();
            } else if (container.getAttribute('tabindex') === '-1') {
                container.focus({ preventScroll: true });
            } else {
                getFocusableElements()[0]?.focus();
            }
        }

        const token = trapToken.current;
        activeTraps.push(token);
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            const index = activeTraps.lastIndexOf(token);
            if (index !== -1) activeTraps.splice(index, 1);

            // Return focus to the trigger if it is still in the document
            const previous = previousActiveElement.current;
            if (returnFocus && previous instanceof HTMLElement && previous.isConnected) {
                previous.focus({ preventScroll: true });
            }
        };
    }, [isActive, initialFocus, returnFocus, handleKeyDown, getFocusableElements]);

    return containerRef;
}

/**
 * Everything a modal panel needs to behave as a dialog: role, aria-modal, a label
 * reference, a focus trap that returns focus on close, and Escape to close.
 *
 *   const { dialogProps, titleId } = useDialog(isOpen, onClose);
 *   <div {...dialogProps}><h2 id={titleId}>…</h2></div>
 */
export function useDialog(
    isOpen: boolean,
    onClose: () => void,
    options: { initialFocus?: string; closeOnEscape?: boolean } = {}
) {
    const { initialFocus, closeOnEscape = true } = options;
    const ref = useFocusTrap(isOpen, { initialFocus });
    const titleId = useId();
    useEscapeKey(onClose, isOpen && closeOnEscape);

    return {
        ref,
        titleId,
        dialogProps: {
            ref,
            role: 'dialog' as const,
            'aria-modal': true as const,
            'aria-labelledby': titleId,
            tabIndex: -1,
        },
    };
}


// Only the most recently activated Escape handler runs, so a confirm dialog opened on
// top of a modal closes first instead of both closing together.
const escapeHandlerStack: Array<{ current: () => void }> = [];

const handleStackedEscape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    const top = escapeHandlerStack[escapeHandlerStack.length - 1];
    if (!top) return;
    // Mark as handled so the app-level Escape (back navigation) does not also fire.
    event.preventDefault();
    top.current();
};

/**
 * Hook to handle Escape key to close modals
 */
export function useEscapeKey(onEscape: () => void, isActive: boolean = true) {
    const handlerRef = useRef(onEscape);
    handlerRef.current = onEscape;

    useEffect(() => {
        if (!isActive) return;

        const entry = { current: () => handlerRef.current() };
        escapeHandlerStack.push(entry);
        if (escapeHandlerStack.length === 1) {
            document.addEventListener('keydown', handleStackedEscape);
        }

        return () => {
            const index = escapeHandlerStack.indexOf(entry);
            if (index !== -1) escapeHandlerStack.splice(index, 1);
            if (escapeHandlerStack.length === 0) {
                document.removeEventListener('keydown', handleStackedEscape);
            }
        };
    }, [isActive]);
}

/**
 * Hook to announce content to screen readers
 */
export function useAnnounce() {
    const announce = useCallback((message: string, priority: 'polite' | 'assertive' = 'polite') => {
        const announcer = document.createElement('div');
        announcer.setAttribute('role', 'status');
        announcer.setAttribute('aria-live', priority);
        announcer.setAttribute('aria-atomic', 'true');
        announcer.className = 'sr-only';
        announcer.textContent = message;

        document.body.appendChild(announcer);

        // Remove after announcement
        setTimeout(() => {
            document.body.removeChild(announcer);
        }, 1000);
    }, []);

    return announce;
}
