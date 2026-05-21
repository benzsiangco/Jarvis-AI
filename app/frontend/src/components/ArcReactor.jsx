/**
 * Arc Reactor UI Component
 *
 * Iconic Iron Man-style reactor with state-aware animations and
 * optional outer RotatingHUD rings.
 *
 * Color states (in priority order):
 *   isError      → red glow      (something went wrong)
 *   isExecuting  → green glow    (tool call running)
 *   isLoading    → amber glow    (initial generation, no tokens yet)
 *   isThinking   → violet glow   (thinking/reasoning visible)
 *   isListening  → purple glow   (mic actively detecting speech)
 *   isSpeaking   → cyan pulse    (model speaking response)
 *   default      → soft cyan     (idle online)
 *
 * Props:
 *   isActive: boolean — reactor powered on
 *   isSpeaking, isListening, isLoading, isThinking, isExecuting, isError
 *   volume: number (0-1) — glow intensity
 *   onClick: function
 *   showHUD: boolean
 */
import React from 'react';
import { motion } from 'framer-motion';
import { RotatingHUD } from './RotatingHUD';

const STATE_COLORS = {
  error:     { primary: '#ef4444', light: '#fca5a5' },
  executing: { primary: '#22c55e', light: '#bbf7d0' },
  loading:   { primary: '#ffaa00', light: '#ffeebb' },
  thinking:  { primary: '#a78bfa', light: '#ddd6fe' },
  listening: { primary: '#a855f7', light: '#e9d5ff' },
  speaking:  { primary: '#00f3ff', light: '#aeefff' },
  idle:      { primary: '#00f3ff', light: '#aeefff' },
};

function pickState({ isError, isExecuting, isLoading, isThinking, isListening, isSpeaking }) {
  if (isError)     return 'error';
  if (isExecuting) return 'executing';
  if (isLoading)   return 'loading';
  if (isThinking)  return 'thinking';
  if (isListening) return 'listening';
  if (isSpeaking)  return 'speaking';
  return 'idle';
}

const ArcReactor = React.memo(({
  isActive,
  isSpeaking,
  isListening,
  isLoading,
  isThinking,
  isExecuting,
  isError,
  volume = 0,
  onClick,
  showHUD = true,
}) => {
  const coilCount = 10;
  const coils = Array.from({ length: coilCount }).map((_, i) => i);

  const stateName = pickState({ isError, isExecuting, isLoading, isThinking, isListening, isSpeaking });
  const { primary: baseColor, light: lightColor } = STATE_COLORS[stateName];
  const animatedScale = (stateName === 'loading' || stateName === 'thinking' || stateName === 'executing');
  const glowShadow = `0 0 ${15 + volume * 10}px ${baseColor}, inset 0 0 10px ${lightColor}`;

  return (
    <div className="relative flex items-center justify-center">
      {/* Rotating HUD Rings — always mounted so stagger animations play */}
      {showHUD && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-50 z-0">
          <RotatingHUD isActive={isActive} state={stateName} />
        </div>
      )}

      {/* Reactor Container with Framer-Motion scale + click feedback */}
      <motion.div
        className="relative z-50 cursor-pointer"
        onClick={onClick}
        initial={false}
        animate={{
          scale: isActive ? 1.2 : 0.5,
          opacity: isActive ? 1 : 0.45,
        }}
        whileTap={{ scale: isActive ? 1.1 : 0.45 }}
        transition={{
          duration: 0.9,
          ease: [0.22, 1, 0.36, 1],
        }}
        style={{
          willChange: 'transform, opacity',
          transform: 'translateZ(0)',
          backfaceVisibility: 'hidden',
        }}
      >
        <div
          className="relative flex items-center justify-center w-[50vmin] h-[50vmin] max-w-[300px] max-h-[300px] touch-none"
          style={{ WebkitTapHighlightColor: 'transparent' }}
        >
          {/* Base Housing */}
          <motion.div
            className="absolute inset-0 rounded-full bg-[#111] shadow-[0_0_50px_rgba(0,0,0,0.8)] border border-[#333]"
            initial={false}
            animate={{ opacity: isActive ? 1 : 0.55 }}
            transition={{ duration: 0.6, ease: 'easeInOut' }}
          />

          {/* Outer Ring Holder */}
          <motion.div
            className="absolute top-[10px] bottom-[10px] left-[10px] right-[10px] rounded-full border-4 border-[#444] bg-[#050505] shadow-inner"
            initial={false}
            animate={{ opacity: isActive ? 1 : 0.5 }}
            transition={{ duration: 0.6, ease: 'easeInOut' }}
          />

          {/* Coils */}
          {coils.map((i) => (
            <div
              key={i}
              className="absolute w-full h-full left-0 top-0"
              style={{ transform: `rotate(${i * (360 / coilCount)}deg)` }}
            >
              <div className="absolute top-[20px] left-1/2 -translate-x-1/2 w-[40px] h-[50px] bg-[#1a1a1a] shadow-[0_0_2px_black,inset_0_0_5px_black]">
                <div
                  className="w-full h-full opacity-30"
                  style={{ background: 'repeating-linear-gradient(90deg, transparent 0, transparent 2px, #b87333 2px, #b87333 4px)' }}
                />
                <motion.div
                  className="absolute inset-x-1 top-1 bottom-1 rounded-[1px]"
                  initial={{ backgroundColor: '#111', opacity: 0.05 }}
                  animate={{
                    backgroundColor: lightColor,
                    opacity: isActive ? 1 : 0.05,
                    boxShadow: isActive ? glowShadow : 'none',
                  }}
                  transition={{
                    opacity: { duration: isActive ? 0.6 : 0.8, ease: 'easeInOut' },
                    boxShadow: { duration: 0.1 },
                    backgroundColor: { duration: 0.5 },
                  }}
                />
              </div>
            </div>
          ))}

          {/* Inner Ring Structure */}
          <motion.div
            className="absolute w-[140px] h-[140px] rounded-full border-[8px] border-[#222] bg-[#0a0a0a] shadow-[0_0_20px_black] z-10 flex items-center justify-center"
            initial={false}
            animate={{ opacity: isActive ? 1 : 0.55 }}
            transition={{ duration: 0.6, ease: 'easeInOut' }}
          >
            <div
              className="absolute inset-2 rounded-full border border-gray-800 opacity-50"
              style={{ backgroundImage: 'radial-gradient(black 40%, transparent 40%)', backgroundSize: '4px 4px' }}
            />
          </motion.div>

          {/* Core */}
          <motion.div
            className="absolute w-[100px] h-[100px] rounded-full bg-white z-20"
            initial={{ opacity: 0.05, scale: 1, boxShadow: 'inset 0 0 20px black' }}
            animate={{
              scale: isActive && isSpeaking ? 1.04 : (animatedScale ? [1, 1.02, 1] : 1),
              opacity: isActive ? 1 : 0.05,
              boxShadow: isActive
                ? `0 0 ${30 + volume * 40}px ${baseColor}, inset 0 0 30px ${lightColor}`
                : 'inset 0 0 20px black',
            }}
            transition={{
              scale: animatedScale ? { repeat: Infinity, duration: 1.5 } : { duration: 0.05 },
              boxShadow: { duration: 0.2 },
              opacity: { duration: isActive ? 0.5 : 0.8, ease: 'easeInOut' },
            }}
          >
            <div
              className="absolute inset-0 rounded-full border-[4px] opacity-80 blur-[1px] transition-colors duration-500"
              style={{ borderColor: lightColor }}
            />
          </motion.div>

          {/* Active Glow Halo */}
          <motion.div
            className="absolute w-full h-full rounded-full blur-[60px] pointer-events-none z-0"
            animate={{
              opacity: isActive ? 0.4 : 0,
              backgroundColor: baseColor,
            }}
            transition={{ duration: 0.5 }}
          />

          {/* Hover/Tap feedback ring */}
          <motion.div
            className="absolute inset-[-20px] rounded-full border z-30 pointer-events-none transition-colors duration-500"
            style={{ borderColor: `${baseColor}4d` }}
            animate={{ rotate: isActive ? 360 : 0, opacity: isActive ? 0.5 : 0 }}
            transition={{
              rotate: { duration: animatedScale ? 2 : 10, repeat: Infinity, ease: 'linear' },
              opacity: { duration: isActive ? 0.5 : 1.0 },
            }}
          />
        </div>
      </motion.div>
    </div>
  );
});

ArcReactor.displayName = 'ArcReactor';

export default ArcReactor;
