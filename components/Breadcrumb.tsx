import React from 'react';
import { ChevronRight, Home } from 'lucide-react';
import { m } from 'motion/react';

export interface BreadcrumbItem {
    label: string;
    onClick?: () => void;
    icon?: React.ReactNode;
}

interface BreadcrumbProps {
    items: BreadcrumbItem[];
    className?: string;
}

export const Breadcrumb: React.FC<BreadcrumbProps> = ({ items, className = '' }) => {
    if (items.length === 0) return null;

    return (
        <nav
            aria-label="Breadcrumb"
            className={`flex items-center gap-1 text-sm overflow-x-auto ${className}`}
        >
            <ol className="flex items-center gap-1 list-none m-0 p-0">
                {items.map((item, index) => {
                    const isLast = index === items.length - 1;
                    const isClickable = !!item.onClick && !isLast;

                    return (
                        <li key={index} className="flex items-center gap-1">
                            {index > 0 && (
                                <ChevronRight
                                    size={14}
                                    className="text-on-surface-variant/50 flex-shrink-0"
                                    aria-hidden="true"
                                />
                            )}
                            {isClickable ? (
                                <m.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={item.onClick}
                                    className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors whitespace-nowrap"
                                >
                                    {item.icon}
                                    <span>{item.label}</span>
                                </m.button>
                            ) : (
                                <span
                                    className={`flex items-center gap-1.5 px-2 py-1 whitespace-nowrap ${
                                        isLast
                                            ? 'text-on-surface font-medium'
                                            : 'text-on-surface-variant'
                                    }`}
                                    aria-current={isLast ? 'page' : undefined}
                                >
                                    {item.icon}
                                    <span>{item.label}</span>
                                </span>
                            )}
                        </li>
                    );
                })}
            </ol>
        </nav>
    );
};
