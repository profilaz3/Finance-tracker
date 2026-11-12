import React, { useEffect, useState } from 'react';
import { motion, useSpring, useTransform } from 'framer-motion';

interface AnimatedNumberProps {
    value: number;
    className?: string;
    decimals?: number;
}

export const AnimatedNumber: React.FC<AnimatedNumberProps> = ({ value, className = '', decimals = 2 }) => {
    const spring = useSpring(0, { stiffness: 75, damping: 15 });
    const display = useTransform(spring, (current) =>
        current.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    );

    useEffect(() => {
        spring.set(value);
    }, [spring, value]);

    return <motion.span className={className}>{display}</motion.span>;
};
