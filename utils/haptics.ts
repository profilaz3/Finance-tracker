import { Capacitor } from '@capacitor/core';

export const HAPTIC_PATTERNS = {
    success: [10, 30, 10],
    error: [50, 50, 50],
    light: 10,
    medium: 20,
    heavy: 40,
};

type HapticsModule = typeof import('@capacitor/haptics');
let hapticsModule: Promise<HapticsModule> | null = null;

const isNative = (): boolean => {
    try {
        return Capacitor.isNativePlatform();
    } catch {
        return false;
    }
};

/** Native taptic feedback through the Haptics plugin (loaded on first use). */
const native = (run: (haptics: HapticsModule) => Promise<void>) => {
    hapticsModule ??= import('@capacitor/haptics');
    hapticsModule.then(run).catch(() => {
        // Haptics are a nicety; never let them surface an error.
    });
};

/**
 * Haptic feedback. On the phone this uses the system haptics engine (crisp ticks, success and
 * error patterns); in a browser it falls back to the Vibration API where available.
 */
export const vibrate = (pattern: number | number[] = 10) => {
    if (isNative()) {
        native(async ({ Haptics, ImpactStyle, NotificationType }) => {
            if (pattern === HAPTIC_PATTERNS.success) return Haptics.notification({ type: NotificationType.Success });
            if (pattern === HAPTIC_PATTERNS.error) return Haptics.notification({ type: NotificationType.Error });
            const strength = Array.isArray(pattern) ? Math.max(...pattern) : pattern;
            const style = strength <= 12 ? ImpactStyle.Light : strength <= 25 ? ImpactStyle.Medium : ImpactStyle.Heavy;
            return Haptics.impact({ style });
        });
        return;
    }
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(pattern);
    }
};

/** The faint tick of a picker or switch landing on a new value. */
export const hapticSelection = () => {
    if (isNative()) {
        native(({ Haptics }) => Haptics.selectionChanged());
        return;
    }
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(5);
};
