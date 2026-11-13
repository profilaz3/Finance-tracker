import React from 'react';
import {
  BadgeCheck,
  Car,
  Cloud,
  Code2,
  Dumbbell,
  Gamepad2,
  GraduationCap,
  Music,
  Newspaper,
  Repeat,
  ShieldCheck,
  Smartphone,
  Tv,
  Wifi,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { ServiceType } from '../../utils/aiCleanup';

const SERVICE_STYLE: Record<ServiceType, { icon: LucideIcon; color: string }> = {
  streaming: { icon: Tv, color: '#DC2626' },
  music: { icon: Music, color: '#16A34A' },
  gym: { icon: Dumbbell, color: '#EA580C' },
  phone: { icon: Smartphone, color: '#2563EB' },
  internet: { icon: Wifi, color: '#0891B2' },
  software: { icon: Code2, color: '#7C3AED' },
  cloud: { icon: Cloud, color: '#0EA5E9' },
  insurance: { icon: ShieldCheck, color: '#0F766E' },
  utilities: { icon: Zap, color: '#CA8A04' },
  news: { icon: Newspaper, color: '#475569' },
  gaming: { icon: Gamepad2, color: '#9333EA' },
  education: { icon: GraduationCap, color: '#4F46E5' },
  transport: { icon: Car, color: '#1D4ED8' },
  membership: { icon: BadgeCheck, color: '#DB2777' },
  other: { icon: Repeat, color: '#64748B' },
};

/** Tinted tile for a subscription's service type, matching CategoryGlyph's look. */
export const ServiceGlyph: React.FC<{ service: ServiceType; size?: number }> = ({ service, size = 40 }) => {
  const { icon: Icon, color } = SERVICE_STYLE[service] ?? SERVICE_STYLE.other;
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-[14px]"
      style={{
        width: size,
        height: size,
        background: `color-mix(in oklab, ${color} 16%, var(--paper-tile))`,
        color: `color-mix(in oklab, ${color} 72%, var(--paper-text))`,
      }}
    >
      <Icon size={Math.round(size * 0.48)} strokeWidth={2.1} />
    </span>
  );
};
