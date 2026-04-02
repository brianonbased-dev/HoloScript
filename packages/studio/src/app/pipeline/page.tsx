'use client';

/**
 * Pipeline Dashboard — /pipeline
 *
 * Visual control surface for the recursive self-improvement pipeline.
 * Shows 3 layer cards stacked vertically (L2 top, L0 bottom) with
 * feedback arrows, mode selector, and start/stop controls.
 */

import React, { useState, useCallback } from 'react';
import Link from 'next/link';
import { usePipelineStore } from '@/lib/stores/pipelineStore';
import { usePipeline } from '@/hooks/usePipeline';
import { LayerCard } from '@/components/pipeline/LayerCard';
import { FeedbackTimeline } from '@/components/pipeline/FeedbackTimeline';
import { PipelineConfig } from '@/components/pipeline/PipelineConfig';
import type { PipelineMode, LayerId } from '@/lib/recursive';

export default function PipelinePage() {
  const [showConfig, setShowConfig] = useState(false);
  const [mode, setMode] = useState<PipelineMode>('single');
  const [targetProject, setTargetProject] = useState('self');

  const store = usePipelineStore();
  const { startPipeline, starting, error } = usePipeline();

  const pipeline = store.activePipeline;
  const isRunning = pipeline?.status === 'running';

  const handleStart = useCallback(async () => {
    const pipelineId = store.startPipeline(mode, targetProject);
    await startPipeline(mode, targetProject);
  }, [store, mode, targetProject, startPipeline]);

  const handleStop = useCallback(() => {
    store.stopPipeline();
  }, [store]);

  const handlePause = useCallback(() => {
    store.pausePipeline();
  }, [store]);

  const handleResume = useCallback(() => {
    store.resumePipeline();
  }, [store]);

  const handleApprove = useCallback(
    (layerId: LayerId) => {
      store.approveReview(layerId);
    },
    [store]
  );

  const handleReject = useCallback(
    (layerId: LayerId) => {
      store.rejectReview(layerId);
    },
    [store]
  );

  // Collect all feedback signals for the timeline
  const allFeedback = store.globalFeedback;

  return (
    <div className="min-h-screen bg-studio-bg text-studio-text">
      {/* Header */}
      <header className="border-b border-studio-border px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-studio-muted hover:text-studio-text text-sm">
              Studio
            </Link>
            <span className="text-studio-muted">/</span>
            <h1 className="text-lg font-semibold">Recursive Pipeline</h1>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/holodaemon"
              className="rounded-lg border border-studio-border px-3 py-1.5 text-xs text-studio-muted hover:text-studio-text hover:border-studio-accent/40 transition-colors"
            >
              Daemon
            </Link>
            <Link
              href="/holoclaw"
              className="rounded-lg border border-studio-border px-3 py-1.5 text-xs text-studio-muted hover:text-studio-text hover:border-studio-accent/40 transition-colors"
            >
              HoloClaw
            </Link>
            {/* Mode Selector */}
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as PipelineMode)}
              disabled={isRunning}
              className="px-3 py-1.5 text-sm bg-studio-panel border border-studio-border rounded text-studio-text"
            >
              <option value="single">Single Pass</option>
              <option value="continuous">Continuous</option>
              <option value="self-target">Self-Target</option>
            </select>

            {/* Config Button */}
            <button
              onClick={() => setShowConfig(true)}
              className="px-3 py-1.5 text-sm border border-studio-border rounded hover:bg-studio-panel transition-colors"
            >
              Configure
            </button>

            {/* Control Buttons */}
            {!isRunning ? (
              <button
                onClick={handleStart}
                disabled={starting}
                className="px-4 py-1.5 text-sm bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded transition-colors"
              >
                {starting ? 'Starting...' : 'Start Pipeline'}
              </button>
            ) : (
              <div className="flex gap-2">
                {pipeline?.status === 'paused' ? (
                  <button
                    onClick={handleResume}
                    className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                  >
                    Resume
                  </button>
                ) : (
                  <button
                    onClick={handlePause}
                    className="px-3 py-1.5 text-sm bg-yellow-600 hover:bg-yellow-700 text-white rounded transition-colors"
                  >
                    Pause
                  </button>
                )}
                <button
                  onClick={handleStop}
                  className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
                >
                  Stop
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Error display */}
        {error && (
          <div className="mt-2 text-sm text-red-400 bg-red-900/20 px-3 py-1.5 rounded">{error}</div>
        )}

        {/* Pipeline summary bar */}
        {pipeline && (
          <div className="mt-2 flex items-center gap-4 text-xs text-studio-muted">
            <span>
              Mode: <span className="text-studio-text">{pipeline.mode}</span>
            </span>
            <span>
              Target: <span className="text-studio-text">{pipeline.targetProject}</span>
            </span>
            <span>
              Cost: <span className="text-studio-text">${pipeline.totalCostUSD.toFixed(2)}</span>
            </span>
            <span>
              Duration:{' '}
              <span className="text-studio-text">
                {Math.round(pipeline.totalDurationMs / 1000)}s
              </span>
            </span>
            {pipeline.humanReviewsPending > 0 && (
              <span className="text-yellow-500 font-medium">
                {pipeline.humanReviewsPending} review{pipeline.humanReviewsPending > 1 ? 's' : ''}{' '}
                pending
              </span>
            )}
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto py-6 px-4 space-y-4">
        {/* Layer Stack (L2 on top, L0 on bottom) */}
        {pipeline ? (
          <>
            {/* L2: Meta-Strategist */}
            <LayerCard
              layerId={2}
              state={pipeline.layers[2]}
              onApprove={handleApprove}
              onReject={handleReject}
            />

            {/* Feedback arrow */}
            <div className="flex justify-center text-studio-muted text-lg">
              <span title="Feedback flows upward">&uarr; feedback</span>
            </div>

            {/* L1: Strategy Optimizer */}
            <LayerCard
              layerId={1}
              state={pipeline.layers[1]}
              onApprove={handleApprove}
              onReject={handleReject}
            />

            {/* Feedback arrow */}
            <div className="flex justify-center text-studio-muted text-lg">
              <span title="Feedback flows upward">&uarr; feedback</span>
            </div>

            {/* L0: Code Fixer */}
            <LayerCard
              layerId={0}
              state={pipeline.layers[0]}
              onApprove={handleApprove}
              onReject={handleReject}
            />
          </>
        ) : (
          <div className="text-center py-16">
            <div className="text-4xl mb-4">{'\uD83D\uDD04'}</div>
            <h2 className="text-xl font-semibold mb-2">Recursive Self-Improvement</h2>
            <p className="text-studio-muted max-w-md mx-auto mb-6">
              Layered agents that improve each other. L0 fixes code, L1 optimizes L0&apos;s
              strategy, L2 evolves L1 and generates new skills. Select a mode and start.
            </p>
            <div className="grid grid-cols-3 gap-4 max-w-lg mx-auto text-sm">
              <div className="bg-studio-panel border border-studio-border rounded-lg p-3">
                <div className="font-medium mb-1">Single</div>
                <div className="text-xs text-studio-muted">One L0&rarr;L1&rarr;L2 pass</div>
              </div>
              <div className="bg-studio-panel border border-studio-border rounded-lg p-3">
                <div className="font-medium mb-1">Continuous</div>
                <div className="text-xs text-studio-muted">Loop until budget exhausted</div>
              </div>
              <div className="bg-studio-panel border border-studio-border rounded-lg p-3">
                <div className="font-medium mb-1">Self-Target</div>
                <div className="text-xs text-studio-muted">HoloScript improves itself</div>
              </div>
            </div>
          </div>
        )}

        {/* Feedback Timeline */}
        <div className="border border-studio-border rounded-lg bg-studio-panel p-4">
          <h3 className="text-sm font-semibold text-studio-text mb-3">
            Feedback Flow ({allFeedback.length} signals)
          </h3>
          <FeedbackTimeline signals={allFeedback} />
        </div>

        {/* Pipeline History */}
        {store.pipelineHistory.length > 0 && (
          <div className="border border-studio-border rounded-lg bg-studio-panel p-4">
            <h3 className="text-sm font-semibold text-studio-text mb-3">
              History ({store.pipelineHistory.length} runs)
            </h3>
            <div className="space-y-2">
              {store.pipelineHistory.slice(0, 10).map((run) => (
                <div
                  key={run.id}
                  className="flex items-center justify-between text-xs text-studio-muted bg-studio-bg rounded p-2"
                >
                  <span className="font-mono">{run.id}</span>
                  <span>{run.mode}</span>
                  <span>${run.totalCostUSD.toFixed(2)}</span>
                  <span
                    className={
                      run.status === 'completed'
                        ? 'text-green-500'
                        : run.status === 'failed'
                          ? 'text-red-500'
                          : ''
                    }
                  >
                    {run.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Config Modal */}
      {showConfig && (
        <PipelineConfig
          configs={store.layerConfigs}
          onUpdate={store.updateLayerConfig}
          onReset={store.resetLayerConfigs}
          onClose={() => setShowConfig(false)}
        />
      )}
    </div>
  );
}
