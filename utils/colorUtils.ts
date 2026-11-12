/**
 * Color utility functions for hex parsing, luminance calculation, and contrast text.
 */

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const cleaned = hex.replace('#', '').trim();
    const normalized = cleaned.length === 3
        ? cleaned.split('').map(ch => ch + ch).join('')
        : cleaned;
    if (normalized.length !== 6) return null;
    const num = parseInt(normalized, 16);
    return {
        r: (num >> 16) & 255,
        g: (num >> 8) & 255,
        b: num & 255
    };
}

export function getLuminance(r: number, g: number, b: number): number {
    const toLinear = (value: number) => {
        const channel = value / 255;
        return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
    };
    const [lr, lg, lb] = [toLinear(r), toLinear(g), toLinear(b)];
    return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

/** Returns '#fff' or '#000' for best contrast against the given hex background. */
export function getContrastText(hex: string): string {
    const rgb = hexToRgb(hex);
    if (!rgb) return '#fff';
    return getLuminance(rgb.r, rgb.g, rgb.b) > 0.4 ? '#000' : '#fff';
}
