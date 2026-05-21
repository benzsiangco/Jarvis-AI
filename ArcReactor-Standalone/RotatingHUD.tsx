import React from 'react';
import { motion } from 'framer-motion';

const RingWrapper: React.FC<{ isActive: boolean, size: number, children: React.ReactNode }> = ({ isActive, size, children }) => {
    // Stagger logic: 
    // Entry: Inner (small) -> Outer (large)
    const enterDelay = Math.max(0, (size - 100) * 0.0006);

    // Exit: Large (Outer) -> Small (Inner)
    // To strictly reverse the entry sequence:
    // Large (950) has highest entry delay ~0.5s. Small (100) has 0.
    // For exit: Large should exit first (0 delay), Small should exit last (~0.5s delay).
    const exitDelay = Math.max(0, (950 - size) * 0.0006);

    const spinDirection = (size / 10) % 2 === 0 ? 1 : -1;
    const rotationAmount = 120;

    return (
        <motion.div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{ willChange: "transform, opacity" }}
            initial={{ opacity: 0, scale: 0.5, rotate: spinDirection * rotationAmount }}
            animate={{
                opacity: isActive ? 1 : 0,
                scale: isActive ? 1 : 0.5,
                rotate: isActive ? 0 : spinDirection * rotationAmount
            }}
            transition={{
                duration: 0.8,
                delay: isActive ? enterDelay : exitDelay,
                ease: isActive ? [0.2, 0, 0, 1] : [0.36, 0, 0.66, -0.56]
            }}
        >
            {children}
        </motion.div>
    );
};

const RotatingHUDComponent: React.FC<{ isActive: boolean }> = ({ isActive }) => {
    return (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">

            {/* 1. Outermost faint ring - Slow Clockwise */}
            <RingWrapper isActive={isActive} size={800}>
                <div
                    className="absolute w-[800px] h-[800px] rounded-full border-2 border-cyan-900/20 border-dashed animate-[spin_120s_linear_infinite]"
                    style={{ willChange: "transform" }}
                />
            </RingWrapper>

            {/* 2. Primary Outer Ring - Medium Counter-Clockwise */}
            <RingWrapper isActive={isActive} size={600}>
                <div
                    className="absolute w-[600px] h-[600px] rounded-full border border-cyan-800/30 animate-[spin_60s_linear_infinite]"
                    style={{ borderTopColor: 'transparent', borderBottomColor: 'transparent', borderWidth: '6px', willChange: "transform", animationDirection: 'reverse' }}
                />
            </RingWrapper>

            {/* 3. Segmented Data Ring - Fast Clockwise */}
            <RingWrapper isActive={isActive} size={500}>
                <div
                    className="absolute w-[500px] h-[500px] rounded-full border-[3px] border-cyan-500/10 border-dotted animate-[spin_40s_linear_infinite]"
                    style={{ willChange: "transform" }}
                />
            </RingWrapper>

            {/* 4. Tech Ring with Gaps - Clockwise */}
            <RingWrapper isActive={isActive} size={450}>
                <div
                    className="absolute w-[450px] h-[450px] rounded-full border border-cyan-600/20 animate-[spin_30s_linear_infinite]"
                    style={{
                        borderLeftColor: 'transparent',
                        borderRightColor: 'transparent',
                        borderWidth: '8px',
                        willChange: "transform"
                    }}
                />
            </RingWrapper>

            {/* 5. Inner Fast Ring - Counter-Clockwise */}
            <RingWrapper isActive={isActive} size={350}>
                <div
                    className="absolute w-[350px] h-[350px] rounded-full border-2 border-cyan-400/30 border-dashed animate-[spin_20s_linear_infinite]"
                    style={{ willChange: "transform", animationDirection: 'reverse' }}
                />
            </RingWrapper>

            {/* 6. Geometric Overlay (Triangle/Hexagon hint) - Slow Clockwise */}
            <RingWrapper isActive={isActive} size={300}>
                <div
                    className="absolute w-[300px] h-[300px] border border-cyan-500/10 opacity-30 animate-[spin_50s_linear_infinite]"
                    style={{ borderRadius: '40%', willChange: "transform" }}
                />
            </RingWrapper>

            {/* 7. Center Focus Ticks - Static */}
            <RingWrapper isActive={isActive} size={280}>
                <div className="absolute w-[280px] h-[280px] rounded-full border border-cyan-500/5">
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1px] h-4 bg-cyan-600/50" />
                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[1px] h-4 bg-cyan-600/50" />
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 h-[1px] w-4 bg-cyan-600/50" />
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 h-[1px] w-4 bg-cyan-600/50" />
                </div>
            </RingWrapper>

            {/* 8. Scanning Radar Effect */}
            <RingWrapper isActive={isActive} size={900}>
                <div
                    className="absolute w-[900px] h-[900px] bg-gradient-to-r from-transparent via-cyan-500/5 to-transparent rounded-full opacity-20 animate-[spin_8s_linear_infinite]"
                    style={{ willChange: "transform" }}
                />
            </RingWrapper>

            {/* 9. Spinning Arcs Layer 1 - Fast Clockwise */}
            <RingWrapper isActive={isActive} size={380}>
                <div
                    className="absolute w-[380px] h-[380px] rounded-full border-t-2 border-r-2 border-cyan-400/40 animate-[spin_5s_linear_infinite]"
                    style={{ borderBottomColor: 'transparent', borderLeftColor: 'transparent', willChange: "transform" }}
                />
            </RingWrapper>

            {/* 10. Spinning Arcs Layer 2 - Medium Counter-Clockwise */}
            <RingWrapper isActive={isActive} size={420}>
                <div
                    className="absolute w-[420px] h-[420px] rounded-full border-b-4 border-cyan-600/30 animate-[spin_15s_linear_infinite]"
                    style={{ borderTopColor: 'transparent', borderLeftColor: 'transparent', borderRightColor: 'transparent', willChange: "transform", animationDirection: 'reverse' }}
                />
            </RingWrapper>

            {/* 11. Multi-segment Arc Ring - Rotates as a group */}
            <RingWrapper isActive={isActive} size={340}>
                <div className="absolute w-[340px] h-[340px] flex items-center justify-center animate-[spin_8s_linear_infinite]" style={{ willChange: "transform" }}>
                    {[0, 120, 240].map((deg, i) => (
                        <div
                            key={i}
                            className="absolute w-[340px] h-[340px] rounded-full border-t-2 border-cyan-300/60"
                            style={{
                                borderRightColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: 'transparent',
                                transform: `rotate(${deg}deg)`
                            }}
                        />
                    ))}
                </div>
            </RingWrapper>

            {/* 12. Large Slow Outer Arcs */}
            <RingWrapper isActive={isActive} size={700}>
                <div
                    className="absolute w-[700px] h-[700px] rounded-full border-2 border-cyan-800/20 animate-[spin_45s_linear_infinite]"
                    style={{
                        borderTopColor: 'rgba(6,182,212,0.3)',
                        borderBottomColor: 'rgba(6,182,212,0.3)',
                        borderLeftColor: 'transparent',
                        borderRightColor: 'transparent',
                        willChange: "transform"
                    }}
                />
            </RingWrapper>

            {/* 13. Tight Inner Data Cage - Counter-Clockwise */}
            <RingWrapper isActive={isActive} size={260}>
                <div
                    className="absolute w-[260px] h-[260px] animate-[spin_25s_linear_infinite]"
                    style={{ willChange: "transform", animationDirection: 'reverse' }}
                >
                    <div className="absolute inset-0 border-l-2 border-r-2 border-cyan-500/20 rounded-full scale-[0.9]" />
                    <div className="absolute inset-0 border-t-2 border-b-2 border-cyan-500/10 rounded-full scale-[1.1] rotate-45" />
                </div>
            </RingWrapper>

            {/* 14. Dotted Spinner Ring - Fast Clockwise */}
            <RingWrapper isActive={isActive} size={320}>
                <div
                    className="absolute w-[320px] h-[320px] rounded-full border-4 border-cyan-500/30 border-dotted animate-[spin_20s_linear_infinite]"
                    style={{ willChange: "transform" }}
                />
            </RingWrapper>

            {/* 15. Large Outer Dashed - Slow Counter-Clockwise */}
            <RingWrapper isActive={isActive} size={650}>
                <div
                    className="absolute w-[650px] h-[650px] rounded-full border border-cyan-400/10 border-dashed animate-[spin_80s_linear_infinite]"
                    style={{ opacity: 0.15, willChange: "transform", animationDirection: 'reverse' }}
                />
            </RingWrapper>

            {/* 16. Inner Fast Dotted - Clockwise */}
            <RingWrapper isActive={isActive} size={240}>
                <div
                    className="absolute w-[240px] h-[240px] rounded-full border-2 border-cyan-300/40 border-dotted animate-[spin_15s_linear_infinite]"
                    style={{ willChange: "transform" }}
                />
            </RingWrapper>

            {/* 17. Thick Dashed Heavy Ring - Slow */}
            <RingWrapper isActive={isActive} size={580}>
                <div
                    className="absolute w-[580px] h-[580px] rounded-full border-[12px] border-cyan-900/10 border-dashed animate-[spin_100s_linear_infinite]"
                    style={{ willChange: "transform" }}
                />
            </RingWrapper>

            {/* 18. Long and Thin - Extremely Large - Counter-Clockwise */}
            <RingWrapper isActive={isActive} size={950}>
                <div
                    className="absolute w-[950px] h-[950px] rounded-full border-[1px] border-cyan-500/10 animate-[spin_150s_linear_infinite]"
                    style={{ borderStyle: 'dotted', willChange: "transform", animationDirection: 'reverse' }}
                />
            </RingWrapper>
        </div>
    );
};

export const RotatingHUD = React.memo(RotatingHUDComponent);
