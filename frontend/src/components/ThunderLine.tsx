import React from 'react';

interface ThunderLineProps {
  className?: string;
  color?: string;
}

export const ThunderLine: React.FC<ThunderLineProps> = ({ 
  className = "w-48 h-3", 
  color = "#ff5c35" 
}) => {
  return (
    <div className={`relative overflow-hidden inline-flex items-center ${className}`}>
      <svg
        viewBox="0 0 240 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
        preserveAspectRatio="none"
      >
        <path
          d="M0 8 Q 15 0, 30 8 T 60 8 T 90 8 T 120 8 T 150 8 T 180 8 T 210 8 T 240 8"
          stroke={color}
          strokeWidth="3.5"
          strokeLinecap="round"
          className="animate-squiggle"
        />
      </svg>
      <style>{`
        @keyframes squiggleRun {
          0% {
            stroke-dashoffset: 240;
          }
          100% {
            stroke-dashoffset: 0;
          }
        }
        .animate-squiggle {
          stroke-dasharray: 40 8;
          animation: squiggleRun 2.2s linear infinite;
        }
      `}</style>
    </div>
  );
};
