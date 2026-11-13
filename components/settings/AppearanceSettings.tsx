import React from 'react';
import { Globe, Zap, Flame, Monitor, Coffee, Crown, Gem, Cpu, Sun, Moon, Waves, Star, Heart, Palette, Cloud } from 'lucide-react';
import clsx from 'clsx';
import { AppState } from '../../types';
import { TRANSLATIONS } from '../../constants';

interface AppearanceSettingsProps {
    state: AppState;
    setState: React.Dispatch<React.SetStateAction<AppState>>;
}

export const AppearanceSettings: React.FC<AppearanceSettingsProps> = ({ state, setState }) => {
    const t = TRANSLATIONS[state.language];

    return (
        <div className="space-y-8">
            {/* Language Section */}
            <section className="space-y-4">
                <h3 className="text-lg font-medium text-on-surface">{t.language}</h3>
                <div className="flex gap-3">
                    <button
                        onClick={() => setState(prev => ({ ...prev, language: 'en' }))}
                        className={clsx(
                            "px-4 py-2 rounded-xl font-medium transition-all border flex items-center gap-2",
                            state.language === 'en'
                                ? "bg-secondary-container text-on-secondary-container border-secondary-container"
                                : "bg-surface-container-low text-on-surface border-outline/20 hover:bg-surface-container-high"
                        )}
                    >
                        <Globe size={18} /> English
                    </button>
                    <button
                        onClick={() => setState(prev => ({ ...prev, language: 'sr' }))}
                        className={clsx(
                            "px-4 py-2 rounded-xl font-medium transition-all border flex items-center gap-2",
                            state.language === 'sr'
                                ? "bg-secondary-container text-on-secondary-container border-secondary-container"
                                : "bg-surface-container-low text-on-surface border-outline/20 hover:bg-surface-container-high"
                        )}
                    >
                        <Globe size={18} /> Srpski
                    </button>
                </div>
            </section>

            {/* Theme Section */}
            <section className="space-y-4">
                <h3 className="text-lg font-medium text-on-surface">{t.appTheme}</h3>

                {/* Quick Light/Dark Toggle */}
                <div className="flex items-center justify-between bg-surface-container-low p-4 rounded-xl">
                    <span className="text-on-surface font-medium">
                        {t.quickToggle}
                    </span>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setState(prev => ({ ...prev, theme: 'light' }))}
                            className={clsx(
                                "flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all",
                                state.theme === 'light'
                                    ? "bg-primary text-on-primary"
                                    : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
                            )}
                            aria-label={t.lightModeLabel}
                        >
                            <Sun size={18} />
                            <span className="hidden sm:inline">{t.themeLight}</span>
                        </button>
                        <button
                            onClick={() => setState(prev => ({ ...prev, theme: 'galaxy' }))}
                            className={clsx(
                                "flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all",
                                state.theme !== 'light'
                                    ? "bg-primary text-on-primary"
                                    : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
                            )}
                            aria-label={t.darkModeLabel}
                        >
                            <Moon size={18} />
                            <span className="hidden sm:inline">{t.themeDark}</span>
                        </button>
                    </div>
                </div>

                {/* Theme Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {[
                        { id: 'light', name: t.themeLight, icon: Sun, colors: ['#3b82f6', '#8b5cf6', '#f8fafc'] },
                        { id: 'linen', name: 'Linen', icon: Palette, colors: ['#006d77', '#d97706', '#fcf8f2'] },
                        { id: 'mist', name: 'Mist', icon: Cloud, colors: ['#0e7490', '#3b82f6', '#f4f8fc'] },
                        { id: 'galaxy', name: 'Galaxy', icon: Star, colors: ['#8b5cf6', '#d946ef', '#0a0a1a'] },
                        { id: 'harbor', name: 'Harbor', icon: Waves, colors: ['#2dd4bf', '#fbbf24', '#070c16'] },
                        { id: 'evergreen', name: 'Evergreen', icon: Heart, colors: ['#22c55e', '#f97316', '#08100c'] },
                        { id: 'neon', name: 'Terminal', icon: Zap, colors: ['#22c55e', '#a855f7', '#0a0a0a'] },
                        { id: 'racing-orange', name: 'Racing Orange', icon: Flame, colors: ['#f97316', '#fb923c', '#0a0a0a'] },
                        { id: 'graphite', name: 'Graphite', icon: Monitor, colors: ['#22d3ee', '#facc15', '#08090b'] },
                        { id: 'coffee', name: 'Coffee', icon: Coffee, colors: ['#d97706', '#92400e', '#1c1917'] },
                        { id: 'gilded', name: 'Gilded', icon: Crown, colors: ['#facc15', '#14b8a6', '#0c0a08'] },
                        { id: 'crimson-red', name: 'Crimson Red', icon: Gem, colors: ['#ef4444', '#dc2626', '#1a0a0a'] },
                        { id: 'lime-dark', name: 'Lime Dark', icon: Cpu, colors: ['#84cc16', '#65a30d', '#0a0f0a'] },
                        { id: 'sterling', name: 'Sterling', icon: Gem, colors: ['#60a5fa', '#fb923c', '#0a0e16'] },
                        { id: 'canyon', name: 'Canyon', icon: Flame, colors: ['#ea580c', '#84a98c', '#140c0a'] },
                        { id: 'cyberpunk-pink', name: 'Cyberpunk Pink', icon: Gem, colors: ['#ec4899', '#f472b6', '#1a0a14'] },
                    ].map(theme => (
                        <button
                            key={theme.id}
                            onClick={() => setState(prev => ({ ...prev, theme: theme.id as AppState['theme'] }))}
                            className={clsx(
                                "flex flex-col items-center gap-2 p-4 rounded-xl font-medium transition-all border",
                                "bg-surface-container-low text-on-surface border-outline/20 hover:bg-surface-container-high hover:scale-[1.02]",
                                state.theme === theme.id && "ring-2 ring-primary ring-offset-2 ring-offset-surface"
                            )}
                        >
                            {/* Color swatches */}
                            <div className="flex gap-1">
                                {theme.colors.map((color, i) => (
                                    <div
                                        key={i}
                                        className="w-5 h-5 rounded-full border border-outline-variant/30 shadow-sm"
                                        style={{ backgroundColor: color }}
                                    />
                                ))}
                            </div>
                            <div className="flex items-center gap-1.5">
                                <theme.icon size={14} />
                                <span className="text-sm">{theme.name}</span>
                            </div>
                        </button>
                    ))}
                </div>
            </section>
        </div>
    );
};
