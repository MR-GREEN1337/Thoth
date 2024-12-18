// components/auth/IntertwiningArcs.tsx
'use client';

import { motion } from 'framer-motion';

export const IntertwiningArcs = () => {
  // More complex arc paths creating a rich, interweaving pattern
  const arcs = [
    // Longer horizontal waves
    "M -200 200 Q 0 100, 200 200 T 600 200",
    "M -200 300 Q 0 400, 200 300 T 600 300",
    "M -200 250 Q 0 150, 200 250 T 600 250",
    "M -200 350 Q 0 450, 200 350 T 600 350",
    
    // Diagonal waves
    "M -100 -50 Q 200 200, 400 100 T 700 300",
    "M -100 600 Q 200 300, 400 400 T 700 100",
    
    // Vertical waves
    "M 100 -100 Q 200 200, 100 400 T 200 700",
    "M 300 -100 Q 400 200, 300 400 T 400 700",
    
    // Additional interweaving patterns
    "M -200 150 Q 100 50, 300 250 T 600 150",
    "M -200 400 Q 100 500, 300 300 T 600 400",
    "M -100 100 Q 200 300, 400 200 T 700 400",
    "M -100 500 Q 200 300, 400 400 T 700 200",
    
    // Smaller detail arcs
    "M 50 0 Q 150 100, 250 50 T 450 150",
    "M 50 500 Q 150 400, 250 450 T 450 350",
    "M 150 50 Q 250 150, 350 100 T 550 200",
    "M 150 550 Q 250 450, 350 500 T 550 400"
  ];

  return (
    <div className="absolute inset-0 overflow-hidden opacity-30">
      <svg 
        className="w-full h-full"
        viewBox="-200 -100 900 800" 
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          {/* Enhanced gradients for more visual interest */}
          <linearGradient id="gradient1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="50%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
          <linearGradient id="gradient2" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="50%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>
          <linearGradient id="gradient3" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#8b5cf6" />
            <stop offset="50%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#6366f1" />
          </linearGradient>
        </defs>
        <g>
          {arcs.map((path, index) => (
            <motion.path
              key={index}
              d={path}
              stroke={`url(#gradient${(index % 3) + 1})`}
              strokeWidth="1.5"
              fill="none"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ 
                pathLength: 1, 
                opacity: 1,
                translateY: [0, -10, 0],
                translateX: [0, index % 2 === 0 ? 10 : -10, 0],
              }}
              transition={{
                pathLength: { 
                  duration: 3,
                  delay: index * 0.2,
                  ease: "easeInOut"
                },
                opacity: { 
                  duration: 1,
                  delay: index * 0.2 
                },
                translateY: {
                  duration: 8 + index % 4,
                  repeat: Infinity,
                  repeatType: "reverse",
                  ease: "easeInOut",
                  delay: index * 0.5
                },
                translateX: {
                  duration: 10 + index % 5,
                  repeat: Infinity,
                  repeatType: "reverse",
                  ease: "easeInOut",
                  delay: index * 0.5
                }
              }}
            />
          ))}
        </g>
      </svg>
    </div>
  );
};