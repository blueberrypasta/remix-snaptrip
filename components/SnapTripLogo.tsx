
import React from 'react';

interface SnapTripLogoProps {
  className?: string;
}

export const SnapTripLogo: React.FC<SnapTripLogoProps> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 100 100"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* Background Circle */}
    <circle 
      cx="50" 
      cy="50" 
      r="50" 
      fill="#f5f2eb" 
    />
    
    {/* Points/Chevron (Tan color) */}
    <path 
      d="M42 39.5L46.5 42.5L43.5 45.5L39.5 44.5L42 39.5Z" 
      fill="#bfa47e" 
    />
    
    {/* Body Section (Dark charcoal) */}
    <path 
      d="M43.5 50.5L37.5 48.5L28.5 57.5L31.5 70.5L35.5 70.5L43.5 50.5Z" 
      fill="#2d2d2d" 
    />
    
    {/* Wing Section (Dark charcoal) */}
    <path 
      d="M43.5 50.5L54.5 51.5L71.5 43.5L69.5 40.5L60.5 45.5L53.5 35.5L43.5 50.5Z" 
      fill="#2d2d2d" 
    />

    {/* Subtle highlight for better contrast in dark mode */}
    <defs>
      <filter id="shadow" x="0" y="0" width="100" height="100">
        <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.1" />
      </filter>
    </defs>
  </svg>
);
