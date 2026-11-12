import React from 'react';

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
}

export type IconComponent = React.ComponentType<IconProps>;

const BaseIcon: React.FC<IconProps & { children: React.ReactNode }> = ({
  size = 24,
  className,
  children,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    {children}
  </svg>
);

export const LayoutDashboardIcon: React.FC<IconProps> = (props) => (
  <BaseIcon {...props}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="4.5" rx="1.5" />
    <rect x="14" y="10.5" width="7" height="10.5" rx="1.5" />
    <rect x="3" y="13.5" width="7" height="7.5" rx="1.5" />
  </BaseIcon>
);

export const ListIcon: React.FC<IconProps> = (props) => (
  <BaseIcon {...props}>
    <circle cx="5" cy="7" r="1.2" />
    <circle cx="5" cy="12" r="1.2" />
    <circle cx="5" cy="17" r="1.2" />
    <path d="M9 7h10" />
    <path d="M9 12h10" />
    <path d="M9 17h10" />
  </BaseIcon>
);

export const SettingsIcon: React.FC<IconProps> = (props) => (
  <BaseIcon {...props}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M12 2.8v2.1" />
    <path d="M12 19.1v2.1" />
    <path d="m4.9 4.9 1.5 1.5" />
    <path d="m17.6 17.6 1.5 1.5" />
    <path d="M2.8 12h2.1" />
    <path d="M19.1 12h2.1" />
    <path d="m4.9 19.1 1.5-1.5" />
    <path d="m17.6 6.4 1.5-1.5" />
  </BaseIcon>
);

export const PieChartIcon: React.FC<IconProps> = (props) => (
  <BaseIcon {...props}>
    <path d="M11 3a9 9 0 1 0 10 10h-8a2 2 0 0 1-2-2V3Z" />
    <path d="M14 3.5a8.5 8.5 0 0 1 6.5 6.5H14V3.5Z" />
  </BaseIcon>
);

export const CalendarIcon: React.FC<IconProps> = (props) => (
  <BaseIcon {...props}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M16 3v4" />
    <path d="M8 3v4" />
    <path d="M3 10h18" />
  </BaseIcon>
);

export const MapPinIcon: React.FC<IconProps> = (props) => (
  <BaseIcon {...props}>
    <path d="M12 21s6-5.5 6-11a6 6 0 1 0-12 0c0 5.5 6 11 6 11Z" />
    <circle cx="12" cy="10" r="2.5" />
  </BaseIcon>
);

export const SparklesIcon: React.FC<IconProps> = (props) => (
  <BaseIcon {...props}>
    <path d="m12 3 1.4 3.6L17 8l-3.6 1.4L12 13l-1.4-3.6L7 8l3.6-1.4L12 3Z" />
    <path d="m18 14 .8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2Z" />
    <path d="m6 14 .8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2Z" />
  </BaseIcon>
);

export const CheckCircleIcon: React.FC<IconProps> = (props) => (
  <BaseIcon {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8.5 12 2.2 2.3 4.8-4.8" />
  </BaseIcon>
);

export const XCircleIcon: React.FC<IconProps> = (props) => (
  <BaseIcon {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="m9 9 6 6" />
    <path d="m15 9-6 6" />
  </BaseIcon>
);

export const AlertCircleIcon: React.FC<IconProps> = (props) => (
  <BaseIcon {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5.5" />
    <circle cx="12" cy="16.5" r="0.8" fill="currentColor" stroke="none" />
  </BaseIcon>
);

export const InfoIcon: React.FC<IconProps> = (props) => (
  <BaseIcon {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 10.5v5" />
    <circle cx="12" cy="7.5" r="0.8" fill="currentColor" stroke="none" />
  </BaseIcon>
);

export const CloseIcon: React.FC<IconProps> = (props) => (
  <BaseIcon {...props}>
    <path d="M6 6 18 18" />
    <path d="M18 6 6 18" />
  </BaseIcon>
);

export const CloudIcon: React.FC<IconProps> = (props) => (
  <BaseIcon {...props}>
    <path d="M8 18h8a4 4 0 0 0 .3-8A5.5 5.5 0 0 0 6 11a3.5 3.5 0 0 0 2 7Z" />
  </BaseIcon>
);

export const RefreshIcon: React.FC<IconProps> = (props) => (
  <BaseIcon {...props}>
    <path d="M20 5v5h-5" />
    <path d="M4 19v-5h5" />
    <path d="M18 10a7 7 0 0 0-12-3" />
    <path d="M6 14a7 7 0 0 0 12 3" />
  </BaseIcon>
);

export const CheckIcon: React.FC<IconProps> = (props) => (
  <BaseIcon {...props}>
    <path d="m5 12 4 4 10-10" />
  </BaseIcon>
);

export const WifiOffIcon: React.FC<IconProps> = (props) => (
  <BaseIcon {...props}>
    <path d="m2 8 3.5 3.5" />
    <path d="m22 8-3.5 3.5" />
    <path d="M8.5 14.5a5 5 0 0 1 7 0" />
    <path d="M12 18.5h.01" />
    <path d="M3 3 21 21" />
    <path d="M5.5 11.5a10 10 0 0 1 13 0" />
  </BaseIcon>
);

export const AlertTriangleIcon: React.FC<IconProps> = (props) => (
  <BaseIcon {...props}>
    <path d="M12 4 21 20H3L12 4Z" />
    <path d="M12 9v5" />
    <circle cx="12" cy="17" r="0.8" fill="currentColor" stroke="none" />
  </BaseIcon>
);

export const HomeIcon: React.FC<IconProps> = (props) => (
  <BaseIcon {...props}>
    <path d="m4 11 8-7 8 7" />
    <path d="M6 10.5V20h12v-9.5" />
    <path d="M10 20v-5h4v5" />
  </BaseIcon>
);
