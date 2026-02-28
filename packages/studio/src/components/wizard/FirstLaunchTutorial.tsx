'use client';

/**
 * FirstLaunchTutorial — 5-step interactive onboarding overlay.
 * Auto-triggers on first visit, dismissible, re-triggerable from Help button.
 *
 * Steps:
 * 1. Welcome  — overview of HoloScript Studio
 * 2. Editor   — code editor introduction + paste sample scene
 * 3. Preview  — 3D preview pane explanation
 * 4. Assets   — asset library & Poly Haven introduction
 * 5. Complete — congrats + links to Examples & Templates
 */

import { useState } from 'react';
import { X, ChevronRight, ChevronLeft, Sparkles, BookOpen, Library, Layers, Code, Eye } from 'lucide-react';
import { useSceneStore } from '@/lib/store';

const SAMPLE_SCENE = `composition "My First Scene" {
  // A glowing cube floating in space
  object "Cube" {
    @transform { position: [0, 1, 0] scale: [1, 1, 1] }
    @material { albedo: "#6366f1" emissive: "#818cf8" emissiveIntensity: 0.5 metallic: 0.3 roughness: 0.4 }
    @animation { rotate: [0, 45, 0] loop: true }
    @physics { type: dynamic mass: 1 }
  }

  // Ground plane
  object "Ground" {
    @transform { position: [0, -0.5, 0] scale: [10, 0.1, 10] }
    @material { albedo: "#1e1b4b" roughness: 0.95 }
    @physics { type: static }
  }

  // Soft light
  light "Sun" {
    @transform { position: [5, 8, 3] }
    @light { type: directional color: "#fef3c7" intensity: 2.0 castShadow: true }
  }
}`;

interface Step {
  title: string;
  description: string;
  icon: React.ReactNode;
  action?: string;
}

const STEPS: Step[] = [
  {
    title: 'Welcome to HoloScript Studio! 🎉',
    description:
      'HoloScript Studio is a spatial creation IDE for building VR, AR, and 3D worlds using HoloScript — a trait-based language designed for immersive experiences. You can create scenes, add physics, lighting, animations, and deploy to 18+ platforms.',
    icon: <Sparkles className="h-6 w-6" />,
  },
  {
    title: 'The Code Editor',
    description:
      'On the left you\'ll find the code editor. HoloScript uses a simple, readable syntax with @-traits like @transform, @material, @physics, and @animation. Let\'s load a sample scene so you can see it in action!',
    icon: <Code className="h-6 w-6" />,
    action: 'paste_sample',
  },
  {
    title: 'Live 3D Preview',
    description:
      'The preview pane on the right shows your scene in real-time 3D. As you edit code, the preview updates instantly. You can orbit, pan, and zoom with your mouse. Try editing the cube\'s color or position!',
    icon: <Eye className="h-6 w-6" />,
  },
  {
    title: 'Asset Library & Poly Haven',
    description:
      'Click the 📦 Asset Library button in the toolbar to browse thousands of free 3D models, HDRIs, and textures from Poly Haven — all CC0 licensed. You can also use curated local packs. Click "Import" to add any asset to your scene.',
    icon: <Library className="h-6 w-6" />,
  },
  {
    title: 'You\'re Ready! 🚀',
    description:
      'Explore Examples (📚) for 47+ ready-made scenes, Templates (📋) for quick-start scenes, or ask Brittney AI to build scenes using natural language. You can always re-open this tour from the Help (❓) button.',
    icon: <BookOpen className="h-6 w-6" />,
  },
];

interface FirstLaunchTutorialProps {
  onClose: () => void;
}

export function FirstLaunchTutorial({ onClose }: FirstLaunchTutorialProps) {
  const [step, setStep] = useState(0);
  const setCode = useSceneStore((s) => s.setCode);
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const handleNext = () => {
    // Execute step action before advancing
    if (current.action === 'paste_sample') {
      setCode(SAMPLE_SCENE);
    }
    if (isLast) {
      onClose();
    } else {
      setStep(step + 1);
    }
  };

  const handlePrev = () => {
    if (step > 0) setStep(step - 1);
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-md mx-4 rounded-2xl border border-studio-accent/30 bg-studio-panel shadow-2xl shadow-studio-accent/10 overflow-hidden">
        {/* Progress bar */}
        <div className="h-1 bg-studio-surface">
          <div
            className="h-full bg-gradient-to-r from-studio-accent to-indigo-400 transition-all duration-500"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-3 top-3 rounded-lg p-1 text-studio-muted hover:text-studio-text transition"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Content */}
        <div className="p-6 pt-5">
          {/* Icon */}
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-studio-accent/10 text-studio-accent">
            {current.icon}
          </div>

          {/* Step indicator */}
          <p className="mb-1 text-[10px] font-medium text-studio-accent uppercase tracking-wider">
            Step {step + 1} of {STEPS.length}
          </p>

          {/* Title */}
          <h2 className="text-[16px] font-bold text-studio-text leading-tight">{current.title}</h2>

          {/* Description */}
          <p className="mt-3 text-[12px] leading-relaxed text-studio-muted">{current.description}</p>

          {/* Step dots */}
          <div className="mt-5 flex justify-center gap-1.5">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === step ? 'w-6 bg-studio-accent' : i < step ? 'w-1.5 bg-studio-accent/50' : 'w-1.5 bg-studio-border'
                }`}
              />
            ))}
          </div>

          {/* Navigation */}
          <div className="mt-5 flex items-center gap-2">
            {step > 0 && (
              <button
                onClick={handlePrev}
                className="flex items-center gap-1 rounded-xl border border-studio-border px-4 py-2 text-[11px] font-medium text-studio-muted hover:text-studio-text transition"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Back
              </button>
            )}
            <button
              onClick={onClose}
              className="ml-auto text-[10px] text-studio-muted hover:text-studio-text transition"
            >
              Skip tutorial
            </button>
            <button
              onClick={handleNext}
              className="flex items-center gap-1 rounded-xl bg-studio-accent px-5 py-2 text-[11px] font-semibold text-white hover:brightness-110 transition"
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
