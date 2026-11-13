import { useEffect, useRef, useCallback } from 'react';

/**
 * Hook to trap focus within a container (useful for modals)
 * @param isActive - Whether the focus trap is active
 * @param options - Configuration options
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

    const { initialFocus, returnFocus = true } = options;

    const getFocusableElements = useCallback(() => {
        if (!containerRef.current) return [];

        const focusableSelectors = [
            'button:not([disabled])',
            'input:not([disabled])',
            'select:not([disabled])',
            'textarea:not([disabled])',
            'a[href]',
            '[tabindex]:not([tabindex="-1"])',
        ].join(', ');

        return Array.from(
            containerRef.current.querySelectorAll<HTMLElement>(focusableSelectors)
        ).filter(el => el.offsetParent !== null); // Filter out hidden elements
    }, []);

    const handleKeyDown = useCallback((event: KeyboardEvent) => {
        if (!isActive || event.key !== 'Tab') return;

        const focusableElements = getFocusableElements();
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        // Shift + Tab on first element -> go to last
        if (event.shiftKey && document.activeElement === firstElement) {
            event.preventDefault();
            lastElement.focus();
        }
        // Tab on last element -> go to first
        else if (!event.shiftKey && document.activeElement === lastElement) {
            event.preventDefault();
            firstElement.focus();
        }
    }, [isActive, getFocusableElements]);

    useEffect(() => {
        if (isActive) {
            // Store current focus
            previousActiveElement.current = document.activeElement;

            // Set initial focus
            const focusableElements = getFocusableElements();
            if (initialFocus && containerRef.current) {
                const initialElement = containerRef.current.querySelector<HTMLElement>(initialFocus);
                if (initialElement) {
                    initialElement.focus();
                } else if (focusableElements.length > 0) {
                    focusableElements[0].focus();
                }
            } else if (focusableElements.length > 0) {
                focusableElements[0].focus();
            }

            // Add keyboard listener
            document.addEventListener('keydown', handleKeyDown);
        }

        return () => {
            document.removeEventListener('keydown', handleKeyDown);

            // Return focus on cleanup
            if (returnFocus && previousActiveElement.current instanceof HTMLElement) {
                previousActiveElement.current.focus();
            }
        };
    }, [isActive, initialFocus, returnFocus, handleKeyDown, getFocusableElements]);

    return containerRef;
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
