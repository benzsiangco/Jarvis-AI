# Arc Reactor Visual Guide

## Component Anatomy

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│              ROTATING HUD RINGS (18 total)             │
│         (Optional - toggle with showHUD prop)          │
│                                                         │
│    ┌──────────────────────────────────────────────┐   │
│    │                                              │   │
│    │    Ring 18: 950px (Slow Counter-CW)        │   │
│    │    Ring 17: 900px (Scanning Radar)         │   │
│    │    Ring 16: 800px (Slow Clockwise)         │   │
│    │    Ring 15: 700px (Large Slow Arcs)        │   │
│    │    Ring 14: 650px (Dashed Counter-CW)      │   │
│    │    Ring 13: 600px (Primary Outer)          │   │
│    │    Ring 12: 580px (Thick Dashed)           │   │
│    │    Ring 11: 500px (Segmented Data)         │   │
│    │    Ring 10: 450px (Tech Ring)              │   │
│    │    Ring 9: 420px (Spinning Arcs 2)         │   │
│    │    Ring 8: 380px (Spinning Arcs 1)         │   │
│    │    Ring 7: 350px (Inner Fast)              │   │
│    │    Ring 6: 340px (Multi-segment Arc)       │   │
│    │    Ring 5: 320px (Dotted Spinner)          │   │
│    │    Ring 4: 300px (Geometric Overlay)       │   │
│    │    Ring 3: 280px (Center Focus Ticks)      │   │
│    │    Ring 2: 260px (Tight Inner Data Cage)   │   │
│    │    Ring 1: 240px (Inner Fast Dotted)       │   │
│    │                                              │   │
│    │         ┌──────────────────────────┐        │   │
│    │         │                          │        │   │
│    │         │   ARC REACTOR CORE       │        │   │
│    │         │                          │        │   │
│    │         │  ┌────────────────────┐  │        │   │
│    │         │  │  Base Housing      │  │        │   │
│    │         │  │  (Dark Metal Ring) │  │        │   │
│    │         │  │                    │  │        │   │
│    │         │  │  ┌──────────────┐  │  │        │   │
│    │         │  │  │ Outer Ring   │  │  │        │   │
│    │         │  │  │ (Silver/Steel)  │  │        │   │
│    │         │  │  │                │  │        │   │
│    │         │  │  │ ┌────────────┐ │  │        │   │
│    │         │  │  │ │ 10 Coils   │ │  │        │   │
│    │         │  │  │ │ (Glowing)  │ │  │        │   │
│    │         │  │  │ │            │ │  │        │   │
│    │         │  │  │ │ ┌────────┐ │ │  │        │   │
│    │         │  │  │ │ │ Core   │ │ │  │        │   │
│    │         │  │  │ │ │(White) │ │ │  │        │   │
│    │         │  │  │ │ │ Glow   │ │ │  │        │   │
│    │         │  │  │ │ └────────┘ │ │  │        │   │
│    │         │  │  │ └────────────┘ │  │        │   │
│    │         │  │  └──────────────┘  │  │        │   │
│    │         │  └────────────────────┘  │        │   │
│    │         │                          │        │   │
│    │         └──────────────────────────┘        │   │
│    │                                              │   │
│    └──────────────────────────────────────────────┘   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## States & Colors

### Default State (Cyan)
```
Core Glow:     #00f3ff (Cyan)
Light Color:   #aeefff (Light Cyan)
Glow Shadow:   0 0 30px #00f3ff, inset 0 0 30px #aeefff
Opacity:       0.4
```

### Listening State (Purple)
```
Core Glow:     #a855f7 (Purple)
Light Color:   #e9d5ff (Light Purple)
Glow Shadow:   0 0 30px #a855f7, inset 0 0 30px #e9d5ff
Opacity:       0.4
```

### Loading State (Amber)
```
Core Glow:     #ffaa00 (Amber)
Light Color:   #ffeebb (Light Amber)
Glow Shadow:   0 0 15px #ffaa00, inset 0 0 10px #ffddaa
Opacity:       0.4
```

## Animation Timings

### HUD Rings Rotation Speeds
```
Ring 1:  240px - 15s (Clockwise)
Ring 2:  260px - 25s (Counter-CW)
Ring 3:  280px - Static
Ring 4:  300px - 50s (Clockwise)
Ring 5:  320px - 20s (Clockwise)
Ring 6:  340px - 8s (Clockwise)
Ring 7:  350px - 20s (Counter-CW)
Ring 8:  380px - 5s (Clockwise) ⚡ FASTEST
Ring 9:  420px - 15s (Counter-CW)
Ring 10: 450px - 30s (Clockwise)
Ring 11: 500px - 40s (Clockwise)
Ring 12: 580px - 100s (Clockwise)
Ring 13: 600px - 60s (Counter-CW)
Ring 14: 650px - 80s (Counter-CW)
Ring 15: 700px - 45s (Clockwise)
Ring 16: 800px - 120s (Clockwise) ⚡ SLOWEST
Ring 17: 900px - 8s (Clockwise)
Ring 18: 950px - 150s (Counter-CW)
```

### Core Animations
```
Speaking:  Scale 1.04 (pulse effect)
Loading:   Scale [1, 1.02, 1] (infinite loop, 1.5s)
Inactive:  Scale 1.0 (static)

Opacity:   0.2 (inactive) → 1.0 (active)
Transition: 0.5s (active), 2.5s (inactive)
```

### Click Effect
```
Active:scale-95 (shrinks to 95%)
Duration: 200ms
Easing: Default (ease-in-out)
```

### HUD Entry/Exit
```
Entry Delay:  (size - 100) * 0.0006 seconds
Exit Delay:   (950 - size) * 0.0006 seconds
Duration:     0.8s
Easing In:    [0.2, 0, 0, 1] (custom cubic)
Easing Out:   [0.36, 0, 0.66, -0.56] (custom cubic)
```

## Responsive Scaling

```
Mobile (default):    scale-[1.0]  (50vmin, max 300px)
Tablet (md):         scale-[1.2]  (50vmin, max 300px)
Desktop (xl):        scale-[1.5]  (50vmin, max 300px)
```

## Volume Reactivity

```
Volume Range:  0 to 1
Glow Opacity:  0.5 + (volume * 0.8)
Glow Shadow:   0 0 (30 + volume * 40)px
```

Example:
```
Volume 0.0:  Glow 0.5, Shadow 30px
Volume 0.5:  Glow 0.9, Shadow 50px
Volume 1.0:  Glow 1.3, Shadow 70px
```

## Component Hierarchy

```
ArcReactor (Main Container)
├── RotatingHUD (Optional)
│   ├── RingWrapper (18x)
│   │   └── Ring (various sizes/speeds)
│   └── ...
└── Reactor Container (with click effect)
    ├── Base Housing
    ├── Outer Ring Holder
    ├── Coils (10x)
    │   └── Glowing Light
    ├── Inner Ring Structure
    ├── Core (with glow)
    ├── Glow Halo
    └── Feedback Ring
```

## CSS Classes Used

### Tailwind Classes
```
Sizing:        w-[Xpx], h-[Xpx], max-w-[Xpx], max-h-[Xpx]
Positioning:   absolute, inset-0, top-[Xpx], left-1/2
Transforms:    translate-x, translate-y, rotate, scale
Borders:       border, border-[Xpx], rounded-full, border-dashed
Colors:        bg-[#XXX], border-[#XXX], text-[#XXX]
Opacity:       opacity-X, bg-opacity-X
Shadows:       shadow-[...], shadow-inner
Animations:    animate-[spin_Xs_linear_infinite]
Transitions:   transition-transform, duration-200
Filters:       blur-[Xpx]
Pointers:      pointer-events-none, cursor-pointer
```

### Custom Animations
```
spin_5s_linear_infinite
spin_8s_linear_infinite
spin_15s_linear_infinite
spin_20s_linear_infinite
spin_25s_linear_infinite
spin_30s_linear_infinite
spin_40s_linear_infinite
spin_45s_linear_infinite
spin_50s_linear_infinite
spin_60s_linear_infinite
spin_80s_linear_infinite
spin_100s_linear_infinite
spin_120s_linear_infinite
spin_150s_linear_infinite
```

## Performance Optimizations

### GPU Acceleration
```css
will-change: transform, opacity;
```

### Memoization
```tsx
React.memo(ArcReactorComponent)
React.memo(RotatingHUDComponent)
```

### Conditional Rendering
- HUD rings only animate when `isActive={true}`
- Core animations only run when `isActive={true}`
- Volume updates throttled to 60fps

## Browser Rendering

### Hardware Acceleration
- Uses `transform` and `opacity` for animations
- Avoids expensive properties like `width`, `height`
- GPU-optimized with `will-change`

### Frame Rate
- Target: 60fps
- Smooth on modern devices
- Optimized for mobile

## Customization Points

### Easy to Change
- Colors (baseColor, lightColor)
- Sizes (w-[Xpx], h-[Xpx])
- Speeds (spin_Xs_linear_infinite)
- Opacity (opacity-X)
- Click effect (active:scale-X)

### Moderate Difficulty
- Ring count (add/remove RingWrapper)
- Animation timings (transition duration)
- Easing functions (ease-in-out, etc.)

### Advanced
- Animation sequences (stagger, delay)
- Custom SVG shapes
- Particle effects
- Audio visualization integration

## Integration Checklist

- [ ] Copy ArcReactor.tsx
- [ ] Copy RotatingHUD.tsx
- [ ] Install framer-motion
- [ ] Configure Tailwind CSS
- [ ] Import components
- [ ] Add to JSX
- [ ] Connect onClick handler
- [ ] Test all states (active, speaking, listening, loading)
- [ ] Test volume reactivity
- [ ] Test responsive scaling
- [ ] Test click shrink effect
- [ ] Customize colors if needed
- [ ] Deploy!

---

**Visual design inspired by Marvel's Iron Man Arc Reactor** 🔴⚡
