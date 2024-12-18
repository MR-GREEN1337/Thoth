"use client"

import React from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';

// Pre-define arrays to avoid client/server mismatch
const FLOW_PATHS = [
  "M -200 200 Q 0 100, 200 200 T 600 200",
  "M -100 -50 Q 200 200, 400 100 T 700 300",
  "M 100 -100 Q 200 200, 100 400 T 200 700",
  "M -200 150 Q 100 50, 300 250 T 600 150"
];

const HIEROGLYPHS_CONFIG = [
  { left: "0%", delay: "0s", duration: "4s" },
  { left: "10%", delay: "0.5s", duration: "4.5s" },
  { left: "20%", delay: "1s", duration: "4.2s" },
  { left: "30%", delay: "1.5s", duration: "4.7s" },
  { left: "40%", delay: "2s", duration: "4.3s" },
  { left: "50%", delay: "2.5s", duration: "4.8s" },
  { left: "60%", delay: "3s", duration: "4.1s" },
  { left: "70%", delay: "3.5s", duration: "4.6s" },
  { left: "80%", delay: "4s", duration: "4.4s" },
  { left: "90%", delay: "4.5s", duration: "4.9s" }
];

const ThothLanding = () => {
  const router = useRouter()
  return (
    <div className="min-h-screen relative overflow-hidden bg-[#0A0A0F]">
      {/* Animated Background with Arcs */}
      <div className="absolute inset-0">
        <svg className="w-full h-full opacity-30" viewBox="-200 -100 900 800" preserveAspectRatio="xMidYMid slice">
          <defs>
            <linearGradient id="mysticGradient1" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#B7791F" />
              <stop offset="50%" stopColor="#92400E" />
              <stop offset="100%" stopColor="#78350F" />
            </linearGradient>
            <linearGradient id="mysticGradient2" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#92400E" />
              <stop offset="50%" stopColor="#78350F" />
              <stop offset="100%" stopColor="#B7791F" />
            </linearGradient>
            <linearGradient id="mysticGradient3" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#78350F" />
              <stop offset="50%" stopColor="#B7791F" />
              <stop offset="100%" stopColor="#92400E" />
            </linearGradient>
          </defs>
          {FLOW_PATHS.map((path, i) => (
            <path
              key={i}
              className={`animate-flow-${i}`}
              d={path}
              stroke={`url(#mysticGradient${(i % 3) + 1})`}
              strokeWidth="1.5"
              fill="none"
            />
          ))}
        </svg>
      </div>

      {/* Mystical Overlay Effects */}
      <div className="absolute inset-0">
        {/* Sacred geometry pattern */}
        <div className="absolute inset-0 opacity-5 animate-spin-slow"></div>
        
        {/* Hieroglyphic rain effect */}
        <div className="absolute inset-0 overflow-hidden">
          {HIEROGLYPHS_CONFIG.map((config, i) => (
            <div
              key={i}
              className="absolute text-amber-500/20 text-xl animate-fall"
              style={{
                left: config.left,
                animationDelay: config.delay,
                animationDuration: config.duration
              }}
            >
              {"𓁹𓂀𓃭𓆣𓇋𓈖𓉐𓊝"}
            </div>
          ))}
        </div>

        {/* Energy orbs */}
        <div className="absolute top-1/3 left-1/4 w-96 h-96 animate-pulse-slow">
          <div className="absolute inset-0 bg-gradient-to-r from-amber-900/20 via-amber-600/20 to-amber-900/20 rounded-full blur-3xl"></div>
        </div>
      </div>

      {/* Content */}
      <div className="relative z-10 min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <div className="mb-8">
            <div className="text-8xl font-bold mb-2 animate-glow">𓅓</div>
            <div className="text-5xl md:text-7xl font-bold bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-500 bg-clip-text text-transparent animate-shimmer">
              THOTH
            </div>
            <p className="text-amber-400/80 text-xl mt-6 max-w-xl mx-auto">
              Divine tomorrow's knowledge paths with AI-guided wisdom
            </p>
          </div>

          <Button 
            className="bg-transparent border-2 border-amber-500/50 text-amber-400 hover:bg-amber-500/10 
                     px-8 py-6 text-xl rounded-full transition-all duration-500 backdrop-blur-sm 
                     hover:scale-105 hover:border-amber-400 group"
            onClick={() => {router.push('/sign-in')}}
          >
            <Sparkles className="mr-2 group-hover:animate-spin" />
            Enter
          </Button>
        </div>
      </div>

      <style jsx>{`
        @keyframes shimmer {
          0% { background-position: 200% 50%; }
          100% { background-position: -200% 50%; }
        }

        @keyframes glow {
          0%, 100% { text-shadow: 0 0 20px rgba(245, 158, 11, 0.5); }
          50% { text-shadow: 0 0 40px rgba(245, 158, 11, 0.8); }
        }

        @keyframes fall {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100vh); }
        }

        .animate-shimmer {
          background-size: 200% auto;
          animation: shimmer 8s linear infinite;
        }

        .animate-glow {
          animation: glow 3s ease-in-out infinite;
        }

        .animate-flow-0 { animation: flow0 20s linear infinite; }
        .animate-flow-1 { animation: flow1 25s linear infinite; }
        .animate-flow-2 { animation: flow2 30s linear infinite; }
        .animate-flow-3 { animation: flow3 35s linear infinite; }

        @keyframes flow0 {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          50% { transform: translate(20px, 20px) rotate(2deg); }
        }
        @keyframes flow1 {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          50% { transform: translate(-20px, 20px) rotate(-2deg); }
        }
        @keyframes flow2 {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          50% { transform: translate(20px, -20px) rotate(2deg); }
        }
        @keyframes flow3 {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          50% { transform: translate(-20px, -20px) rotate(-2deg); }
        }
      `}</style>
    </div>
  );
};

export default ThothLanding;