import React from 'react';
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface LogoProps {
  className?: string;
  variant?: 'default' | 'auth';
}

function Logo({ className, variant = 'default' }: LogoProps) {
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={cn("flex items-center", className)}
    >
      <div className="relative group">
        {/* Background glow effect */}
        <div className="absolute -inset-1 bg-gradient-to-r from-amber-600/20 via-amber-500/20 to-amber-600/20 rounded-lg blur-lg group-hover:opacity-100 transition duration-1000 group-hover:duration-200 animate-pulse-slow opacity-50" />
        
        {/* Logo container */}
        <div className="relative flex items-center space-x-3">
          {/* Thoth symbol */}
          <motion.div
            initial={{ scale: 0.5 }}
            animate={{ scale: 1 }}
            transition={{
              type: "spring",
              stiffness: 260,
              damping: 20
            }}
            className="relative"
          >
            <div className={cn(
              "text-5xl transform transition-transform duration-500 group-hover:scale-110",
              variant === 'default' ? "text-amber-500" : "text-amber-400"
            )}>
              𓅓
            </div>
            
            {/* Rotating ring around symbol */}
            <div className="absolute inset-0 w-full h-full">
              <div className="absolute inset-0 rounded-full border border-amber-500/30 animate-spin-slow" />
              <div className="absolute inset-0 rounded-full border border-amber-500/20 animate-reverse-spin" />
            </div>
          </motion.div>

          {/* Text */}
          <motion.span
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className={cn(
              "text-2xl font-['Spline_Sans_Mono'] tracking-[0.2em] font-bold",
              variant === 'default' 
                ? "bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 bg-clip-text text-transparent" 
                : "text-amber-400",
              "relative z-10"
            )}
          >
            THOTH
          </motion.span>
        </div>
      </div>

      {/* Custom animations */}
      <style jsx>{`
        @keyframes spin-slow {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes reverse-spin {
          from {
            transform: rotate(360deg);
          }
          to {
            transform: rotate(0deg);
          }
        }

        @keyframes pulse-slow {
          0%, 100% {
            opacity: 0.5;
          }
          50% {
            opacity: 0.8;
          }
        }

        .animate-spin-slow {
          animation: spin-slow 12s linear infinite;
        }

        .animate-reverse-spin {
          animation: reverse-spin 10s linear infinite;
        }

        .animate-pulse-slow {
          animation: pulse-slow 4s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
      `}</style>
    </motion.div>
  );
}

export default Logo;