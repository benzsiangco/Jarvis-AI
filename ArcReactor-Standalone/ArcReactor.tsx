import React from 'react';
import { motion } from 'framer-motion';
import { RotatingHUD } from './RotatingHUD';

interface ArcReactorProps {
  isActive: boolean;
  isSpeaking: boolean;
  isListening?: boolean;
  isLoading?: boolean;
  volume?: number;
  onClick?: () => void;
  showHUD?: boolean; // Toggle outer spinners
}

const ArcReactorComponent: React.FC<ArcReactorProps> = ({ 
  isActive, 
  isSpeaking, 
  isListening, 
  isLoading, 
  volume = 0, 
  onClick,
  showHUD = true
}) => {
  // Classic Mark I style: 10 coil segments
  const coilCount = 10;
  const coils = Array.from({ length: coilCount }).map((_, i) => i);

  // Dynamic Values
  const glowOpacity = isActive ? (0.5 + volume * 0.8) : 0.1;
  const coreBrightness = isActive ? (1 + volume) : 0.3;

  // Color State
  const baseColor = isLoading ? '#ffaa00' : (isListening ? '#a855f7' : '#00f3ff'); // Purple if listening
  const lightColor = isLoading ? '#ffeebb' : (isListening ? '#e9d5ff' : '#aeefff');
  const glowShadow = isLoading
    ? `0 0 ${15}px #ffaa00, inset 0 0 10px #ffddaa`
    : (isListening
      ? `0 0 ${15 + volume * 10}px #a855f7, inset 0 0 10px #e9d5ff`
      : `0 0 ${15 + volume * 10}px #00f3ff, inset 0 0 10px white`);

  return (
    <div className="relative flex items-center justify-center">
      {/* Rotating HUD Rings (Optional) */}
      {showHUD && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-50 z-0">
          <RotatingHUD isActive={isActive} />
        </div>
      )}

      {/* Reactor Container with Click Shrink Effect */}
      <div
        className="relative z-50 scale-[1.0] md:scale-[1.2] xl:scale-[1.5] active:scale-95 transition-transform duration-200 cursor-pointer"
        onClick={onClick}
      >
        <div
          className="relative flex items-center justify-center w-[50vmin] h-[50vmin] max-w-[300px] max-h-[300px] touch-none tap-highlight-transparent"
        >
      {/* 1. Base Housing (Dark Metal Ring) */}
      <div className="absolute inset-0 rounded-full bg-[#111] shadow-[0_0_50px_rgba(0,0,0,0.8)] border border-[#333]" />

      {/* 2. Outer Ring Holder (Silver/Steel) */}
      <div className="absolute top-[10px] bottom-[10px] left-[10px] right-[10px] rounded-full border-4 border-[#444] bg-[#050505] shadow-inner" />

      {/* 3. The Coils (The distinctive segmented look) */}
      {coils.map((i) => (
        <div
          key={i}
          className="absolute w-full h-full left-0 top-0"
          style={{ transform: `rotate(${i * (360 / coilCount)}deg)` }}
        >
          {/* The Coil Block itself */}
          <div className="absolute top-[20px] left-1/2 -translate-x-1/2 w-[40px] h-[50px] bg-[#1a1a1a] shadow-[0_0_2px_black,inset_0_0_5px_black]">
            {/* Copper wiring detail (simulated) */}
            <div className="w-full h-full opacity-30" style={{ background: 'repeating-linear-gradient(90deg, transparent 0, transparent 2px, #b87333 2px, #b87333 4px)' }} />

            {/* The Glowing Light on the coil */}
            <motion.div
              className="absolute inset-x-1 top-1 bottom-1 rounded-[1px]"
              initial={{ backgroundColor: '#aeefff' }}
              animate={{
                backgroundColor: lightColor,
                opacity: isActive ? 1 : 0.1,
                boxShadow: isActive ? glowShadow : 'none'
              }}
              transition={{
                opacity: { duration: isActive ? 0.6 : 1.0, ease: "easeInOut" },
                boxShadow: { duration: 0.1 },
                backgroundColor: { duration: 0.5 }
              }}
            />
          </div>
        </div>
      ))}

      {/* 4. Inner Ring Structure (Housing for the core) */}
      <div className="absolute w-[140px] h-[140px] rounded-full border-[8px] border-[#222] bg-[#0a0a0a] shadow-[0_0_20px_black] z-10 flex items-center justify-center">
        {/* Inner detail mesh */}
        <div
          className="absolute inset-2 rounded-full border border-gray-800 opacity-50"
          style={{ backgroundImage: 'radial-gradient(black 40%, transparent 40%)', backgroundSize: '4px 4px' }}
        />
      </div>

      {/* 5. The Core (The Arc Heart) */}
      <motion.div
        className="absolute w-[100px] h-[100px] rounded-full bg-white z-20"
        animate={{
          scale: isActive && isSpeaking ? 1.04 : (isLoading ? [1, 1.02, 1] : 1),
          opacity: isActive ? 1 : 0.2,
          boxShadow: isActive
            ? (isLoading
              ? `0 0 40px #ffaa00, inset 0 0 30px #ffeeaa`
              : (isListening
                ? `0 0 ${30 + volume * 40}px #a855f7, inset 0 0 30px #e9d5ff`
                : `0 0 ${30 + volume * 40}px #00f3ff, inset 0 0 30px #aeefff`))
            : 'inset 0 0 20px black'
        }}
        transition={{
          scale: isLoading ? { repeat: Infinity, duration: 1.5 } : { duration: 0.05 },
          boxShadow: { duration: 0.2 },
          opacity: { duration: isActive ? 0.5 : 2.5, delay: isActive ? 0 : 1.0, ease: "easeInOut" }
        }}
      >
        {/* Triangular shape or detail inside core (Mark VI ref or just core detail) */}
        <div className={`absolute inset-0 rounded-full border-[4px] opacity-80 blur-[1px] transition-colors duration-500 ${isLoading ? 'border-amber-200' : 'border-[#aeefff]'}`} />
      </motion.div>

      {/* 6. Active Glow Halo (The intense light spill when ON) */}
      <motion.div
        className="absolute w-full h-full rounded-full blur-[60px] pointer-events-none z-0"
        animate={{
          opacity: isActive ? 0.4 : 0,
          backgroundColor: baseColor
        }}
        transition={{ duration: 0.5 }}
      />

      {/* 7. Hover/Tap feedback ring */}
      <motion.div
        className={`absolute inset-[-20px] rounded-full border z-30 pointer-events-none transition-colors duration-500 ${isLoading ? 'border-amber-500/30' : 'border-cyan-500/30'}`}
        animate={{ rotate: isActive ? 360 : 0, opacity: isActive ? 0.5 : 0 }}
        transition={{
          rotate: { duration: isLoading ? 2 : 10, repeat: Infinity, ease: 'linear' }, // Spin faster when loading
          opacity: { duration: isActive ? 0.5 : 1.0 }
        }}
      />

    </div>
    </div>
  );
};

export default React.memo(ArcReactorComponent);
