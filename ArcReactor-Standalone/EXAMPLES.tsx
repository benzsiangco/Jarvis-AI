/**
 * Arc Reactor Component - Usage Examples
 * 
 * Copy and paste these examples into your project to see the component in action
 */

import { useState, useEffect } from 'react';
import ArcReactor from './ArcReactor';

// ============================================================================
// Example 1: Basic Toggle
// ============================================================================
export function BasicToggleExample() {
  const [isActive, setIsActive] = useState(false);

  return (
    <div className="flex items-center justify-center min-h-screen bg-black">
      <ArcReactor
        isActive={isActive}
        isSpeaking={false}
        onClick={() => setIsActive(!isActive)}
      />
    </div>
  );
}

// ============================================================================
// Example 2: Speaking Animation
// ============================================================================
export function SpeakingExample() {
  const [isActive, setIsActive] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const handleClick = () => {
    setIsSpeaking(!isSpeaking);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black gap-8">
      <ArcReactor
        isActive={isActive}
        isSpeaking={isSpeaking}
        onClick={handleClick}
      />
      <p className="text-cyan-400 text-lg">
        {isSpeaking ? 'Speaking...' : 'Click to speak'}
      </p>
    </div>
  );
}

// ============================================================================
// Example 3: Volume Reactive
// ============================================================================
export function VolumeReactiveExample() {
  const [isActive, setIsActive] = useState(true);
  const [volume, setVolume] = useState(0.5);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black gap-8">
      <ArcReactor
        isActive={isActive}
        isSpeaking={volume > 0.1}
        volume={volume}
        onClick={() => setIsActive(!isActive)}
      />
      
      <div className="flex flex-col gap-4 w-64">
        <label className="text-cyan-400">Volume: {Math.round(volume * 100)}%</label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={volume}
          onChange={(e) => setVolume(parseFloat(e.target.value))}
          className="w-full"
        />
      </div>
    </div>
  );
}

// ============================================================================
// Example 4: Listening Mode (Purple)
// ============================================================================
export function ListeningModeExample() {
  const [isActive, setIsActive] = useState(true);
  const [isListening, setIsListening] = useState(false);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black gap-8">
      <ArcReactor
        isActive={isActive}
        isSpeaking={false}
        isListening={isListening}
        onClick={() => setIsListening(!isListening)}
      />
      
      <p className="text-purple-400 text-lg">
        {isListening ? '🎤 Listening...' : 'Click to listen'}
      </p>
    </div>
  );
}

// ============================================================================
// Example 5: Loading State (Amber)
// ============================================================================
export function LoadingStateExample() {
  const [isActive, setIsActive] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = async () => {
    setIsLoading(true);
    // Simulate async operation
    await new Promise(resolve => setTimeout(resolve, 3000));
    setIsLoading(false);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black gap-8">
      <ArcReactor
        isActive={isActive}
        isSpeaking={false}
        isLoading={isLoading}
        onClick={handleClick}
      />
      
      <p className="text-amber-400 text-lg">
        {isLoading ? '⏳ Loading...' : 'Click to load'}
      </p>
    </div>
  );
}

// ============================================================================
// Example 6: Multi-State Dashboard
// ============================================================================
export function MultiStateExample() {
  const [isActive, setIsActive] = useState(true);
  const [state, setState] = useState<'idle' | 'speaking' | 'listening' | 'loading'>('idle');
  const [volume, setVolume] = useState(0.5);

  const states = ['idle', 'speaking', 'listening', 'loading'] as const;
  const currentIndex = states.indexOf(state);

  const handleStateChange = () => {
    const nextIndex = (currentIndex + 1) % states.length;
    setState(states[nextIndex]);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black gap-8">
      <ArcReactor
        isActive={isActive}
        isSpeaking={state === 'speaking'}
        isListening={state === 'listening'}
        isLoading={state === 'loading'}
        volume={volume}
        onClick={handleStateChange}
      />
      
      <div className="flex flex-col gap-4 items-center">
        <p className="text-cyan-400 text-xl font-bold">
          State: {state.toUpperCase()}
        </p>
        
        <div className="flex gap-2">
          {states.map((s) => (
            <button
              key={s}
              onClick={() => setState(s)}
              className={`px-4 py-2 rounded transition-colors ${
                state === s
                  ? 'bg-cyan-500 text-black'
                  : 'bg-gray-700 text-cyan-400 hover:bg-gray-600'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {state === 'speaking' && (
          <div className="w-64">
            <label className="text-cyan-400 block mb-2">
              Volume: {Math.round(volume * 100)}%
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="w-full"
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Example 7: With Audio Visualization (Simulated)
// ============================================================================
export function AudioVisualizationExample() {
  const [isActive, setIsActive] = useState(true);
  const [volume, setVolume] = useState(0);

  useEffect(() => {
    if (!isActive) return;

    const interval = setInterval(() => {
      // Simulate audio input with random fluctuations
      setVolume(prev => {
        const change = (Math.random() - 0.5) * 0.3;
        const newVolume = Math.max(0, Math.min(1, prev + change));
        return newVolume;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [isActive]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black gap-8">
      <ArcReactor
        isActive={isActive}
        isSpeaking={volume > 0.1}
        volume={volume}
        onClick={() => setIsActive(!isActive)}
      />
      
      <p className="text-cyan-400 text-lg">
        {isActive ? '🎵 Audio Reactive' : 'Click to start'}
      </p>
    </div>
  );
}

// ============================================================================
// Example 8: Responsive Grid
// ============================================================================
export function ResponsiveGridExample() {
  const [states, setStates] = useState([
    { id: 1, isActive: true, isSpeaking: false, isListening: false, isLoading: false },
    { id: 2, isActive: true, isSpeaking: true, isListening: false, isLoading: false },
    { id: 3, isActive: true, isSpeaking: false, isListening: true, isLoading: false },
    { id: 4, isActive: true, isSpeaking: false, isListening: false, isLoading: true },
  ]);

  const toggleState = (id: number) => {
    setStates(states.map(s => 
      s.id === id ? { ...s, isSpeaking: !s.isSpeaking } : s
    ));
  };

  return (
    <div className="min-h-screen bg-black p-8">
      <h1 className="text-cyan-400 text-3xl font-bold mb-12 text-center">
        Arc Reactor Grid
      </h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-7xl mx-auto">
        {states.map(state => (
          <div
            key={state.id}
            className="flex flex-col items-center gap-4"
          >
            <ArcReactor
              isActive={state.isActive}
              isSpeaking={state.isSpeaking}
              isListening={state.isListening}
              isLoading={state.isLoading}
              onClick={() => toggleState(state.id)}
            />
            <p className="text-cyan-400 text-sm">
              Reactor {state.id}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Example 9: Full Dashboard
// ============================================================================
export function FullDashboardExample() {
  const [isActive, setIsActive] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [volume, setVolume] = useState(0.5);

  return (
    <div className="min-h-screen bg-black text-cyan-400 p-8">
      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-2">JARVIS</h1>
        <p className="text-cyan-300">Virtual Assistant Interface</p>
      </div>

      {/* Main Reactor */}
      <div className="flex justify-center mb-12">
        <ArcReactor
          isActive={isActive}
          isSpeaking={isSpeaking}
          isListening={isListening}
          volume={volume}
          onClick={() => setIsActive(!isActive)}
        />
      </div>

      {/* Controls */}
      <div className="max-w-md mx-auto space-y-6">
        {/* Status */}
        <div className="border border-cyan-500/30 rounded p-4">
          <p className="text-sm mb-2">STATUS</p>
          <p className="text-lg font-bold">
            {!isActive ? 'OFFLINE' : isSpeaking ? 'SPEAKING' : isListening ? 'LISTENING' : 'STANDBY'}
          </p>
        </div>

        {/* Volume Control */}
        <div className="border border-cyan-500/30 rounded p-4">
          <label className="text-sm block mb-3">VOLUME</label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="w-full"
          />
          <p className="text-sm mt-2">{Math.round(volume * 100)}%</p>
        </div>

        {/* Mode Buttons */}
        <div className="border border-cyan-500/30 rounded p-4 space-y-2">
          <p className="text-sm mb-3">MODES</p>
          <button
            onClick={() => setIsSpeaking(!isSpeaking)}
            className={`w-full py-2 rounded transition-colors ${
              isSpeaking
                ? 'bg-cyan-500 text-black'
                : 'bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30'
            }`}
          >
            {isSpeaking ? '◼ SPEAKING' : '▶ SPEAK'}
          </button>
          <button
            onClick={() => setIsListening(!isListening)}
            className={`w-full py-2 rounded transition-colors ${
              isListening
                ? 'bg-purple-500 text-black'
                : 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30'
            }`}
          >
            {isListening ? '◼ LISTENING' : '▶ LISTEN'}
          </button>
        </div>
      </div>
    </div>
  );
}
