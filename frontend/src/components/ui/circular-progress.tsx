"use client";

import * as React from "react";
import { motion, useSpring, useTransform } from "framer-motion";
import { cn } from "../../lib/utils";

interface CircularProgressProps {
  value: number; // 0-100
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
  className?: string;
}

export const CircularProgress: React.FC<CircularProgressProps> = ({
  value,
  size = 120,
  strokeWidth = 10,
  color = "hsl(var(--fo-accent))",
  trackColor = "hsl(var(--fo-border))",
  className,
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // Clamp value between 0 and 100
  const clampedValue = Math.min(100, Math.max(0, value));
  const strokeDashoffset = circumference * (1 - clampedValue / 100);

  // Spring animation for smooth transitions
  const springValue = useSpring(0, {
    damping: 25,
    stiffness: 120,
  });

  const springOffset = useSpring(circumference, {
    damping: 25,
    stiffness: 120,
  });

  // Transform spring value to display text
  const displayValue = useTransform(springValue, (v) => `${Math.round(v)}%`);

  React.useEffect(() => {
    springValue.set(clampedValue);
    springOffset.set(strokeDashoffset);
  }, [clampedValue, strokeDashoffset, springValue, springOffset]);

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clampedValue}
      aria-label={`Progress: ${clampedValue}%`}
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="transform -rotate-90"
        aria-hidden="true"
      >
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke={trackColor}
          strokeWidth={strokeWidth}
        />
        {/* Progress arc */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          style={{ strokeDashoffset: springOffset }}
          strokeLinecap="round"
        />
      </svg>
      {/* Center text */}
      <motion.span
        className="absolute text-2xl font-bold"
        style={{ color }}
      >
        {displayValue}
      </motion.span>
    </div>
  );
};

export default CircularProgress;
