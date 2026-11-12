export const vibrate = (pattern: number | number[] = 10) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(pattern);
    }
};

export const HAPTIC_PATTERNS = {
    success: [10, 30, 10],
    error: [50, 50, 50],
    light: 10,
    medium: 20,
    heavy: 40,
};
