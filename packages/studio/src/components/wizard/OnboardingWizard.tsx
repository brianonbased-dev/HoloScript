'use client';

/**
 * OnboardingWizard — Unified entry point for all Studio workflows.
 *
 * Step 0: "How are you starting?"
 *   → "I have existing code/data" → ImportRepoWizard flow
 *   → "Start from scratch" → StudioSetupWizard flow
 *   → "Describe what I want" → Brittney flow (describe → generate)
 *
 * This replaces the separate ImportRepoWizard and StudioSetupWizard
 * entry points. Both still exist as components — this wizard delegates
 * to whichever one the user needs.
 */

import React, { useState } from 'react';
import { X, Upload, Sparkles, MessageSquare, ArrowRight } from 'lucide-react';
import { ImportRepoWizard } from './ImportRepoWizard';
import { StudioSetupWizard } from './StudioSetupWizard';
import { BrittneyWizard } from './BrittneyWizard';

import { FirstRunWizard } from './FirstRunWizard';

type OnboardingPath = null | 'quickstart' | 'import' | 'create' | 'describe';

interface OnboardingWizardProps {
  onClose: () => void;
}

const PATHS = [
  {
    id: 'quickstart' as const,
    icon: ArrowRight,
    title: 'Quick start (5 minutes)',
    description: 'GitHub → Pick a starter → Deploy → Live. The fastest way to get a live composition running.',
    examples: 'Dashboard, 3D canvas, robot simulator, VR world',
    color: 'amber',
    borderColor: 'border-amber-500/30',
    bgColor: 'bg-amber-500/10',
    textColor: 'text-amber-400',
    recommended: true,
  },
  {
    id: 'import' as const,
    icon: Upload,
    title: 'I have existing code or data',
    description: 'GitHub repo, CSV inventory, API schema, POS export — Absorb scans it, classifies it, and tells you what to build.',
    examples: 'Express APIs, React apps, dispensary menus, IoT configs',
    color: 'blue',
    borderColor: 'border-blue-500/30',
    bgColor: 'bg-blue-500/10',
    textColor: 'text-blue-400',
  },
  {
    id: 'create' as const,
    icon: Sparkles,
    title: 'Start from scratch',
    description: 'Pick a category, configure your IDE, and build. Game, robotics, healthcare, architecture, retail — 13 domains with tailored panels.',
    examples: 'VR games, digital twins, 3D art, web experiences',
    color: 'emerald',
    borderColor: 'border-emerald-500/30',
    bgColor: 'bg-emerald-500/10',
    textColor: 'text-emerald-400',
  },
  {
    id: 'describe' as const,
    icon: MessageSquare,
    title: 'Describe what I want',
    description: 'Tell Brittney about your business in plain language. She generates the compositions, picks the compilers, and builds your simulation.',
    examples: '"I run a dispensary with 200 SKUs and 3 locations"',
    color: 'purple',
    borderColor: 'border-purple-500/30',
    bgColor: 'bg-purple-500/10',
    textColor: 'text-purple-400',
  },
] as const;

export function OnboardingWizard({ onClose }: OnboardingWizardProps) {
  const [path, setPath] = useState<OnboardingPath>(null);

  // Delegate to the appropriate wizard once a path is chosen
    if (path === 'quickstart') {
      return <FirstRunWizard onComplete={onClose} />;
    }

  if (path === 'import') {
    return <ImportRepoWizard onClose={onClose} />;
  }

  if (path === 'create') {
    return <StudioSetupWizard onClose={onClose} />;
  }

  if (path === 'describe') {
    return <BrittneyWizard onClose={onClose} />;
  }

  // Step 0: Choose your path
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl rounded-2xl border border-studio-border bg-[#0d0d14] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-studio-border px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Welcome to HoloScript Studio</h2>
            <p className="text-sm text-studio-muted">How are you starting?</p>
          </div>
          <button
                        title="Close"
            onClick={onClose}
            className="rounded-lg p-1.5 text-studio-muted transition hover:bg-white/5 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Path cards */}
        <div className="p-6 space-y-3">
          {PATHS.map((p) => {
            const Icon = p.icon;
            return (
              <button
                key={p.id}
                onClick={() => setPath(p.id)}
                className={`w-full text-left rounded-xl border ${p.borderColor} bg-[#111827] hover:bg-[#161f33] p-5 transition-all group`}
              >
                <div className="flex items-start gap-4">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${p.bgColor}`}>
                    <Icon className={`h-5 w-5 ${p.textColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className="text-white font-medium">{p.title}</h3>
                      <ArrowRight className="h-4 w-4 text-studio-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <p className="text-sm text-studio-muted mt-1">{p.description}</p>
                    <p className="text-xs text-studio-muted/60 mt-2 italic">{p.examples}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="border-t border-studio-border px-6 py-3">
          <p className="text-xs text-studio-muted text-center">
            All paths lead to the same platform. 37 compilers. Every device.
          </p>
        </div>
      </div>
    </div>
  );
}
