# Arc Reactor Setup Guide

## Quick Start

### Step 1: Copy the Components

Copy both files to your project's components folder:

```
your-project/
├── src/
│   ├── components/
│   │   ├── ArcReactor.tsx      ← Copy here
│   │   └── RotatingHUD.tsx     ← Copy here
│   └── App.tsx
```

### Step 2: Install Dependencies

Make sure your project has the required dependencies:

```bash
npm install react framer-motion
```

### Step 3: Configure Tailwind CSS

If you don't have Tailwind CSS set up, follow the [official guide](https://tailwindcss.com/docs/installation).

Ensure your `tailwind.config.js` includes:

```js
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

### Step 4: Use the Component

```tsx
import { useState } from 'react';
import ArcReactor from './components/ArcReactor';

export default function App() {
  const [isActive, setIsActive] = useState(false);

  return (
    <div className="flex items-center justify-center min-h-screen bg-black">
      <ArcReactor
        isActive={isActive}
        isSpeaking={isActive}
        showHUD={true}
        onClick={() => setIsActive(!isActive)}
      />
    </div>
  );
}
```

## Integration Examples

### With Audio Visualization

```tsx
import { useEffect, useState } from 'react';
import ArcReactor from './components/ArcReactor';

export default function AudioReactor() {
  const [volume, setVolume] = useState(0);
  const [isListening, setIsListening] = useState(false);

  useEffect(() => {
    // Connect to your audio input
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = audioContext.createAnalyser();
    
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      
      const updateVolume = () => {
        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length / 255;
        setVolume(average);
        requestAnimationFrame(updateVolume);
      };
      
      updateVolume();
    });
  }, []);

  return (
    <ArcReactor
      isActive={true}
      isSpeaking={volume > 0.1}
      isListening={isListening}
      volume={volume}
      showHUD={true}
      onClick={() => setIsListening(!isListening)}
    />
  );
}
```

### With Loading State

```tsx
import { useState } from 'react';
import ArcReactor from './components/ArcReactor';

export default function LoadingReactor() {
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = async () => {
    setIsLoading(true);
    try {
      // Your async operation
      await new Promise(resolve => setTimeout(resolve, 3000));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ArcReactor
      isActive={true}
      isSpeaking={false}
      isLoading={isLoading}
      showHUD={true}
      onClick={handleClick}
    />
  );
}
```

### With Listening Mode

```tsx
import { useState } from 'react';
import ArcReactor from './components/ArcReactor';

export default function VoiceAssistant() {
  const [isListening, setIsListening] = useState(false);

  return (
    <ArcReactor
      isActive={true}
      isSpeaking={false}
      isListening={isListening}
      showHUD={true}
      onClick={() => setIsListening(!isListening)}
    />
  );
}
```

### Without HUD (Core Only)

```tsx
<ArcReactor
  isActive={true}
  isSpeaking={false}
  showHUD={false}  // Hide the 18 rotating rings
  onClick={() => {}}
/>
```

## Customization

### Change Colors

Edit the color values in `ArcReactor.tsx`:

```tsx
// Line ~30
const baseColor = isLoading ? '#ffaa00' : (isListening ? '#a855f7' : '#00f3ff');
const lightColor = isLoading ? '#ffeebb' : (isListening ? '#e9d5ff' : '#aeefff');
```

### Adjust Size

Modify the container class in `ArcReactor.tsx` (line ~37):

```tsx
// Default: 50vmin (50% of viewport's smaller dimension)
className="w-[50vmin] h-[50vmin] max-w-[300px] max-h-[300px]"

// For fixed size:
className="w-[300px] h-[300px]"

// For responsive:
className="w-[40vmin] h-[40vmin] sm:w-[50vmin] sm:h-[50vmin] lg:w-[60vmin] lg:h-[60vmin]"
```

### Adjust Click Shrink Effect

Modify the scale in `ArcReactor.tsx`:

```tsx
// Default: shrinks to 95%
className="... active:scale-95 ..."

// Shrink more:
className="... active:scale-90 ..."

// Shrink less:
className="... active:scale-98 ..."
```

### Disable Animations

Replace `motion.div` with regular `div`:

```tsx
// Before:
<motion.div className="..." animate={{...}} transition={{...}}>

// After:
<div className="..." style={{...}}>
```

### Customize HUD Rings

Edit `RotatingHUD.tsx` to modify individual rings:

```tsx
// Change rotation speed (default: 120s)
animate-[spin_120s_linear_infinite]

// Change opacity (default: 0.2)
border-cyan-900/20

// Change size (default: 800px)
w-[800px] h-[800px]
```

## Troubleshooting

### Component not rendering

- Ensure Tailwind CSS is properly configured
- Check that `framer-motion` is installed
- Verify React version is 16.8+
- Make sure both `ArcReactor.tsx` and `RotatingHUD.tsx` are in the components folder

### Colors not showing

- Make sure Tailwind CSS is imported in your main CSS file
- Check that arbitrary color values are enabled in `tailwind.config.js`

### Animations not smooth

- Ensure `framer-motion` is the latest version
- Check browser hardware acceleration is enabled
- Reduce other animations on the page

### Size issues

- The component uses viewport-relative sizing (`vmin`)
- Adjust `max-w` and `max-h` for smaller screens
- Use media queries for responsive sizing

### HUD rings not showing

- Check that `showHUD={true}` is set (default is true)
- Verify `RotatingHUD.tsx` is imported correctly
- Ensure Tailwind CSS is configured for arbitrary sizes

## Browser Compatibility

| Browser | Version | Support |
|---------|---------|---------|
| Chrome | 90+ | ✅ Full |
| Firefox | 88+ | ✅ Full |
| Safari | 14+ | ✅ Full |
| Edge | 90+ | ✅ Full |
| Mobile Safari | 14+ | ✅ Full |
| Chrome Mobile | 90+ | ✅ Full |

## Performance Tips

1. **Memoization**: Components are wrapped with `React.memo()` to prevent unnecessary re-renders
2. **Conditional Rendering**: Only animate when `isActive` is true
3. **Volume Updates**: Throttle volume updates to avoid excessive re-renders
4. **GPU Acceleration**: Use `will-change` CSS for better performance on low-end devices
5. **HUD Toggle**: Disable HUD with `showHUD={false}` for better performance on mobile

## Support

For issues or questions, refer to the main README.md or check the original Jarvis project.
