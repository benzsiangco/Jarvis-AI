/**
 * RotatingHUD — Outer spinning rings for the ArcReactor.
 *
 * Each ring has its own natural direction (alternating CW/CCW).
 * State changes the speed multiplier and can flip individual rings.
 *
 * States:
 *   idle      → slow, calm, natural alternating directions
 *   listening → medium, slightly faster, same alternating
 *   thinking  → fast alternating — rings oscillate back/forth like a camera
 *               focusing: each ring reverses direction every few seconds
 *   executing → very fast, all rings spin same direction (full power)
 *   speaking  → medium-fast, smooth, natural alternating
 *   error     → slow, all rings reverse their natural direction
 */
import React, { useEffect, useRef, useState } from 'react';
import { motion, useAnimation } from 'framer-motion';

// Per-ring config: [size, baseDurationSec, naturallyReverse, opacity, borderStyle, borderWidth]
// naturallyReverse = true means this ring goes CCW by default
const RINGS = [
  [800,  120, false, 0.18, 'dashed',  2],
  [600,   60, true,  0.28, 'solid',   6],
  [500,   40, false, 0.10, 'dotted',  3],
  [450,   30, true,  0.20, 'solid',   8],
  [380,    5, false, 0.40, 'solid',   2],
  [420,   15, true,  0.28, 'solid',   4],
  [350,   20, false, 0.30, 'dashed',  2],
  [340,    8, true,  0.55, 'solid',   2],
  [320,   20, false, 0.28, 'dotted',  4],
  [300,   50, true,  0.10, 'solid',   1],
  [260,   25, false, 0.20, 'solid',   2],
  [240,   15, true,  0.38, 'dotted',  2],
  [700,   45, false, 0.18, 'solid',   2],
  [650,   80, true,  0.10, 'dashed',  1],
  [580,  100, false, 0.08, 'dashed', 12],
  [950,  150, true,  0.08, 'dotted',  1],
];

// State → speed multiplier (lower = faster)
const SPEED = {
  idle:      1.0,
  listening: 0.55,
  thinking:  0.30,   // oscillation handled separately
  executing: 0.08,   // blazing fast
  speaking:  0.45,
  error:     1.8,
};

function RingWrapper({ isActive, size, children }) {
  const enterDelay = Math.max(0, (size - 100) * 0.0008);
  const exitDelay  = Math.max(0, (950 - size) * 0.0008);
  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center pointer-events-none"
      style={{ willChange: 'transform, opacity', transform: 'translateZ(0)', backfaceVisibility: 'hidden' }}
      initial={false}
      animate={{ opacity: isActive ? 1 : 0, scale: isActive ? 1 : 0.85 }}
      transition={{ duration: 0.7, delay: isActive ? enterDelay : exitDelay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

/**
 * ThinkingRing — oscillates back and forth like a camera focusing.
 * Rotates CW for `halfPeriod` seconds, then CCW, then CW, etc.
 * Each ring gets a different halfPeriod so they desync naturally.
 */
function ThinkingRing({ size, opacity, borderStyle, borderWidth, halfPeriod }) {
  const controls = useAnimation();
  const dirRef = useRef(1);
  const angleRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const step = async () => {
      while (!cancelled) {
        const sweep = 180 + Math.random() * 120; // 180–300° per half-cycle
        const target = angleRef.current + sweep * dirRef.current;
        await controls.start({
          rotate: target,
          transition: { duration: halfPeriod, ease: 'easeInOut' },
        });
        if (cancelled) break;
        angleRef.current = target;
        dirRef.current *= -1;
      }
    };
    step();
    return () => { cancelled = true; };
  }, [controls, halfPeriod]);

  return (
    <motion.div
      animate={controls}
      className="absolute rounded-full"
      style={{
        width: size, height: size,
        borderWidth, borderStyle,
        borderColor: `rgba(167,139,250,${opacity})`,
        willChange: 'transform',
      }}
    />
  );
}

/**
 * SpinRing — continuous rotation at a fixed speed.
 * direction: 1 = CW, -1 = CCW
 */
function SpinRing({ size, duration, direction, opacity, borderStyle, borderWidth, color }) {
  return (
    <motion.div
      className="absolute rounded-full"
      style={{
        width: size, height: size,
        borderWidth, borderStyle,
        borderColor: `rgba(${color},${opacity})`,
        willChange: 'transform',
      }}
      animate={{ rotate: direction > 0 ? 360 : -360 }}
      transition={{ duration, repeat: Infinity, ease: 'linear' }}
    />
  );
}

function RotatingHUDComponent({ isActive, state = 'idle' }) {
  const speedMult = SPEED[state] || 1.0;
  const isThinking = state === 'thinking';
  const isExecuting = state === 'executing';
  const isError = state === 'error';

  // Color per state
  const color = isError     ? '239,68,68'
              : isExecuting ? '34,197,94'
              : isThinking  ? '167,139,250'
              : state === 'listening' ? '168,85,247'
              : state === 'speaking'  ? '6,182,212'
              : '6,182,212';

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
      {RINGS.map(([size, baseDur, naturallyReverse, opacity, style, bw], i) => {
        // In error state, flip all natural directions
        const flipped = isError ? !naturallyReverse : naturallyReverse;
        const direction = flipped ? -1 : 1;
        const duration = baseDur * speedMult;

        // Thinking state: alternate rings oscillate, others spin slow
        const halfPeriod = 0.8 + (i % 4) * 0.35; // 0.8s – 1.85s per half-cycle

        return (
          <RingWrapper key={i} isActive={isActive} size={size}>
            {isThinking ? (
              // Odd rings oscillate, even rings spin slowly
              i % 2 === 0
                ? <ThinkingRing
                    size={size} opacity={opacity} borderStyle={style}
                    borderWidth={bw} halfPeriod={halfPeriod}
                  />
                : <SpinRing
                    size={size} duration={baseDur * 0.5} direction={direction}
                    opacity={opacity * 0.6} borderStyle={style} borderWidth={bw} color={color}
                  />
            ) : (
              <SpinRing
                size={size} duration={duration} direction={direction}
                opacity={opacity} borderStyle={style} borderWidth={bw} color={color}
              />
            )}
          </RingWrapper>
        );
      })}
    </div>
  );
}

export const RotatingHUD = React.memo(RotatingHUDComponent);
export default RotatingHUD;
