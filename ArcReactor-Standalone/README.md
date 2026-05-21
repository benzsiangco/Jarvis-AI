# Arc Reactor UI Component

A reusable, standalone React component that renders the iconic Iron Man Arc Reactor UI with full effects. Perfect for dashboards, AI assistants, or any sci-fi themed interface.

## Features

- **Complete Visual System**: Arc Reactor core + 18 rotating HUD rings
- **Click Shrink Effect**: Reactor shrinks when clicked (active:scale-95)
- **Responsive Design**: Scales beautifully from mobile to desktop
- **State-Aware Animations**: Visual feedback for active, speaking, listening, and loading states
- **Volume Reactive**: Glow intensity responds to volume levels
- **Color Modes**: Cyan (default), Purple (listening), Amber (loading)
- **Smooth Animations**: Built with Framer Motion for fluid transitions
- **Lightweight**: Minimal dependencies, optimized performance
- **Optional HUD**: Toggle outer spinners on/off with `showHUD` prop

## Installation

1. Copy both components to your project:
   - `ArcReactor.tsx` → your project's `components/` folder
   - `RotatingHUD.tsx` → your project's `components/` folder

2. Install dependencies (if not already installed):
   ```bash
   npm install react framer-motion
   ```
3. Ensure Tailwind CSS is configured in your project

## Usage

### Basic Example

```tsx
import ArcReactor from './components/ArcReactor';

export default function App() {
  const [isActive, setIsActive] = useState(false);

  return (
    <ArcReactor
      isActive={isActive}
      isSpeaking={false}
      onClick={() => setIsActive(!isActive)}
    />
  );
}
```

### With All Props

```tsx
<ArcReactor
  isActive={true}
  isSpeaking={true}
  isListening={false}
  isLoading={false}
  volume={0.75}
  showHUD={true}
  onClick={() => console.log('clicked')}
/>
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `isActive` | boolean | - | Whether the reactor is powered on |
| `isSpeaking` | boolean | - | Whether the reactor is speaking (adds pulse animation) |
| `isListening` | boolean | false | Whether listening mode is active (purple glow) |
| `isLoading` | boolean | false | Whether loading (amber glow, faster spin) |
| `volume` | number | 0 | Volume level (0-1) for glow intensity |
| `showHUD` | boolean | true | Show/hide the 18 outer rotating rings |
| `onClick` | function | - | Click handler for the reactor |

## Color States

- **Cyan** (Default): Active/speaking state
- **Purple**: Listening mode
- **Amber**: Loading state

## Visual Effects

### Click Shrink Animation
When you click the reactor, it shrinks to 95% scale with a smooth 200ms transition. This is built into the component via the `active:scale-95` class.

### Rotating HUD Rings
The component includes 18 rotating rings with different speeds and directions:
- Rings animate in/out with staggered timing
- Each ring has unique rotation speed (5s to 150s)
- Mix of clockwise and counter-clockwise rotations
- Opacity and scale animations on activation

### Disable HUD
If you only want the core reactor without the outer rings:

```tsx
<ArcReactor
  isActive={true}
  isSpeaking={false}
  showHUD={false}  // Hide the 18 rotating rings
/>
```

## Styling

The component uses Tailwind CSS for styling. Key CSS variables used:

```css
:root {
    --jarvis-cyan: #00f3ff;
    --jarvis-cyan-glow: rgba(0, 243, 255, 0.6);
}
```

You can customize colors by modifying the color values in the component or by overriding Tailwind classes.

## Files Included

- **ArcReactor.tsx** - Main reactor component with click shrink effect
- **RotatingHUD.tsx** - 18 rotating rings with staggered animations
- **README.md** - This documentation
- **SETUP.md** - Step-by-step integration guide
- **EXAMPLES.tsx** - 9 ready-to-use examples

## Performance

The component is wrapped with `React.memo()` to prevent unnecessary re-renders. It only updates when props change.

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari, Chrome Mobile)

## Customization

### Change Core Color

Modify the `baseColor` variable in the component:

```tsx
const baseColor = '#ff0000'; // Red instead of cyan
```

### Adjust Size

The component uses viewport-relative sizing (`50vmin`). Modify the container class:

```tsx
className="w-[50vmin] h-[50vmin] max-w-[400px] max-h-[400px]"
```

### Disable Animations

Remove the `motion.div` components and replace with static `div` elements.

## Dependencies

- **React** 16.8+
- **Framer Motion** 10+
- **Tailwind CSS** 3+

## License

Free to use and modify for your projects.

## Credits

Inspired by the Iron Man Arc Reactor from the Marvel Cinematic Universe.
