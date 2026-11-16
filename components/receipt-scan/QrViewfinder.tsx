import React from 'react';
import { m, useReducedMotion } from 'motion/react';

/** Fixed pseudo random modules so the drawing never changes between renders. */
const MODULES = [
    [3, 0], [5, 1], [4, 2], [0, 3], [2, 3], [5, 3], [7, 3], [9, 4], [1, 5], [3, 5], [4, 5], [6, 5], [8, 5],
    [10, 5], [3, 6], [7, 7], [9, 7], [10, 8], [5, 8], [3, 9], [7, 9], [4, 10], [6, 10], [8, 10], [10, 10],
] as const;

const Finder: React.FC<{ x: number; y: number }> = ({ x, y }) => (
    <g>
        <rect x={x} y={y} width="3" height="3" rx="0.7" fill="none" stroke="currentColor" strokeWidth="0.7" />
        <rect x={x + 0.95} y={y + 0.95} width="1.1" height="1.1" rx="0.3" fill="currentColor" />
    </g>
);

/**
 * A QR code inside viewfinder corners with a sweeping accent line: the "point your camera at the
 * code" picture on the scan sheet. Decorative; the line holds still with reduced motion.
 */
export const QrViewfinder: React.FC<{ size?: number }> = ({ size = 84 }) => {
    const reduceMotion = useReducedMotion();
    return (
        <svg width={size} height={size} viewBox="0 0 15 15" aria-hidden="true" className="shrink-0">
            <g fill="none" stroke="rgb(var(--accent-rgb))" strokeWidth="0.85" strokeLinecap="round">
                <path d="M0.6 3.4V1.6a1 1 0 0 1 1-1h1.8" />
                <path d="M11.6 0.6h1.8a1 1 0 0 1 1 1v1.8" />
                <path d="M14.4 11.6v1.8a1 1 0 0 1-1 1h-1.8" />
                <path d="M3.4 14.4H1.6a1 1 0 0 1-1-1v-1.8" />
            </g>
            <g transform="translate(2 2)" className="text-on-surface">
                <rect x="-0.5" y="-0.5" width="12" height="12" rx="1.6" fill="var(--paper-tile)" />
                <Finder x={0} y={0} />
                <Finder x={8} y={0} />
                <Finder x={0} y={8} />
                {MODULES.map(([x, y]) => (
                    <rect key={`${x}-${y}`} x={x} y={y} width="0.9" height="0.9" rx="0.2" fill="currentColor" />
                ))}
            </g>
            <m.rect
                x="1.4"
                width="12.2"
                height="0.5"
                rx="0.25"
                fill="rgb(var(--accent-rgb))"
                initial={{ y: 7.25 }}
                animate={reduceMotion ? { y: 7.25 } : { y: [2.2, 12.3, 2.2] }}
                transition={reduceMotion ? { duration: 0 } : { duration: 2.6, ease: 'easeInOut', repeat: Infinity }}
                style={{ filter: 'drop-shadow(0 0 0.5px rgb(var(--accent-rgb)))' }}
            />
        </svg>
    );
};
