'use client';

/**
 * FirstRunWizard — 4-step onboarding for new HoloScript Studio users.
 *
 * Step 1: Connect GitHub via OAuth popup
 * Step 2: Choose starter composition from template picker (3 options)
 * Step 3: Deploy to Railway with real-time progress bar
 * Step 4: Visit deployed experience with clickable URL
 *
 * Features:
 * - Skip option on all steps
 * - Progress persistence to localStorage
 * - Studio design system integration
 * - Real-time deployment status
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  X,
  ChevronRight,
  ChevronLeft,
  Check,
  Sparkles,
  Github,
  Rocket,
  ExternalLink,
  Loader2,
  AlertCircle,
  Globe,
  Gamepad2,
  Palette,
} from 'lucide-react';
import { useConnectorStore } from '@/lib/stores/connectorStore';
import { GitHubOAuthModal } from './integrations/GitHubOAuthModal';
import { getWizardTemplate } from '@/lib/presets/wizardTemplates';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FirstRunWizardProps {
  onClose: () => void;
  onComplete?: () => void;
}

type WizardStep = 0 | 1 | 2 | 3;
type DeployStatus = 'idle' | 'deploying' | 'success' | 'error';

interface TemplateOption {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  code: string;
  tags: string[];
}

interface WizardProgress {
  currentStep: WizardStep;
  githubConnected: boolean;
  selectedTemplate: string | null;
  deploymentUrl: string | null;
  completedAt: string | null;
}

// ─── Template Options ─────────────────────────────────────────────────────────

const STARTER_TEMPLATES: TemplateOption[] = [
  {
    id: 'vr-game',
    name: 'VR Game Scene',
    description: 'Interactive VR environment with physics and grabbable objects',
    icon: <Gamepad2 className="h-6 w-6" />,
    code:
      getWizardTemplate('vr-game')?.code ||
      `composition "VR Game" {
  environment {
    skybox: "studio"
    ambient_light: 0.6
    shadows: true
  }

  object "GrabbableCube" {
    @grabbable
    @physics type:"dynamic" shape:"box"
    geometry: "box"
    position: [0, 1.5, -2]
    scale: [0.4, 0.4, 0.4]
    color: "#ff4444"
  }
}`,
    tags: ['VR', 'Interactive', 'Physics'],
  },
  {
    id: 'web-experience',
    name: '3D Web Experience',
    description: 'Responsive 3D scene optimized for web browsers',
    icon: <Globe className="h-6 w-6" />,
    code: `composition "Web Experience" {
  environment {
    skybox: "sunset"
    ambient_light: 0.5
    fog: true
  }

  object "Hero" {
    @glowing
    geometry: "sphere"
    position: [0, 2, -5]
    scale: [2, 2, 2]
    color: "#4488ff"
    emissive: "#4488ff"
    emissiveIntensity: 0.6

    animation float {
      property: "position.y"
      from: 1.8
      to: 2.2
      duration: 2000
      loop: infinite
      easing: "easeInOut"
    }
  }

  object "Platform" {
    @collidable
    geometry: "cylinder"
    position: [0, 0, -5]
    scale: [3, 0.2, 3]
    color: "#334455"
  }
}`,
    tags: ['Web', 'Responsive', 'Animation'],
  },
  {
    id: 'art-gallery',
    name: '3D Art Gallery',
    description: 'Minimalist gallery space for showcasing 3D models',
    icon: <Palette className="h-6 w-6" />,
    code: `composition "Art Gallery" {
  environment {
    skybox: "warehouse"
    ambient_light: 0.8
    shadows: true
  }

  object "Gallery Floor" {
    @static
    geometry: "plane"
    position: [0, 0, 0]
    rotation: [-90, 0, 0]
    scale: [20, 20, 1]
    color: "#f5f5f5"
  }

  object "Sculpture 1" {
    @glowing
    geometry: "torus"
    position: [-3, 1.5, -5]
    rotation: [45, 0, 0]
    color: "#ff6b6b"
    emissive: "#ff6b6b"
    emissiveIntensity: 0.3

    animation rotate {
      property: "rotation.y"
      from: 0
      to: 360
      duration: 4000
      loop: infinite
    }
  }

  object "Sculpture 2" {
    geometry: "octahedron"
    position: [0, 1.5, -5]
    scale: [1.2, 1.2, 1.2]
    color: "#4ecdc4"
  }

  object "Sculpture 3" {
    @glowing
    geometry: "icosahedron"
    position: [3, 1.5, -5]
    color: "#ffe66d"
    emissive: "#ffe66d"
    emissiveIntensity: 0.4
  }
}`,
    tags: ['Art', 'Gallery', 'Minimal'],
  },
];

// ─── localStorage Persistence ─────────────────────────────────────────────────

const STORAGE_KEY = 'holoscript-wizard-progress';

function loadProgress(): WizardProgress | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function saveProgress(progress: WizardProgress): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch (err) {
    console.warn('[FirstRunWizard] Failed to save progress:', err);
  }
}

function clearProgress(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.warn('[FirstRunWizard] Failed to clear progress:', err);
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function FirstRunWizard({ onClose, onComplete }: FirstRunWizardProps) {
  // Load persisted progress
  const persistedProgress = useMemo(() => loadProgress(), []);

  const [step, setStep] = useState<WizardStep>(persistedProgress?.currentStep ?? 0);
  const [prevStep, setPrevStep] = useState<WizardStep>(0);

  // Step 1: GitHub connection
  const [showGitHubModal, setShowGitHubModal] = useState(false);
  const githubConnection = useConnectorStore((s) => s.connections.github);
  const isGitHubConnected = githubConnection?.status === 'connected';

  // Step 2: Template selection
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(
    persistedProgress?.selectedTemplate ?? null
  );

  // Step 3: Deployment
  const [deployStatus, setDeployStatus] = useState<DeployStatus>('idle');
  const [deploymentUrl, setDeploymentUrl] = useState<string | null>(
    persistedProgress?.deploymentUrl ?? null
  );
  const [deployError, setDeployError] = useState<string | null>(null);
  const [deployProgress, setDeployProgress] = useState(0);

  // Step 4: Completion
  const [completed, setCompleted] = useState(false);

  const TOTAL_STEPS = 4;
  const direction: 'left' | 'right' = step >= prevStep ? 'right' : 'left';

  // ── Save progress on state changes ──
  useEffect(() => {
    const progress: WizardProgress = {
      currentStep: step,
      githubConnected: isGitHubConnected,
      selectedTemplate,
      deploymentUrl,
      completedAt: completed ? new Date().toISOString() : null,
    };
    saveProgress(progress);
  }, [step, isGitHubConnected, selectedTemplate, deploymentUrl, completed]);

  // ── Navigation ──

  const goToStep = useCallback(
    (next: WizardStep) => {
      setPrevStep(step);
      setStep(next);
    },
    [step]
  );

  const canNext = useMemo(() => {
    switch (step) {
      case 0:
        return isGitHubConnected;
      case 1:
        return !!selectedTemplate;
      case 2:
        return deployStatus === 'success';
      case 3:
        return true;
      default:
        return false;
    }
  }, [step, isGitHubConnected, selectedTemplate, deployStatus]);

  // ── GitHub OAuth Success ──

  const handleGitHubSuccess = useCallback((accessToken: string) => {
    setShowGitHubModal(false);
    // Connection state is managed by connectorStore
  }, []);

  // ── Deploy to Railway ──

  const handleDeploy = useCallback(async () => {
    if (!selectedTemplate) return;

    const template = STARTER_TEMPLATES.find((t) => t.id === selectedTemplate);
    if (!template) return;

    setDeployStatus('deploying');
    setDeployError(null);
    setDeployProgress(0);

    try {
      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setDeployProgress((prev) => Math.min(prev + 10, 90));
      }, 300);

      const response = await fetch('/api/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: template.code,
          name: template.name,
          target: 'r3f',
        }),
      });

      clearInterval(progressInterval);
      setDeployProgress(100);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || `Deploy failed: HTTP ${response.status}`);
      }

      const data = await response.json();

      setDeploymentUrl(data.url || null);
      setDeployStatus('success');
    } catch (err) {
      setDeployStatus('error');
      setDeployError(err instanceof Error ? err.message : 'Deployment failed');
    }
  }, [selectedTemplate]);

  // ── Complete Wizard ──

  const handleComplete = useCallback(() => {
    setCompleted(true);
    clearProgress();
    setTimeout(() => {
      onComplete?.();
      onClose();
    }, 1000);
  }, [onComplete, onClose]);

  // ── Skip Logic ──

  const handleSkip = useCallback(() => {
    if (step === 0) {
      // Skip GitHub → go to template selection
      goToStep(1);
    } else if (step === 1) {
      // Skip template → select default and go to deploy
      setSelectedTemplate(STARTER_TEMPLATES[0].id);
      goToStep(2);
    } else if (step === 2) {
      // Skip deploy → go directly to completion
      goToStep(3);
    } else {
      // Final skip closes wizard
      clearProgress();
      onClose();
    }
  }, [step, goToStep, onClose]);

  // ── Success Flash ──

  if (completed) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-4 animate-bounce">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500 shadow-2xl shadow-emerald-500/50">
            <Check className="h-10 w-10 text-white" />
          </div>
          <p className="text-lg font-semibold text-emerald-400">Welcome to HoloScript!</p>
        </div>
      </div>
    );
  }

  const stepTitles = [
    'Connect GitHub',
    'Choose Your Starter',
    'Deploy to Web',
    'Your First Experience',
  ];

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
        <div className="relative w-full max-w-2xl rounded-2xl border border-studio-border bg-studio-panel shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-studio-border px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-emerald-500/20 p-2">
                <Sparkles className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-studio-text">{stepTitles[step]}</p>
                <p className="text-xs text-studio-muted">
                  Step {step + 1} of {TOTAL_STEPS}
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                clearProgress();
                onClose();
              }}
              className="rounded-lg p-1.5 text-studio-muted hover:bg-white/10 hover:text-studio-text transition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Progress Bar */}
          <div className="h-1 bg-black/20">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500 ease-out"
              style={{ width: `${((step + 1) / TOTAL_STEPS) * 100}%` }}
            />
          </div>

          {/* Step Content */}
          <div className="relative min-h-[400px] p-6">
            {/* ── Step 0: GitHub Connection ── */}
            {step === 0 && (
              <div className="flex flex-col items-center gap-6 py-8">
                <div className="rounded-full bg-github-500/10 p-6">
                  <Github className="h-12 w-12 text-white" />
                </div>

                <div className="text-center max-w-md">
                  <h3 className="text-xl font-semibold text-studio-text mb-2">
                    Connect Your GitHub Account
                  </h3>
                  <p className="text-sm text-studio-muted">
                    Link GitHub to save your projects, collaborate with others, and deploy to the
                    web with one click.
                  </p>
                </div>

                {isGitHubConnected ? (
                  <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-6 py-4">
                    <Check className="h-5 w-5 text-emerald-400" />
                    <span className="text-sm font-medium text-emerald-400">
                      GitHub Connected Successfully
                    </span>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowGitHubModal(true)}
                    className="flex items-center gap-2 rounded-lg bg-white px-6 py-3 text-sm font-semibold text-black shadow-lg transition hover:bg-gray-100 hover:scale-[1.02] active:scale-95"
                  >
                    <Github className="h-5 w-5" />
                    Connect GitHub
                  </button>
                )}

                <p className="text-xs text-studio-muted">
                  Your data stays secure. We only request repository access.
                </p>
              </div>
            )}

            {/* ── Step 1: Template Selection ── */}
            {step === 1 && (
              <div className="space-y-4">
                <p className="text-sm text-studio-muted">
                  Choose a starter template to begin your HoloScript journey
                </p>

                <div className="grid gap-3">
                  {STARTER_TEMPLATES.map((template) => (
                    <button
                      key={template.id}
                      onClick={() => setSelectedTemplate(template.id)}
                      className={`relative flex items-start gap-4 rounded-xl border p-5 text-left transition-all duration-200 ${
                        selectedTemplate === template.id
                          ? 'border-emerald-500/60 bg-emerald-500/10 scale-[1.01] shadow-lg shadow-emerald-500/10'
                          : 'border-studio-border bg-black/20 hover:border-studio-border/60 hover:bg-white/5'
                      }`}
                    >
                      <div
                        className={`mt-1 ${selectedTemplate === template.id ? 'text-emerald-400' : 'text-studio-muted'}`}
                      >
                        {template.icon}
                      </div>
                      <div className="flex-1">
                        <h4 className="text-base font-semibold text-studio-text mb-1">
                          {template.name}
                        </h4>
                        <p className="text-sm text-studio-muted mb-3">{template.description}</p>
                        <div className="flex gap-2">
                          {template.tags.map((tag) => (
                            <span
                              key={tag}
                              className="inline-flex items-center rounded-md bg-white/5 border border-studio-border px-2 py-0.5 text-[10px] text-studio-muted"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                      {selectedTemplate === template.id && (
                        <Check className="absolute top-5 right-5 h-5 w-5 text-emerald-400" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Step 2: Deploy ── */}
            {step === 2 && (
              <div className="flex flex-col items-center gap-6 py-8">
                <div className="rounded-full bg-indigo-500/10 p-6">
                  <Rocket className="h-12 w-12 text-indigo-400" />
                </div>

                <div className="text-center max-w-md">
                  <h3 className="text-xl font-semibold text-studio-text mb-2">
                    Deploy Your Experience
                  </h3>
                  <p className="text-sm text-studio-muted">
                    We'll compile your scene and deploy it to a live web URL you can share with
                    anyone.
                  </p>
                </div>

                {/* Deployment Status */}
                {deployStatus === 'idle' && (
                  <button
                    onClick={handleDeploy}
                    disabled={!selectedTemplate}
                    className="flex items-center gap-2 rounded-lg bg-indigo-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition hover:bg-indigo-400 hover:scale-[1.02] active:scale-95 disabled:opacity-40"
                  >
                    <Rocket className="h-5 w-5" />
                    Deploy Now
                  </button>
                )}

                {deployStatus === 'deploying' && (
                  <div className="w-full max-w-md space-y-4">
                    <div className="flex items-center gap-3 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-6 py-4">
                      <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
                      <span className="text-sm font-medium text-indigo-400">
                        Deploying your experience...
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full">
                      <div className="mb-2 flex justify-between text-xs text-studio-muted">
                        <span>Building</span>
                        <span>{deployProgress}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-black/30 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-indigo-500 to-indigo-400 transition-all duration-300"
                          style={{ width: `${deployProgress}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {deployStatus === 'success' && deploymentUrl && (
                  <div className="w-full max-w-md space-y-4">
                    <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-6 py-4">
                      <Check className="h-5 w-5 text-emerald-400" />
                      <span className="text-sm font-medium text-emerald-400">
                        Deployed Successfully!
                      </span>
                    </div>

                    <div className="rounded-lg border border-studio-border bg-black/30 p-4">
                      <p className="text-xs font-medium text-studio-muted mb-2">
                        Your experience is live at:
                      </p>
                      <a
                        href={deploymentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300 break-all"
                      >
                        {deploymentUrl}
                        <ExternalLink className="h-4 w-4 shrink-0" />
                      </a>
                    </div>
                  </div>
                )}

                {deployStatus === 'error' && (
                  <div className="w-full max-w-md space-y-4">
                    <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-6 py-4">
                      <AlertCircle className="h-5 w-5 shrink-0 text-red-400 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-red-400">Deployment Failed</p>
                        <p className="text-xs text-red-400/70 mt-1">{deployError}</p>
                      </div>
                    </div>

                    <button
                      onClick={handleDeploy}
                      className="w-full rounded-lg bg-indigo-500/20 px-4 py-2 text-sm font-medium text-indigo-300 transition hover:bg-indigo-500/30"
                    >
                      Try Again
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── Step 3: Completion ── */}
            {step === 3 && (
              <div className="flex flex-col items-center gap-6 py-8">
                <div className="rounded-full bg-emerald-500/10 p-6">
                  <Sparkles className="h-12 w-12 text-emerald-400" />
                </div>

                <div className="text-center max-w-md">
                  <h3 className="text-xl font-semibold text-studio-text mb-2">You're All Set!</h3>
                  <p className="text-sm text-studio-muted mb-6">
                    Your HoloScript Studio is ready. Start creating immersive 3D experiences with
                    just a few lines of code.
                  </p>
                </div>

                {deploymentUrl && (
                  <div className="w-full max-w-md space-y-3">
                    <div className="rounded-lg border border-studio-border bg-black/30 p-4">
                      <p className="text-xs font-medium text-studio-muted mb-2">
                        Your deployed experience:
                      </p>
                      <a
                        href={deploymentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 rounded-lg bg-indigo-500/20 px-4 py-3 text-sm font-medium text-indigo-300 transition hover:bg-indigo-500/30"
                      >
                        <Globe className="h-4 w-4" />
                        Visit Your Experience
                        <ExternalLink className="h-4 w-4 ml-auto" />
                      </a>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-3 w-full max-w-md text-center">
                  <div className="rounded-lg border border-studio-border bg-black/20 p-3">
                    <p className="text-2xl mb-1">📝</p>
                    <p className="text-xs text-studio-muted">Write HoloScript</p>
                  </div>
                  <div className="rounded-lg border border-studio-border bg-black/20 p-3">
                    <p className="text-2xl mb-1">👁️</p>
                    <p className="text-xs text-studio-muted">Preview Live</p>
                  </div>
                  <div className="rounded-lg border border-studio-border bg-black/20 p-3">
                    <p className="text-2xl mb-1">🚀</p>
                    <p className="text-xs text-studio-muted">Deploy Instantly</p>
                  </div>
                </div>

                <button
                  onClick={handleComplete}
                  className="flex items-center gap-2 rounded-lg bg-emerald-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400 hover:scale-[1.02] active:scale-95"
                >
                  <Sparkles className="h-5 w-5" />
                  Start Creating
                </button>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-studio-border px-6 py-4">
            <button
              onClick={() => (step > 0 ? goToStep((step - 1) as WizardStep) : handleSkip())}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-studio-muted transition hover:text-studio-text"
            >
              {step === 0 ? (
                <>Skip</>
              ) : (
                <>
                  <ChevronLeft className="h-4 w-4" />
                  Back
                </>
              )}
            </button>

            <div className="flex items-center gap-2">
              <button
                onClick={handleSkip}
                className="rounded-lg px-3 py-1.5 text-sm text-studio-muted transition hover:text-studio-text"
              >
                Skip
              </button>

              {step < TOTAL_STEPS - 1 ? (
                <button
                  onClick={() => goToStep((step + 1) as WizardStep)}
                  disabled={!canNext}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-500/20 px-4 py-1.5 text-sm font-medium text-emerald-400 transition hover:bg-emerald-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  onClick={handleComplete}
                  className="flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-1.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400 hover:scale-[1.02] active:scale-95"
                >
                  <Sparkles className="h-4 w-4" />
                  Finish
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* GitHub OAuth Modal */}
      {showGitHubModal && (
        <GitHubOAuthModal
          onSuccess={handleGitHubSuccess}
          onClose={() => setShowGitHubModal(false)}
        />
      )}
    </>
  );
}
