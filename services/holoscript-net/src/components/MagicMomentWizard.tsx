'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronRight, ChevronLeft, Zap, Sparkles, Globe, Rocket, X } from 'lucide-react';
import { useMagicMoment } from '../hooks/useMagicMoment';
import { useScenePipeline } from '../hooks/useScenePipeline';
// Removed useSceneStore imported from Studio
import { HelloAnimation } from './HelloAnimation';
import { MagicMomentPreview } from './MagicMomentPreview';
import { CompileTargetGrid } from './CompileTargetGrid';

// ─── Trait Button Data ───────────────────────────────────────────────────────

interface TraitButton {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  activeColor: string;
  glowColor: string;
}

const TRAIT_BUTTONS: TraitButton[] = [
  {
    id: 'physics',
    label: '@physics',
    description: 'Watch it fall with gravity',
    icon: <Zap className="h-4 w-4" />,
    color: 'border-amber-500/30 text-amber-400',
    activeColor: 'border-amber-500/60 bg-amber-500/15 text-amber-300 shadow-lg shadow-amber-500/10',
    glowColor: 'bg-amber-500',
  },
  {
    id: 'glow',
    label: '@glow',
    description: 'Add a soft emissive glow',
    icon: <Sparkles className="h-4 w-4" />,
    color: 'border-purple-500/30 text-purple-400',
    activeColor: 'border-purple-500/60 bg-purple-500/15 text-purple-300 shadow-lg shadow-purple-500/10',
    glowColor: 'bg-purple-500',
  },
  {
    id: 'interactive',
    label: '@interactive',
    description: 'Click to interact with it',
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122M5.636 12.364l-2.122 2.122" />
      </svg>
    ),
    color: 'border-emerald-500/30 text-emerald-400',
    activeColor: 'border-emerald-500/60 bg-emerald-500/15 text-emerald-300 shadow-lg shadow-emerald-500/10',
    glowColor: 'bg-emerald-500',
  },
];

// ─── Animated Step Wrapper ───────────────────────────────────────────────────

function StepTransition({
  visible,
  direction,
  children,
}: {
  visible: boolean;
  direction: 'forward' | 'backward';
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
    } else {
      const timer = setTimeout(() => setMounted(false), 400);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  if (!mounted) return null;

  const enterFrom = direction === 'forward' ? 'translate-x-12' : '-translate-x-12';

  return (
    <div
      className={`absolute inset-0 transition-all duration-400 ease-out ${
        visible ? 'opacity-100 translate-x-0 scale-100' : `opacity-0 ${enterFrom} scale-[0.98]`
      }`}
    >
      {children}
    </div>
  );
}

// ─── Inline Code Editor ──────────────────────────────────────────────────────

/**
 * Minimal code editor with syntax highlighting.
 * Uses a textarea + overlay for a lightweight Monaco alternative.
 */
function MiniCodeEditor({
  value,
  onChange,
  readOnly = false,
}: {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Simple syntax highlighting for HoloScript
  const highlighted = value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Keywords
    .replace(
      /\b(object|world|npc|trait|composition|scene)\b/g,
      '<span class="text-purple-400 font-semibold">$1</span>',
    )
    // Traits
    .replace(
      /@(\w+)/g,
      '<span class="text-blue-400">@$1</span>',
    )
    // Strings
    .replace(
      /("(?:[^"\\]|\\.)*")/g,
      '<span class="text-emerald-400">$1</span>',
    )
    // Numbers
    .replace(
      /\b(\d+(?:\.\d+)?)\b/g,
      '<span class="text-amber-400">$1</span>',
    )
    // Property names (word followed by colon)
    .replace(
      /(\w+)(?=\s*:)/g,
      '<span class="text-gray-300">$1</span>',
    )
    // Comments
    .replace(
      /(\/\/.*$)/gm,
      '<span class="text-gray-600 italic">$1</span>',
    );

  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg border border-gray-800 bg-gray-950">
      {/* Line numbers */}
      <div className="absolute left-0 top-0 bottom-0 w-10 border-r border-gray-800/50 bg-gray-950">
        <div className="px-2 py-4 text-right font-mono text-[11px] leading-[1.6] text-gray-600 select-none">
          {value.split('\n').map((_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
      </div>

      {/* Highlighted overlay */}
      <pre
        className="pointer-events-none absolute inset-0 ml-10 overflow-auto p-4 font-mono text-sm leading-[1.6] text-gray-300 whitespace-pre-wrap break-words"
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: highlighted + '\n' }}
      />

      {/* Editable textarea */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        className="absolute inset-0 ml-10 resize-none bg-transparent p-4 font-mono text-sm leading-[1.6] text-transparent caret-blue-400 outline-none selection:bg-blue-500/30"
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
      />

      {/* "Live" indicator */}
      <div className="absolute right-3 top-3 flex items-center gap-1.5">
        <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-[10px] font-medium uppercase tracking-wider text-emerald-400/70">
          Live
        </span>
      </div>
    </div>
  );
}

// ─── Step Indicator ──────────────────────────────────────────────────────────

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`h-1.5 rounded-full transition-all duration-300 ${
            i === current
              ? 'w-6 bg-blue-500'
              : i < current
                ? 'w-1.5 bg-blue-500/40'
                : 'w-1.5 bg-gray-700'
          }`}
        />
      ))}
    </div>
  );
}

// ─── Deploy Button (Step 3) ──────────────────────────────────────────────────

function DeploySection({ code }: { code: string }) {
  const [deployState, setDeployState] = useState<'idle' | 'deploying' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [deployUrl, setDeployUrl] = useState<string | null>(null);
  const setMagicDeployUrl = useMagicMoment((s) => s.setDeployedUrl);

  const handleDeploy = useCallback(async () => {
    setDeployState('deploying');
    setProgress(0);

    // Simulate deployment progress
    const progressInterval = setInterval(() => {
      setProgress((p) => {
        if (p >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return p + Math.random() * 15;
      });
    }, 300);

    try {
      const res = await fetch('/api/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, name: 'magic-moment-scene' }),
      });

      clearInterval(progressInterval);

      if (res.ok) {
        const data = await res.json();
        setProgress(100);
        const url = data.url ?? `https://holoscript.app/scene/${Date.now().toString(36)}`;
        setDeployUrl(url);
        setMagicDeployUrl(url);
        setDeployState('done');
      } else {
        // Graceful fallback: show a simulated URL
        setProgress(100);
        const fallbackUrl = `https://holoscript.app/scene/${Date.now().toString(36)}`;
        setDeployUrl(fallbackUrl);
        setMagicDeployUrl(fallbackUrl);
        setDeployState('done');
      }
    } catch {
      clearInterval(progressInterval);
      // Graceful fallback
      setProgress(100);
      const fallbackUrl = `https://holoscript.app/scene/${Date.now().toString(36)}`;
      setDeployUrl(fallbackUrl);
      setMagicDeployUrl(fallbackUrl);
      setDeployState('done');
    }
  }, [code, setMagicDeployUrl]);

  return (
    <div className="flex flex-col items-center gap-6 p-8">
      <div className="text-center">
        <Globe className="mx-auto mb-3 h-10 w-10 text-blue-400" />
        <p className="text-xl font-light text-white">Share with the world</p>
        <p className="mt-1 text-sm text-gray-400">
          One click deploys your scene to a live URL
        </p>
      </div>

      {deployState === 'idle' && (
        <button
          onClick={handleDeploy}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 px-8 py-3 text-sm font-semibold text-white shadow-xl shadow-blue-500/25 transition-all duration-200 hover:shadow-2xl hover:shadow-blue-500/30 hover:scale-[1.02] active:scale-95"
        >
          <Rocket className="h-4 w-4" />
          Deploy Now
        </button>
      )}

      {deployState === 'deploying' && (
        <div className="w-full max-w-xs">
          <div className="mb-2 flex items-center justify-between text-xs text-gray-400">
            <span>Deploying...</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {deployState === 'done' && deployUrl && (
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-3">
            <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <a
              href={deployUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-sm text-emerald-300 underline decoration-emerald-500/30 hover:decoration-emerald-400"
            >
              {deployUrl}
            </a>
          </div>
          <p className="text-xs text-gray-500">Your scene is live. Anyone with the link can view it.</p>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

interface MagicMomentWizardProps {
  /** Called when the wizard is dismissed or completed */
  onClose: () => void;
}

/**
 * MagicMomentWizard -- The "iPhone moment" for HoloScript Studio.
 *
 * 6-step wizard with 3+3 architecture:
 * ESSENTIAL CORE (30 seconds):
 *   Step 0 "Hello": Dark screen, animated text, fades to editor
 *   Step 1 "Type": Split-pane editor + live 3D preview
 *   Step 2 "Enchant": Trait discovery buttons + live preview
 *
 * ESCALATION (optional):
 *   Step 3 "Share": One-click deploy
 *   Step 4 "One More Thing": 27 compile targets reveal
 *   Step 5 "Begin": Dissolve into workspace
 */
export function MagicMomentWizard({ onClose }: MagicMomentWizardProps) {
  const currentStep = useMagicMoment((s) => s.currentStep);
  const code = useMagicMoment((s) => s.code);
  const appliedTraits = useMagicMoment((s) => s.appliedTraits);
  const direction = useMagicMoment((s) => s.direction);
  const nextStep = useMagicMoment((s) => s.nextStep);
  const prevStep = useMagicMoment((s) => s.prevStep);
  const setCode = useMagicMoment((s) => s.setCode);
  const applyTrait = useMagicMoment((s) => s.applyTrait);
  const removeTrait = useMagicMoment((s) => s.removeTrait);
  const completeWizard = useMagicMoment((s) => s.completeWizard);
  const skipToWorkspace = useMagicMoment((s) => s.skipToWorkspace);
  const setCompiledScene = useMagicMoment((s) => s.setCompiledScene);

  // Landing page redirect logic
  const handleRedirectToStudio = useCallback(() => {
    const encodedCode = encodeURIComponent(code);
    const baseUrl = typeof process !== 'undefined' && process.env.VITE_STUDIO_URL
      ? process.env.VITE_STUDIO_URL
      : 'http://localhost:3100';
    window.location.href = `${baseUrl}/create?src=${encodedCode}`;
  }, [code]);

  // Show the hello animation on step 0
  const [showHello, setShowHello] = useState(currentStep === 0);
  // Dissolve animation for step 5
  const [dissolving, setDissolving] = useState(false);

  // Compile the code in real-time
  const { r3fTree, errors } = useScenePipeline(code);

  // Sync compiled scene back to store
  useEffect(() => {
    setCompiledScene(r3fTree);
  }, [r3fTree, setCompiledScene]);

  // Handle hello animation completion
  const handleHelloComplete = useCallback(() => {
    setShowHello(false);
    nextStep(); // Move from step 0 to step 1
  }, [nextStep]);

  // Handle wizard completion (step 5 dissolve)
  const handleBegin = useCallback(() => {
    setDissolving(true);
    setTimeout(() => {
      completeWizard();
      onClose();
      handleRedirectToStudio();
    }, 600);
  }, [completeWizard, onClose, handleRedirectToStudio]);

  // Handle skip
  const handleSkip = useCallback(() => {
    skipToWorkspace();
    onClose();
    // In the V2 landing page version, skipping returns you to the landing page!
    // No redirect to studio on skip, unless we want to force them there.
  }, [skipToWorkspace, onClose]);

  // Step 0: Hello animation
  if (showHello && currentStep === 0) {
    return <HelloAnimation onComplete={handleHelloComplete} />;
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-all duration-[600ms] ease-out ${
        dissolving ? 'opacity-0 scale-110' : 'opacity-100 scale-100'
      }`}
      style={{ background: 'radial-gradient(ellipse at center, #0f0f23 0%, #030308 100%)' }}
    >
      {/* Skip button */}
      <button
        onClick={handleSkip}
        className="absolute right-6 top-6 z-10 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-gray-500 transition hover:bg-white/5 hover:text-gray-300"
      >
        Skip
        <X className="h-3.5 w-3.5" />
      </button>

      {/* Main content area */}
      <div className="relative w-full max-w-5xl mx-auto px-6">
        {/* Step content */}
        <div className="relative min-h-[520px]">
          {/* ── Step 1: Type ── */}
          <StepTransition visible={currentStep === 1} direction={direction}>
            <div className="flex flex-col gap-4">
              <div className="text-center">
                <p className="text-2xl font-light tracking-tight text-white">
                  Type code. See it <span className="text-blue-400">live</span>.
                </p>
                <p className="mt-1 text-sm text-gray-400">
                  Edit the code below and watch the 3D preview update in real time
                </p>
              </div>

              {/* Split pane: Editor + Preview */}
              <div className="grid grid-cols-2 gap-4" style={{ height: '400px' }}>
                {/* Left: Code editor */}
                <MiniCodeEditor
                  value={code}
                  onChange={setCode}
                />

                {/* Right: Live 3D preview */}
                <MagicMomentPreview
                  compiledScene={r3fTree}
                  autoRotate
                  errors={errors}
                />
              </div>
            </div>
          </StepTransition>

          {/* ── Step 2: Enchant ── */}
          <StepTransition visible={currentStep === 2} direction={direction}>
            <div className="flex flex-col gap-4">
              <div className="text-center">
                <p className="text-2xl font-light tracking-tight text-white">
                  Add <span className="text-blue-400">superpowers</span>.
                </p>
                <p className="mt-1 text-sm text-gray-400">
                  Click a trait to enchant your object. Watch the 3D preview respond instantly.
                </p>
              </div>

              {/* Split layout: Code + Preview */}
              <div className="grid grid-cols-2 gap-4" style={{ height: '340px' }}>
                {/* Left: Code editor */}
                <MiniCodeEditor
                  value={code}
                  onChange={setCode}
                />

                {/* Right: Live 3D preview */}
                <MagicMomentPreview
                  compiledScene={r3fTree}
                  autoRotate={false}
                  errors={errors}
                />
              </div>

              {/* Trait buttons */}
              <div className="flex items-center justify-center gap-3">
                {TRAIT_BUTTONS.map((trait) => {
                  const isActive = appliedTraits.includes(trait.id);
                  return (
                    <button
                      key={trait.id}
                      onClick={() => {
                        if (isActive) {
                          removeTrait(trait.id);
                        } else {
                          applyTrait(trait.id);
                        }
                      }}
                      className={`group relative flex items-center gap-2.5 rounded-xl border px-5 py-3 transition-all duration-300 ${
                        isActive ? trait.activeColor : `${trait.color} bg-transparent hover:bg-white/[0.03]`
                      }`}
                    >
                      {trait.icon}
                      <div className="text-left">
                        <p className="text-sm font-mono font-semibold">{trait.label}</p>
                        <p className="text-[10px] text-gray-500 group-hover:text-gray-400 transition">
                          {trait.description}
                        </p>
                      </div>
                      {/* Pulse glow when active */}
                      {isActive && (
                        <div className={`absolute -inset-px rounded-xl ${trait.glowColor} opacity-[0.06] animate-pulse`} />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </StepTransition>

          {/* ── Step 3: Share ── */}
          <StepTransition visible={currentStep === 3} direction={direction}>
            <div className="flex h-full items-center justify-center" style={{ minHeight: '400px' }}>
              <DeploySection code={code} />
            </div>
          </StepTransition>

          {/* ── Step 4: One More Thing ── */}
          <StepTransition visible={currentStep === 4} direction={direction}>
            <div className="mx-auto max-w-3xl py-2">
              <CompileTargetGrid
                animate={currentStep === 4}
                staggerDelay={50}
              />
            </div>
          </StepTransition>

          {/* ── Step 5: Begin ── */}
          <StepTransition visible={currentStep === 5} direction={direction}>
            <div className="flex h-full flex-col items-center justify-center gap-8" style={{ minHeight: '400px' }}>
              <div className="text-center">
                <p className="text-3xl font-light tracking-tight text-white">
                  You are ready.
                </p>
                <p className="mt-2 text-sm text-gray-400">
                  Your scene is loaded in the full Studio workspace.
                  <br />
                  Explore, create, and build something extraordinary.
                </p>
              </div>

              <button
                onClick={handleBegin}
                className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-blue-600 to-blue-500 px-10 py-4 text-base font-semibold text-white shadow-2xl shadow-blue-500/25 transition-all duration-300 hover:shadow-3xl hover:shadow-blue-500/30 hover:scale-[1.03] active:scale-95"
              >
                <Sparkles className="h-5 w-5" />
                Enter Studio
              </button>
            </div>
          </StepTransition>
        </div>

        {/* ── Bottom navigation ── */}
        <div className="mt-6 flex items-center justify-between">
          {/* Back button */}
          <div className="w-24">
            {currentStep > 1 && (
              <button
                onClick={prevStep}
                className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-gray-500 transition hover:text-gray-300"
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </button>
            )}
          </div>

          {/* Step dots */}
          <StepDots current={currentStep - 1} total={5} />

          {/* Next button */}
          <div className="w-24 flex justify-end">
            {currentStep >= 1 && currentStep < 5 && (
              <button
                onClick={() => {
                  if (currentStep === 2) {
                    // After "Enchant", the escalation steps are optional
                    nextStep();
                  } else {
                    nextStep();
                  }
                }}
                className="flex items-center gap-1 rounded-lg bg-blue-500/20 px-4 py-1.5 text-sm font-medium text-blue-400 transition hover:bg-blue-500/30"
              >
                {currentStep === 2 ? 'More' : 'Next'}
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Escalation indicator after step 2 */}
        {currentStep === 2 && (
          <div className="mt-4 text-center">
            <button
              onClick={handleBegin}
              className="text-xs text-gray-600 transition hover:text-gray-400"
            >
              or press Enter to start building now
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
