import React from 'react';
import { m } from 'motion/react';
import { User, Edit2 } from 'lucide-react';
import { Person } from '../types';
import { TRANSLATIONS } from '../constants';

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
        // Empty state: "Create My Profile" card
        return (
            <m.section
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4 mb-8"
            >
                <h3 className="text-lg font-medium text-on-surface flex items-center gap-2">
                    <User size={20} /> {t.myProfile}
                </h3>
                <div className="bg-surface-container-low rounded-xl p-8 flex flex-col items-center justify-center shadow-elevation-1">
                    <div className="w-20 h-20 rounded-full bg-surface-container flex items-center justify-center mb-4">
                        <User size={40} className="text-on-surface-variant/40" />
                    </div>
                    <p className="text-on-surface-variant text-center mb-6 max-w-xs">
                        {t.noProfileYet}
                    </p>
                    <button
                        onClick={onCreateProfile}
                        className="px-6 py-3 bg-primary text-on-primary rounded-full font-medium shadow-elevation-1 hover:shadow-elevation-2 transition-all hover:scale-105 active:scale-95"
                    >
                        {t.createMyProfile}
                    </button>
                </div>
            </m.section>
        );
    }

    // Profile exists: show profile card with edit button
    const isImageAvatar = userProfile.avatar?.startsWith('data:') || userProfile.avatar?.startsWith('http');

    return (
        <m.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4 mb-8"
        >
            <h3 className="text-lg font-medium text-on-surface flex items-center gap-2">
                <User size={20} /> {t.myProfile}
            </h3>
            <div className="bg-surface-container-low rounded-xl p-6 shadow-elevation-1">
                <div className="flex items-center gap-4">
                    <div
                        className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-white shadow-lg overflow-hidden border-4 border-surface-container-highest flex-shrink-0"
                        style={{ backgroundColor: userProfile.color }}
                    >
                        {isImageAvatar ? (
                            <img src={userProfile.avatar} alt={userProfile.name} className="w-full h-full object-cover" />
                        ) : (
                            userProfile.avatar || userProfile.name.charAt(0).toUpperCase()
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <h4 className="text-xl font-medium text-on-surface truncate">{userProfile.name}</h4>
                        <p className="text-sm text-on-surface-variant">{userProfile.defaultCurrency}</p>
                    </div>
                    <button
                        onClick={onEditProfile}
                        className="p-3 bg-surface-container hover:bg-surface-container-high rounded-full transition-colors flex-shrink-0"
                    >
                        <Edit2 size={20} className="text-on-surface-variant" />
                    </button>
                </div>
            </div>
        </m.section>
    );
};
