import React from 'react';
import { Pencil, UserRound } from 'lucide-react';
import { Person } from '../types';
import { TRANSLATIONS } from '../constants';
import { Avatar } from './home/parts';

interface MyProfileSectionProps {
    userProfile: Person | undefined;
    onCreateProfile: () => void;
    onEditProfile: () => void;
    language: 'en' | 'sr';
}

export const MyProfileSection: React.FC<MyProfileSectionProps> = ({
    userProfile,
    onCreateProfile,
    onEditProfile,
    language
}) => {
    const t = TRANSLATIONS[language];

    if (!userProfile) {
        return (
            <section className="paper-tile flex flex-col items-center gap-3 px-6 py-8 text-center">
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-chip text-faint" aria-hidden="true">
                    <UserRound size={32} />
                </span>
                <h3 className="text-[17px] font-bold">{t.myProfile}</h3>
                <p className="max-w-[280px] text-[14px] text-muted">{t.noProfileYet}</p>
                <button
                    type="button"
                    onClick={onCreateProfile}
                    className="mt-1 flex h-11 items-center rounded-full bg-accent px-5 text-[15px] font-semibold text-on-accent"
                >
                    {t.createMyProfile}
                </button>
            </section>
        );
    }

    const image = userProfile.avatar?.startsWith('data:') || userProfile.avatar?.startsWith('http') ? userProfile.avatar : undefined;

    return (
        <section className="paper-tile flex items-center gap-4 p-4" aria-label={t.myProfile}>
            <span className="shrink-0 rounded-full p-1" style={{ background: `color-mix(in oklab, ${userProfile.color || 'rgb(var(--accent-rgb))'} 24%, transparent)` }}>
                <span className="block rounded-full shadow-[0_0_0_3px_var(--paper-tile)]">
                    <Avatar name={userProfile.name} color={userProfile.color} image={image} size={64} />
                </span>
            </span>
            <div className="min-w-0 flex-1">
                <h3 className="truncate text-[20px] font-bold tracking-[-0.3px]">{userProfile.name}</h3>
                {/* "My profile · EUR" read like a setting; this says what the profile is for. */}
                <p className="text-[13px] leading-snug text-muted">{t.myProfileHint}</p>
            </div>
            <button
                type="button"
                onClick={onEditProfile}
                aria-label={t.editProfile}
                title={t.editProfile}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-chip text-muted transition-colors hover:text-[var(--paper-text)]"
            >
                <Pencil size={18} aria-hidden="true" />
            </button>
        </section>
    );
};
