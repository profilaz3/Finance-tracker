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
import { IconTile, type IconTileProps } from '../ui/IconTile';

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

/** Brand-free colour of a service type, for bars and legends. */
export const serviceColor = (service: ServiceType): string => (SERVICE_STYLE[service] ?? SERVICE_STYLE.other).color;

/** A subscription's service type on the shared icon tile. */
export const ServiceGlyph: React.FC<{
  service: ServiceType;
  size?: number;
  badge?: React.ReactNode;
  shape?: IconTileProps['shape'];
  tone?: IconTileProps['tone'];
  className?: string;
}> = ({ service, size = 40, badge, shape, tone, className }) => {
  const { icon, color } = SERVICE_STYLE[service] ?? SERVICE_STYLE.other;
  return <IconTile icon={icon} color={color} size={size} badge={badge} shape={shape} tone={tone} className={className} />;
};
