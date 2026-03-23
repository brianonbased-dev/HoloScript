'use client';

/**
 * Deployment Pipeline Demo Page
 *
 * Interactive demo of the DeploymentPipelineUI component.
 * Navigate to /deployment-demo in HoloScript Studio to see it in action.
 */

import React, { useState } from 'react';
import { DeploymentPipelineUI } from '@/components/DeploymentPipelineUI';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function DeploymentDemoPage() {
  const [sourceCode, setSourceCode] = useState(`object Cube {
  @position: [0, 1, 0]
  @rotation: [0, 45, 0]
  @scale: [1, 1, 1]
  @material: "metallic"
  @physics: { mass: 10, friction: 0.5 }
}`);

  const [lastDeployment, setLastDeployment] = useState<{
    tier: string;
    timestamp: Date;
    success: boolean;
  } | null>(null);

  const handleDeployStart = (tier: string) => {
    console.log(`[Demo] Deployment started with tier: ${tier}`);
  };

  const handleDeployComplete = (success: boolean) => {
    setLastDeployment({
      tier: 'unknown',
      timestamp: new Date(),
      success,
    });
    console.log(`[Demo] Deployment ${success ? 'succeeded' : 'failed'}`);
  };

  const handleRollback = async () => {
    console.log('[Demo] Rollback initiated');
    // Simulate rollback delay
    await new Promise((resolve) => setTimeout(resolve, 1000));
    console.log('[Demo] Rollback complete');
  };

  return (
    <div className="min-h-screen bg-studio-bg text-studio-text flex flex-col">
      {/* Header */}
      <header className="bg-studio-surface border-b border-studio-border p-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-2 text-studio-muted hover:text-studio-text transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="text-sm">Back to Studio</span>
            </Link>
            <div className="h-4 w-px bg-studio-border" />
            <h1 className="text-xl font-bold">Deployment Pipeline Demo</h1>
          </div>

          {lastDeployment && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-studio-muted">Last deployment:</span>
              <span
                className={`font-medium ${
                  lastDeployment.success ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                {lastDeployment.success ? 'Success' : 'Failed'}
              </span>
              <span className="text-studio-muted">•</span>
              <span className="text-studio-muted">
                {lastDeployment.timestamp.toLocaleTimeString()}
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex flex-col lg:flex-row gap-4 p-4 max-w-7xl mx-auto w-full">
        {/* Source Editor */}
        <div className="lg:w-1/3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">HoloScript Source</h2>
            <span className="text-xs text-studio-muted">{sourceCode.length} chars</span>
          </div>
          <textarea
            value={sourceCode}
            onChange={(e) => setSourceCode(e.target.value)}
            className="flex-1 min-h-[300px] bg-studio-panel border border-studio-border rounded-lg p-3 font-mono text-xs text-studio-text resize-none focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            placeholder="Enter HoloScript code here..."
            spellCheck={false}
          />
          <div className="bg-studio-panel border border-studio-border rounded-lg p-3">
            <h3 className="text-xs font-semibold mb-2">Instructions</h3>
            <ul className="text-xs text-studio-muted space-y-1 list-disc list-inside">
              <li>Edit the source code in this panel</li>
              <li>Select a quality tier (low, med, high, ultra)</li>
              <li>Click &quot;Deploy&quot; to run the pipeline</li>
              <li>Watch real-time progress in the pipeline view</li>
              <li>Expand logs to see detailed output</li>
              <li>Test rollback functionality</li>
            </ul>
          </div>
        </div>

        {/* Pipeline UI */}
        <div className="lg:w-2/3 flex flex-col border border-studio-border rounded-lg overflow-hidden">
          <DeploymentPipelineUI
            source={sourceCode}
            onDeployStart={handleDeployStart}
            onDeployComplete={handleDeployComplete}
            onRollback={handleRollback}
          />
        </div>
      </div>
    </div>
  );
}
