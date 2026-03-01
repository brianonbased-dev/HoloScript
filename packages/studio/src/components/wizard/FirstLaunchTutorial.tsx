'use client';

/**
 * FirstLaunchTutorial — Premium visual onboarding overlay.
 * Each step has an inline SVG illustration showing exactly what it's explaining.
 *
 * Steps:
 * 1. Welcome  — animated studio overview diagram
 * 2. Editor   — code editor visual with syntax highlight mockup + paste sample
 * 3. Preview  — 3D viewport diagram with orbit/pan/zoom callouts
 * 4. Builder  — hotbar & building tools visual guide
 * 5. Complete — congrats + keyboard shortcuts cheatsheet
 */

import { useState, useEffect } from 'react';
import { X, ChevronRight, ChevronLeft, Sparkles, Keyboard } from 'lucide-react';
import { useSceneStore } from '@/lib/store';

const SAMPLE_SCENE = `composition "My First Scene" {
  environment {
    skybox: "sunset"
    fog_density: 0.01
  }

  object "GlowCube" {
    geometry: "cube"
    position: [0, 1, 0]
    color: "#6366f1"
    emissive: "#818cf8"
    emissiveIntensity: 0.5
    metalness: 0.3
    roughness: 0.4
  }

  object "Floor" {
    geometry: "plane"
    position: [0, -0.5, 0]
    scale: [10, 10, 10]
    color: "#1e1b4b"
    roughness: 0.95
  }

  point_light {
    position: [5, 8, 3]
    color: "#fef3c7"
    intensity: 2.0
  }
}`;

// ── Visual Illustrations (SVG) ───────────────────────────────────────────

function WelcomeVisual() {
  return (
    <div className="relative w-full h-48 rounded-xl bg-gradient-to-br from-indigo-950/80 to-purple-950/80 border border-indigo-500/20 overflow-hidden">
      {/* Animated grid */}
      <div className="absolute inset-0 opacity-10" style={{
        backgroundImage: 'linear-gradient(rgba(99,102,241,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.3) 1px, transparent 1px)',
        backgroundSize: '20px 20px',
      }} />

      {/* Studio layout mockup */}
      <div className="absolute inset-3 flex gap-2">
        {/* Left panel */}
        <div className="w-1/3 rounded-lg border border-indigo-500/30 bg-indigo-950/50 p-2 flex flex-col gap-1">
          <div className="h-2 w-12 rounded bg-indigo-400/40" />
          <div className="flex-1 rounded bg-indigo-900/40 p-1.5">
            <div className="h-1.5 w-full rounded bg-indigo-400/20 mb-1" />
            <div className="h-1.5 w-4/5 rounded bg-purple-400/20 mb-1" />
            <div className="h-1.5 w-full rounded bg-indigo-400/20 mb-1" />
            <div className="h-1.5 w-3/5 rounded bg-purple-400/20 mb-1" />
            <div className="h-1.5 w-full rounded bg-green-400/20 mb-1" />
            <div className="h-1.5 w-4/5 rounded bg-indigo-400/20" />
          </div>
          <div className="text-[7px] text-indigo-300/60 text-center mt-0.5">CODE EDITOR</div>
        </div>

        {/* Right panel - 3D view */}
        <div className="flex-1 rounded-lg border border-indigo-500/30 bg-indigo-950/50 p-2 flex flex-col">
          <div className="flex-1 rounded bg-gradient-to-b from-indigo-900/30 to-purple-900/40 flex items-center justify-center relative overflow-hidden">
            {/* 3D cube wireframe */}
            <svg viewBox="0 0 80 80" className="w-16 h-16 opacity-60">
              <g stroke="#818cf8" strokeWidth="1" fill="none">
                <rect x="25" y="25" width="30" height="30" rx="1" className="animate-pulse" />
                <line x1="25" y1="25" x2="35" y2="15" />
                <line x1="55" y1="25" x2="65" y2="15" />
                <line x1="55" y1="55" x2="65" y2="45" />
                <line x1="25" y1="55" x2="35" y2="45" />
                <rect x="35" y="15" width="30" height="30" rx="1" opacity="0.4" />
              </g>
              {/* Ground line */}
              <line x1="10" y1="62" x2="70" y2="62" stroke="#4f46e5" strokeWidth="0.5" opacity="0.5" />
            </svg>
            {/* Floating particles */}
            <div className="absolute w-1 h-1 rounded-full bg-indigo-400/60 top-4 left-8 animate-ping" style={{ animationDuration: '3s' }} />
            <div className="absolute w-1 h-1 rounded-full bg-purple-400/60 bottom-6 right-6 animate-ping" style={{ animationDuration: '4s' }} />
            <div className="absolute w-0.5 h-0.5 rounded-full bg-cyan-400/60 top-8 right-12 animate-ping" style={{ animationDuration: '5s' }} />
          </div>
          <div className="text-[7px] text-indigo-300/60 text-center mt-1">3D PREVIEW</div>
        </div>
      </div>

      {/* Floating label */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-[9px] text-indigo-300 font-medium backdrop-blur-sm">
        Split-view IDE · Code ↔ Preview
      </div>
    </div>
  );
}

function EditorVisual() {
  return (
    <div className="relative w-full h-48 rounded-xl bg-gradient-to-br from-slate-950 to-indigo-950/80 border border-indigo-500/20 overflow-hidden p-3">
      {/* Code editor mockup with syntax highlighting */}
      <div className="rounded-lg bg-black/40 border border-white/5 p-3 font-mono text-[9px] leading-relaxed h-full overflow-hidden">
        <div><span className="text-purple-400">composition</span> <span className="text-amber-300">&quot;My Scene&quot;</span> <span className="text-white/40">{'{'}</span></div>
        <div className="ml-3"><span className="text-blue-400">object</span> <span className="text-amber-300">&quot;Cube&quot;</span> <span className="text-white/40">{'{'}</span></div>
        <div className="ml-6"><span className="text-cyan-400">geometry</span><span className="text-white/30">:</span> <span className="text-amber-300">&quot;cube&quot;</span></div>
        <div className="ml-6"><span className="text-cyan-400">position</span><span className="text-white/30">:</span> <span className="text-white/40">[</span><span className="text-green-400">0</span><span className="text-white/30">,</span> <span className="text-green-400">1</span><span className="text-white/30">,</span> <span className="text-green-400">0</span><span className="text-white/40">]</span></div>
        <div className="ml-6"><span className="text-cyan-400">color</span><span className="text-white/30">:</span> <span className="text-amber-300">&quot;#6366f1&quot;</span></div>
        <div className="ml-6">
          <span className="text-cyan-400">emissive</span><span className="text-white/30">:</span> <span className="text-amber-300">&quot;#818cf8&quot;</span>
          <span className="ml-2 inline-block w-2 h-2 rounded-sm" style={{ background: '#818cf8' }} />
        </div>
        <div className="ml-3"><span className="text-white/40">{'}'}</span></div>
        <div><span className="text-white/40">{'}'}</span></div>
      </div>

      {/* Callout arrows */}
      <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/30 text-[8px] text-emerald-300 font-medium">
        ✨ Auto-updates preview
      </div>
      <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-amber-500/20 border border-amber-400/30 text-[8px] text-amber-300 font-medium">
        Simple property: value syntax
      </div>
    </div>
  );
}

function PreviewVisual() {
  return (
    <div className="relative w-full h-48 rounded-xl bg-gradient-to-br from-slate-950 to-purple-950/80 border border-indigo-500/20 overflow-hidden">
      {/* 3D scene mockup */}
      <div className="absolute inset-0 flex items-center justify-center">
        <svg viewBox="0 0 200 140" className="w-full h-full">
          {/* Sky gradient */}
          <defs>
            <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1e1b4b" />
              <stop offset="100%" stopColor="#312e81" />
            </linearGradient>
            <radialGradient id="glow" cx="50%" cy="50%">
              <stop offset="0%" stopColor="#818cf8" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#818cf8" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="200" height="140" fill="url(#sky)" />

          {/* Ground plane */}
          <polygon points="0,100 200,100 180,85 20,85" fill="#1e1b4b" stroke="#4f46e5" strokeWidth="0.3" opacity="0.6" />
          {/* Grid lines */}
          <g stroke="#4f46e5" strokeWidth="0.2" opacity="0.3">
            <line x1="40" y1="85" x2="20" y2="100" />
            <line x1="80" y1="85" x2="70" y2="100" />
            <line x1="120" y1="85" x2="130" y2="100" />
            <line x1="160" y1="85" x2="180" y2="100" />
          </g>

          {/* 3D Cube */}
          <g transform="translate(85, 45)">
            <circle r="25" fill="url(#glow)" />
            {/* Front face */}
            <rect x="-12" y="-12" width="24" height="24" fill="#6366f1" stroke="#818cf8" strokeWidth="0.5" rx="1" />
            {/* Top face */}
            <polygon points="-12,-12 -4,-20 20,-20 12,-12" fill="#7c7ff7" stroke="#818cf8" strokeWidth="0.5" />
            {/* Right face */}
            <polygon points="12,-12 20,-20 20,4 12,12" fill="#4f46e5" stroke="#818cf8" strokeWidth="0.5" />
          </g>

          {/* Light ray */}
          <line x1="160" y1="15" x2="97" y2="40" stroke="#fef3c7" strokeWidth="0.3" opacity="0.5" strokeDasharray="3 3" />
          <circle cx="160" cy="15" r="4" fill="#fef3c7" opacity="0.4" />
        </svg>
      </div>

      {/* Mouse control callouts */}
      <div className="absolute top-2 left-2 flex flex-col gap-1">
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[8px] text-white/70">
          <span className="text-[10px]">🖱️</span> Left drag — Orbit
        </div>
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[8px] text-white/70">
          <span className="text-[10px]">🖱️</span> Right drag — Pan
        </div>
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[8px] text-white/70">
          <span className="text-[10px]">⚙️</span> Scroll — Zoom
        </div>
      </div>

      <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-blue-500/20 border border-blue-400/30 text-[8px] text-blue-300 font-medium">
        Click any object to select & transform
      </div>
    </div>
  );
}

function BuilderVisual() {
  const slots = [
    { geo: '■', color: '#6366f1', label: 'Cube' },
    { geo: '●', color: '#ec4899', label: 'Sphere' },
    { geo: '▬', color: '#10b981', label: 'Cylinder' },
    { geo: '▲', color: '#f59e0b', label: 'Cone' },
    { geo: '◎', color: '#06b6d4', label: 'Torus' },
    { geo: '⬮', color: '#8b5cf6', label: 'Capsule' },
    { geo: '▭', color: '#ef4444', label: 'Plane' },
    { geo: '◍', color: '#14b8a6', label: 'Ring' },
  ];
  return (
    <div className="relative w-full h-48 rounded-xl bg-gradient-to-br from-slate-950 to-indigo-950/80 border border-indigo-500/20 overflow-hidden flex flex-col items-center justify-center gap-3 px-4">
      {/* Mode buttons */}
      <div className="flex gap-2">
        <div className="px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-[10px] text-emerald-300 font-semibold flex items-center gap-1">
          <span>🏗️</span> Place <kbd className="ml-1 px-1 rounded bg-white/10 text-[8px]">P</kbd>
        </div>
        <div className="px-3 py-1.5 rounded-lg bg-red-500/15 border border-red-400/30 text-[10px] text-red-300 font-semibold flex items-center gap-1">
          <span>💥</span> Break <kbd className="ml-1 px-1 rounded bg-white/10 text-[8px]">X</kbd>
        </div>
        <div className="px-3 py-1.5 rounded-lg bg-blue-500/15 border border-blue-400/30 text-[10px] text-blue-300 font-semibold flex items-center gap-1">
          <span>✋</span> Select <kbd className="ml-1 px-1 rounded bg-white/10 text-[8px]">V</kbd>
        </div>
      </div>

      {/* Hotbar */}
      <div className="flex gap-1.5">
        {slots.map((s, i) => (
          <div key={i} className={`w-10 h-10 rounded-lg border flex flex-col items-center justify-center gap-0.5 transition ${i === 0 ? 'border-indigo-400 bg-indigo-500/20 shadow-lg shadow-indigo-500/20' : 'border-white/10 bg-white/5'}`}>
            <span className="text-sm" style={{ color: s.color }}>{s.geo}</span>
            <span className="text-[6px] text-white/50">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Key hints */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 text-[9px] text-white/50">
          <kbd className="px-1.5 py-0.5 rounded bg-white/10 border border-white/10 text-[8px] font-mono text-white/70">1</kbd>
          -
          <kbd className="px-1.5 py-0.5 rounded bg-white/10 border border-white/10 text-[8px] font-mono text-white/70">8</kbd>
          <span className="ml-1">Select shape</span>
        </div>
        <div className="flex items-center gap-1 text-[9px] text-white/50">
          <kbd className="px-1.5 py-0.5 rounded bg-white/10 border border-white/10 text-[8px] font-mono text-white/70">G</kbd>
          <span className="ml-1">Grid snap</span>
        </div>
      </div>

      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-purple-500/20 border border-purple-400/30 text-[8px] text-purple-300 font-medium">
        Minecraft-style building · Click to place
      </div>
    </div>
  );
}

function ShortcutsVisual() {
  const shortcuts = [
    { keys: ['1-8'], desc: 'Select hotbar slot' },
    { keys: ['P'], desc: 'Place mode' },
    { keys: ['X'], desc: 'Break mode' },
    { keys: ['V'], desc: 'Select mode' },
    { keys: ['G'], desc: 'Toggle grid snap' },
    { keys: ['Ctrl', 'Z'], desc: 'Undo' },
    { keys: ['Ctrl', 'S'], desc: 'Save project' },
    { keys: ['Del'], desc: 'Delete selected' },
  ];
  return (
    <div className="w-full h-48 rounded-xl bg-gradient-to-br from-slate-950 to-indigo-950/80 border border-indigo-500/20 overflow-hidden p-3">
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 h-full content-center">
        {shortcuts.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="flex gap-0.5">
              {s.keys.map((k, j) => (
                <kbd key={j} className="px-1.5 py-0.5 rounded bg-white/10 border border-white/15 text-[9px] font-mono text-white/80 min-w-[22px] text-center">
                  {k}
                </kbd>
              ))}
            </div>
            <span className="text-[9px] text-white/50">{s.desc}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Step Definitions ─────────────────────────────────────────────────────

interface Step {
  title: string;
  subtitle: string;
  visual: React.ReactNode;
  action?: string;
}

const STEPS: Step[] = [
  {
    title: 'Welcome to HoloScript Studio',
    subtitle: 'A split-view IDE for building 3D worlds. Code on the left, see it live on the right — everything updates in real-time.',
    visual: <WelcomeVisual />,
  },
  {
    title: 'Write HoloScript Code',
    subtitle: 'Simple property: value syntax. Define objects with geometry, position, color, and materials. We\'ll load a sample scene for you.',
    visual: <EditorVisual />,
    action: 'paste_sample',
  },
  {
    title: 'Explore in 3D',
    subtitle: 'Orbit, pan, and zoom the viewport. Click on any object to select it, then drag the gizmo handles to transform it.',
    visual: <PreviewVisual />,
  },
  {
    title: 'Build with the Hotbar',
    subtitle: 'Place, break, or select objects using the Minecraft-style toolbar. Pick shapes with keys 1-8 and click to build.',
    visual: <BuilderVisual />,
  },
  {
    title: 'You\'re Ready! 🚀',
    subtitle: 'Here are the shortcuts you\'ll use most. Re-open this tour anytime from the Help (?) button.',
    visual: <ShortcutsVisual />,
  },
];

// ── Main Component ───────────────────────────────────────────────────────

interface FirstLaunchTutorialProps {
  onClose: () => void;
}

export function FirstLaunchTutorial({ onClose }: FirstLaunchTutorialProps) {
  const [step, setStep] = useState(0);
  const [animating, setAnimating] = useState(false);
  const setCode = useSceneStore((s) => s.setCode);
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const transition = (nextStep: number) => {
    setAnimating(true);
    setTimeout(() => {
      setStep(nextStep);
      setAnimating(false);
    }, 200);
  };

  const handleNext = () => {
    if (current.action === 'paste_sample') {
      setCode(SAMPLE_SCENE);
    }
    if (isLast) {
      onClose();
    } else {
      transition(step + 1);
    }
  };

  const handlePrev = () => {
    if (step > 0) transition(step - 1);
  };

  // Keyboard nav
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' || e.key === 'Enter') handleNext();
      if (e.key === 'ArrowLeft') handlePrev();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-md">
      <div className="relative w-full max-w-lg mx-4 rounded-2xl border border-studio-accent/30 bg-studio-panel shadow-2xl shadow-studio-accent/10 overflow-hidden">
        {/* Progress bar */}
        <div className="h-1 bg-studio-surface">
          <div
            className="h-full bg-gradient-to-r from-studio-accent via-indigo-400 to-purple-400 transition-all duration-500"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>

        {/* Close */}
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-10 rounded-lg p-1.5 text-studio-muted hover:text-studio-text hover:bg-white/5 transition"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Content */}
        <div className={`p-5 transition-opacity duration-200 ${animating ? 'opacity-0' : 'opacity-100'}`}>
          {/* Visual illustration */}
          <div className="mb-4">
            {current.visual}
          </div>

          {/* Step badge */}
          <span className="inline-block mb-2 px-2 py-0.5 rounded-full bg-studio-accent/15 text-[9px] font-semibold text-studio-accent uppercase tracking-widest">
            Step {step + 1} of {STEPS.length}
          </span>

          {/* Title */}
          <h2 className="text-lg font-bold text-studio-text leading-tight">{current.title}</h2>

          {/* Subtitle */}
          <p className="mt-1.5 text-[13px] leading-relaxed text-studio-muted">{current.subtitle}</p>

          {/* Step dots */}
          <div className="mt-4 flex justify-center gap-1.5">
            {STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => transition(i)}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === step ? 'w-7 bg-studio-accent' : i < step ? 'w-2 bg-studio-accent/50' : 'w-2 bg-studio-border'
                }`}
              />
            ))}
          </div>

          {/* Navigation */}
          <div className="mt-4 flex items-center gap-2">
            {step > 0 && (
              <button
                onClick={handlePrev}
                className="flex items-center gap-1 rounded-xl border border-studio-border px-4 py-2 text-[12px] font-medium text-studio-muted hover:text-studio-text transition"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Back
              </button>
            )}
            <button
              onClick={onClose}
              className="ml-auto text-[11px] text-studio-muted/60 hover:text-studio-text transition"
            >
              Skip
            </button>
            <button
              onClick={handleNext}
              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-studio-accent to-indigo-500 px-5 py-2.5 text-[12px] font-semibold text-white hover:brightness-110 transition shadow-lg shadow-studio-accent/20"
            >
              {isLast ? (
                <>
                  <Sparkles className="h-3.5 w-3.5" /> Start Creating
                </>
              ) : (
                <>
                  Next <ChevronRight className="h-3.5 w-3.5" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
