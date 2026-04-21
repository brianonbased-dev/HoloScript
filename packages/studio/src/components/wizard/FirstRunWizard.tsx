/**
 * FirstRunWizard.tsx - New user onboarding: GitHub → Composition → Deploy → Live URL
 *
 * 4-step guided workflow:
 * 1. GitHub OAuth connection
 * 2. Select starter composition
 * 3. Deploy to Railway
 * 4. Display live URL
 *
 * Target: Complete flow in ~5 minutes
 */

'use client';

import React, { useState, useEffect } from 'react';
import { ChevronRight, CheckCircle2, Loader2 } from 'lucide-react';
import AnimatedStep from './AnimatedStep';
import GitHubOAuthModal from '../integrations/GitHubOAuthModal';

interface Composition {
  id: string;
  name: string;
  emoji: string;
  description: string;
  panels: string[];
  tools: string[];
}

const STARTER_COMPOSITIONS: Composition[] = [
  {
    id: 'dashboard',
    name: 'Analytics Dashboard',
    emoji: '📊',
    description: 'Real-time metrics with stat cards, charts, and data grid',
    panels: ['Stats', 'Charts', 'Data Grid', 'Filters'],
    tools: ['Export', 'Refresh', 'Settings'],
  },
  {
    id: 'canvas',
    name: '3D Canvas',
    emoji: '🎨',
    description: 'Interactive 3D scene with objects, lighting, and controls',
    panels: ['Scene', 'Properties', 'Hierarchy', 'Inspector'],
    tools: ['Play', 'Record', 'Export'],
  },
  {
    id: 'robot',
    name: 'Robot Simulator',
    emoji: '🤖',
    description: 'Mechanical arm with joint controls and trajectory planning',
    panels: ['Arm Control', 'Joint Inspector', 'Trajectory', 'Physics'],
    tools: ['Record Motion', 'Play', 'Export Path'],
  },
  {
    id: 'world',
    name: 'VR World Builder',
    emoji: '🌍',
    description: 'Spatial environment with multiple zones and interactive objects',
    panels: ['World Map', 'Objects', 'Physics', 'Spawn Points'],
    tools: ['Build', 'Test', 'Publish'],
  },
];

type WizardStep = 'github' | 'composition' | 'deploy' | 'success';

interface FirstRunWizardProps {
  onComplete?: (data: { githubToken: string; compositionId: string; liveUrl: string }) => void;
}

export default function FirstRunWizard({ onComplete }: FirstRunWizardProps) {
  const [step, setStep] = useState<WizardStep>('github');
  const [githubToken, setGithubToken] = useState<string>('');
  const [selectedComposition, setSelectedComposition] = useState<string>('');
  const [deploymentUrl, setDeploymentUrl] = useState<string>('');
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployError, setDeployError] = useState<string>('');

  const handleGitHubSuccess = (token: string) => {
    setGithubToken(token);
    setStep('composition');
  };

  const handleCompositionSelect = (compositionId: string) => {
    setSelectedComposition(compositionId);
    setStep('deploy');
  };

  const handleDeploy = async () => {
    setIsDeploying(true);
    setDeployError('');

    try {
      // Call deployment endpoint
      const response = await fetch('/api/connectors/railway/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          compositionId: selectedComposition,
          githubToken,
        }),
      });

      if (!response.ok) {
        throw new Error('Deployment failed');
      }

      const data = await response.json();
      setDeploymentUrl(data.liveUrl);
      setStep('success');

      if (onComplete) {
        onComplete({
          githubToken,
          compositionId: selectedComposition,
          liveUrl: data.liveUrl,
        });
      }
    } catch (error) {
      setDeployError(error instanceof Error ? error.message : 'Deployment failed');
    } finally {
      setIsDeploying(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-studio-panel via-black to-studio-panel">
      {/* Header */}
      <div className="border-b border-studio-border bg-studio-panel/80 backdrop-blur-sm">
        <div className="mx-auto max-w-2xl px-6 py-8">
          <h1 className="text-3xl font-bold text-studio-text">Welcome to HoloScript Studio</h1>
          <p className="mt-2 text-sm text-studio-muted">
            Let's get you set up in 5 minutes: GitHub → Composition → Deploy → Live
          </p>
        </div>
      </div>

      {/* Steps Progress */}
      <div className="border-b border-studio-border bg-studio-panel/40">
        <div className="mx-auto max-w-2xl px-6 py-4">
          <div className="flex items-center gap-2">
            {['github', 'composition', 'deploy', 'success'].map((s, i, arr) => (
              <React.Fragment key={s}>
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-all ${
                    s === step
                      ? 'bg-studio-accent text-black'
                      : ['github', 'composition', 'deploy'].includes(s) && arr.indexOf(step) > i
                        ? 'bg-green-500/30 text-green-300'
                        : 'bg-studio-border text-studio-muted'
                  }`}
                >
                  {i + 1}
                </div>
                {i < arr.length - 1 && (
                  <div
                    className={`h-1 flex-1 rounded-full transition-all ${
                      ['github', 'composition', 'deploy'].includes(s) && arr.indexOf(step) > i
                        ? 'bg-green-500/30'
                        : 'bg-studio-border'
                    }`}
                  />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-2xl px-6 py-8">
        {/* Step 1: GitHub OAuth */}
        {step === 'github' && (
          <AnimatedStep>
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-studio-text">Connect GitHub</h2>
                <p className="mt-1 text-sm text-studio-muted">
                  Authenticate with GitHub to enable deployment and version control
                </p>
              </div>
              <GitHubOAuthModal onSuccess={handleGitHubSuccess} />
            </div>
          </AnimatedStep>
        )}

        {/* Step 2: Composition Selection */}
        {step === 'composition' && (
          <AnimatedStep>
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-studio-text">Choose a Starter</h2>
                <p className="mt-1 text-sm text-studio-muted">
                  Select a pre-built composition to customize and deploy
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {STARTER_COMPOSITIONS.map((comp) => (
                  <button
                    key={comp.id}
                    onClick={() => handleCompositionSelect(comp.id)}
                    className={`rounded-xl border-2 p-4 text-left transition-all ${
                      selectedComposition === comp.id
                        ? 'border-studio-accent bg-studio-accent/10'
                        : 'border-studio-border bg-studio-panel/40 hover:border-studio-accent/50'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="flex items-center gap-2 text-lg font-semibold text-studio-text">
                          <span className="text-2xl">{comp.emoji}</span>
                          {comp.name}
                        </p>
                        <p className="mt-1 text-sm text-studio-muted">{comp.description}</p>

                        <div className="mt-3 space-y-2">
                          <p className="text-xs font-medium text-studio-text/60">Panels:</p>
                          <div className="flex flex-wrap gap-1">
                            {comp.panels.map((panel) => (
                              <span
                                key={panel}
                                className="rounded bg-studio-border/50 px-2 py-1 text-xs text-studio-text/70"
                              >
                                {panel}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      {selectedComposition === comp.id && (
                        <CheckCircle2 className="h-5 w-5 text-studio-accent" />
                      )}
                    </div>
                  </button>
                ))}
              </div>

              <button
                onClick={() => setStep('deploy')}
                disabled={!selectedComposition}
                className="w-full rounded-lg bg-studio-accent px-6 py-3 font-semibold text-black transition-all hover:bg-studio-accent/90 disabled:bg-studio-border/30 disabled:text-studio-muted"
              >
                Continue to Deploy
                <ChevronRight className="ml-2 inline h-4 w-4" />
              </button>
            </div>
          </AnimatedStep>
        )}

        {/* Step 3: Deploy to Railway */}
        {step === 'deploy' && (
          <AnimatedStep>
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-studio-text">Deploy to Railway</h2>
                <p className="mt-1 text-sm text-studio-muted">
                  Your composition is being deployed to a live URL
                </p>
              </div>

              {/* Deployment Summary */}
              <div className="rounded-xl border border-studio-border bg-studio-panel/60 p-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-studio-muted">Composition</p>
                    <p className="font-semibold text-studio-text">
                      {STARTER_COMPOSITIONS.find((c) => c.id === selectedComposition)?.name}
                    </p>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-studio-muted">GitHub</p>
                    <p className="font-semibold text-studio-text">Connected ✓</p>
                  </div>
                </div>
              </div>

              {/* Error Display */}
              {deployError && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                  <p className="text-sm text-red-400">{deployError}</p>
                </div>
              )}

              {/* Deploy Button */}
              <button
                onClick={handleDeploy}
                disabled={isDeploying}
                className="w-full rounded-lg bg-green-600/80 px-6 py-3 font-semibold text-white transition-all hover:bg-green-600 disabled:bg-studio-border/30 disabled:text-studio-muted"
              >
                {isDeploying ? (
                  <>
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                    Deploying...
                  </>
                ) : (
                  <>
                    Deploy Now
                    <ChevronRight className="ml-2 inline h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </AnimatedStep>
        )}

        {/* Step 4: Success */}
        {step === 'success' && (
          <AnimatedStep>
            <div className="space-y-6">
              <div className="text-center">
                <div className="mx-auto mb-4 inline-block rounded-full bg-green-500/10 p-3">
                  <CheckCircle2 className="h-8 w-8 text-green-400" />
                </div>
                <h2 className="text-2xl font-bold text-studio-text">All Set! 🚀</h2>
                <p className="mt-2 text-sm text-studio-muted">Your composition is now live</p>
              </div>

              {/* Live URL Display */}
              <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-6">
                <p className="mb-2 text-xs font-semibold text-green-300">LIVE URL</p>
                <a
                  href={deploymentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all font-mono text-sm text-green-400 hover:text-green-300"
                >
                  {deploymentUrl}
                </a>
              </div>

              {/* Next Actions */}
              <div className="space-y-2">
                <button
                  onClick={() => window.open(deploymentUrl, '_blank')}
                  className="w-full rounded-lg bg-studio-accent px-6 py-3 font-semibold text-black transition-all hover:bg-studio-accent/90"
                >
                  Open Live Preview
                </button>
                <button
                  onClick={() => window.location.reload()}
                  className="w-full rounded-lg border border-studio-border bg-transparent px-6 py-3 font-semibold text-studio-text transition-all hover:bg-studio-panel/60"
                >
                  Continue to Dashboard
                </button>
              </div>

              {/* Quick Tips */}
              <div className="rounded-lg bg-studio-panel/40 p-4">
                <p className="mb-2 text-xs font-semibold text-studio-text/60">NEXT STEPS</p>
                <ul className="space-y-1 text-xs text-studio-muted">
                  <li>• Customize your composition in the editor</li>
                  <li>• Deploy updates with git push</li>
                  <li>• Share your live URL with collaborators</li>
                </ul>
              </div>
            </div>
          </AnimatedStep>
        )}
      </div>
    </div>
  );
}
