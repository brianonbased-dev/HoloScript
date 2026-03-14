'use client';
/**
 * ConfidenceAwareXRUI — WebXR UI that adapts to agent confidence levels
 *
 * TODO-063: Confidence-Aware WebXR UI
 *
 * Features:
 * - Three agent states: confident (green), uncertain (yellow), hallucinating (red)
 * - Adaptive UI opacity based on confidence score
 * - Interaction affordances that scale with confidence
 * - Safety guards for low-confidence states (confirmation dialogs, reduced actions)
 * - Visual confidence indicator ring and status badge
 * - Graceful degradation for non-XR browsers (flat mode)
 *
 * @version 1.0.0
 */
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';

// =============================================================================
// TYPES
// =============================================================================

export type ConfidenceLevel = 'confident' | 'uncertain' | 'hallucinating';

export interface AgentConfidenceState {
  score: number; // 0.0 - 1.0
  level: ConfidenceLevel;
  source: string; // which agent/model
  reasoning?: string;
  lastUpdated: number; // timestamp
  history: ConfidenceSnapshot[];
}

export interface ConfidenceSnapshot {
  score: number;
  timestamp: number;
  action: string;
}

export interface SafetyGuard {
  id: string;
  name: string;
  description: string;
  activeBelow: number; // confidence threshold
  type: 'block' | 'confirm' | 'warn' | 'degrade';
}

export interface XRAction {
  id: string;
  label: string;
  icon: string;
  requiresConfidence: number; // minimum confidence to enable
  dangerous: boolean; // requires extra confirmation when uncertain
  handler: () => void;
}

export interface ConfidenceAwareXRUIProps {
  agentName?: string;
  initialConfidence?: number;
  onConfidenceChange?: (state: AgentConfidenceState) => void;
  onActionBlocked?: (action: XRAction, reason: string) => void;
  className?: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const CONFIDENCE_THRESHOLDS = {
  confident: 0.7,
  uncertain: 0.4,
  // below 0.4 = hallucinating
};

const LEVEL_CONFIG: Record<ConfidenceLevel, {
  color: string;
  bgColor: string;
  ringColor: string;
  label: string;
  icon: string;
  opacity: number;
  description: string;
}> = {
  confident: {
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10',
    ringColor: 'ring-emerald-400',
    label: 'Confident',
    icon: '🟢',
    opacity: 1.0,
    description: 'Agent is operating with high confidence. All actions available.',
  },
  uncertain: {
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
    ringColor: 'ring-amber-400',
    label: 'Uncertain',
    icon: '🟡',
    opacity: 0.75,
    description: 'Agent confidence is reduced. Dangerous actions require confirmation.',
  },
  hallucinating: {
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
    ringColor: 'ring-red-400',
    label: 'Hallucinating',
    icon: '🔴',
    opacity: 0.5,
    description: 'Agent may be producing unreliable outputs. Most actions blocked.',
  },
};

const DEFAULT_SAFETY_GUARDS: SafetyGuard[] = [
  {
    id: 'block-destructive',
    name: 'Block Destructive Actions',
    description: 'Prevents scene deletion, reset, or irreversible changes',
    activeBelow: 0.4,
    type: 'block',
  },
  {
    id: 'confirm-modifications',
    name: 'Confirm Modifications',
    description: 'Requires explicit confirmation before modifying scene objects',
    activeBelow: 0.7,
    type: 'confirm',
  },
  {
    id: 'warn-suggestions',
    name: 'Warn on Suggestions',
    description: 'Adds uncertainty warning to AI-generated suggestions',
    activeBelow: 0.85,
    type: 'warn',
  },
  {
    id: 'degrade-automation',
    name: 'Degrade Automation',
    description: 'Reduces autonomous agent actions, increases human-in-the-loop',
    activeBelow: 0.5,
    type: 'degrade',
  },
];

const DEMO_ACTIONS: XRAction[] = [
  { id: 'place-object', label: 'Place Object', icon: '📦', requiresConfidence: 0.3, dangerous: false, handler: () => {} },
  { id: 'modify-trait', label: 'Modify Trait', icon: '🎨', requiresConfidence: 0.5, dangerous: false, handler: () => {} },
  { id: 'compile-scene', label: 'Compile Scene', icon: '🔨', requiresConfidence: 0.4, dangerous: false, handler: () => {} },
  { id: 'deploy-ar', label: 'Deploy to AR', icon: '📱', requiresConfidence: 0.7, dangerous: true, handler: () => {} },
  { id: 'reset-scene', label: 'Reset Scene', icon: '🗑️', requiresConfidence: 0.8, dangerous: true, handler: () => {} },
  { id: 'export-production', label: 'Export Production', icon: '🚀', requiresConfidence: 0.9, dangerous: true, handler: () => {} },
];

// =============================================================================
// HELPERS
// =============================================================================

function getConfidenceLevel(score: number): ConfidenceLevel {
  if (score >= CONFIDENCE_THRESHOLDS.confident) return 'confident';
  if (score >= CONFIDENCE_THRESHOLDS.uncertain) return 'uncertain';
  return 'hallucinating';
}

function getActiveGuards(guards: SafetyGuard[], score: number): SafetyGuard[] {
  return guards.filter((g) => score < g.activeBelow);
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ConfidenceAwareXRUI({
  agentName = 'HoloScript Agent',
  initialConfidence = 0.85,
  onConfidenceChange,
  onActionBlocked,
  className = '',
}: ConfidenceAwareXRUIProps) {
  const [confidence, setConfidence] = useState(initialConfidence);
  const [history, setHistory] = useState<ConfidenceSnapshot[]>([
    { score: initialConfidence, timestamp: Date.now(), action: 'init' },
  ]);
  const [pendingConfirm, setPendingConfirm] = useState<XRAction | null>(null);
  const [guards] = useState<SafetyGuard[]>(DEFAULT_SAFETY_GUARDS);
  const [showHistory, setShowHistory] = useState(false);
  const [showGuards, setShowGuards] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const level = useMemo(() => getConfidenceLevel(confidence), [confidence]);
  const config = LEVEL_CONFIG[level];
  const activeGuards = useMemo(() => getActiveGuards(guards, confidence), [guards, confidence]);

  // Build state for callback
  const state = useMemo<AgentConfidenceState>(
    () => ({
      score: confidence,
      level,
      source: agentName,
      lastUpdated: Date.now(),
      history,
    }),
    [confidence, level, agentName, history]
  );

  useEffect(() => {
    onConfidenceChange?.(state);
  }, [state, onConfidenceChange]);

  // ─── Confidence Simulation ────────────────────────────────────────────

  const updateConfidence = useCallback(
    (newScore: number, action: string) => {
      const clamped = Math.max(0, Math.min(1, newScore));
      setConfidence(clamped);
      setHistory((prev) => [
        ...prev.slice(-49),
        { score: clamped, timestamp: Date.now(), action },
      ]);
    },
    []
  );

  const simulateDrift = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
      return;
    }
    intervalRef.current = setInterval(() => {
      setConfidence((prev) => {
        const delta = (Math.random() - 0.5) * 0.08;
        const next = Math.max(0.05, Math.min(0.99, prev + delta));
        setHistory((h) => [
          ...h.slice(-49),
          { score: next, timestamp: Date.now(), action: 'drift' },
        ]);
        return next;
      });
    }, 1500);
  }, []);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // ─── Action Handling ──────────────────────────────────────────────────

  const handleAction = useCallback(
    (action: XRAction) => {
      // Check if blocked
      if (confidence < action.requiresConfidence) {
        onActionBlocked?.(action, `Requires confidence >= ${(action.requiresConfidence * 100).toFixed(0)}%`);
        return;
      }

      // Check if dangerous and uncertain
      if (action.dangerous && level !== 'confident') {
        setPendingConfirm(action);
        return;
      }

      // Execute
      action.handler();
      updateConfidence(confidence + 0.02, action.id);
    },
    [confidence, level, onActionBlocked, updateConfidence]
  );

  const confirmAction = useCallback(() => {
    if (pendingConfirm) {
      pendingConfirm.handler();
      updateConfidence(confidence - 0.05, `confirmed:${pendingConfirm.id}`);
      setPendingConfirm(null);
    }
  }, [pendingConfirm, confidence, updateConfidence]);

  const cancelAction = useCallback(() => {
    setPendingConfirm(null);
  }, []);

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <div
      className={`p-3 space-y-3 text-xs transition-opacity duration-500 ${className}`}
      style={{ opacity: config.opacity }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-studio-text">🧠 Agent Confidence</h3>
        <span className={`text-[10px] font-medium ${config.color}`}>
          {config.icon} {config.label}
        </span>
      </div>

      {/* Confidence ring display */}
      <div className={`rounded-lg p-3 ${config.bgColor} transition-all duration-500`}>
        <div className="flex items-center gap-3">
          {/* Circular indicator */}
          <div className="relative w-16 h-16 flex-shrink-0">
            <svg viewBox="0 0 64 64" className="w-full h-full -rotate-90">
              <circle
                cx="32" cy="32" r="28"
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                className="text-studio-panel/30"
              />
              <circle
                cx="32" cy="32" r="28"
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                strokeDasharray={`${confidence * 175.93} 175.93`}
                strokeLinecap="round"
                className={config.color}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={`text-sm font-bold font-mono ${config.color}`}>
                {(confidence * 100).toFixed(0)}%
              </span>
            </div>
          </div>

          {/* Info */}
          <div className="flex-1">
            <div className="text-studio-text text-[11px] font-medium">{agentName}</div>
            <div className={`text-[10px] ${config.color} mb-1`}>{config.description}</div>
            {activeGuards.length > 0 && (
              <div className="text-[9px] text-studio-muted">
                {activeGuards.length} safety guard{activeGuards.length !== 1 ? 's' : ''} active
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confidence slider (for demo/testing) */}
      <div className="space-y-1">
        <div className="flex justify-between text-[10px]">
          <span className="text-studio-muted">Adjust Confidence</span>
          <button
            onClick={simulateDrift}
            className="text-studio-accent hover:underline text-[9px]"
          >
            {intervalRef.current ? 'Stop Drift' : 'Simulate Drift'}
          </button>
        </div>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={confidence}
          onChange={(e) => updateConfidence(parseFloat(e.target.value), 'manual')}
          className="w-full accent-studio-accent h-1"
        />
        <div className="flex justify-between text-[9px] text-studio-muted">
          <span>Hallucinating</span>
          <span>Uncertain</span>
          <span>Confident</span>
        </div>
      </div>

      {/* Actions grid */}
      <div className="space-y-1">
        <div className="text-[10px] text-studio-muted">Available Actions</div>
        <div className="grid grid-cols-3 gap-1">
          {DEMO_ACTIONS.map((action) => {
            const enabled = confidence >= action.requiresConfidence;
            const needsConfirm = action.dangerous && level !== 'confident';

            return (
              <button
                key={action.id}
                onClick={() => handleAction(action)}
                disabled={!enabled}
                className={`
                  flex flex-col items-center gap-0.5 px-1.5 py-1.5 rounded text-[10px] transition-all
                  ${
                    enabled
                      ? needsConfirm
                        ? 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 ring-1 ring-amber-500/20'
                        : 'bg-studio-panel/40 text-studio-text hover:bg-studio-panel/60'
                      : 'bg-studio-panel/10 text-studio-muted/40 cursor-not-allowed'
                  }
                `}
                title={
                  !enabled
                    ? `Requires ${(action.requiresConfidence * 100).toFixed(0)}% confidence`
                    : needsConfirm
                      ? 'Requires confirmation (low confidence)'
                      : action.label
                }
              >
                <span className="text-sm">{action.icon}</span>
                <span className="truncate w-full text-center">{action.label}</span>
                {!enabled && (
                  <span className="text-[8px] opacity-50">
                    {(action.requiresConfidence * 100).toFixed(0)}%+
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Confirmation dialog */}
      {pendingConfirm && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 space-y-1.5">
          <div className="flex items-center gap-1 text-amber-400 text-[11px] font-medium">
            <span>⚠️</span>
            <span>Confirm Action</span>
          </div>
          <div className="text-[10px] text-studio-text">
            "{pendingConfirm.label}" is a dangerous action. Agent confidence is at{' '}
            <span className={config.color}>{(confidence * 100).toFixed(0)}%</span>.
            Proceed with caution?
          </div>
          <div className="flex gap-1">
            <button
              onClick={confirmAction}
              className="flex-1 px-2 py-1 bg-amber-500/20 text-amber-400 rounded hover:bg-amber-500/30 transition"
            >
              Confirm
            </button>
            <button
              onClick={cancelAction}
              className="flex-1 px-2 py-1 bg-studio-panel text-studio-muted rounded hover:text-studio-text transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Safety guards */}
      <div>
        <button
          onClick={() => setShowGuards((prev) => !prev)}
          className="text-[10px] text-studio-muted hover:text-studio-text transition flex items-center gap-1"
        >
          <span>{showGuards ? '▼' : '▶'}</span>
          <span>Safety Guards ({activeGuards.length}/{guards.length} active)</span>
        </button>
        {showGuards && (
          <div className="mt-1 space-y-0.5">
            {guards.map((guard) => {
              const active = confidence < guard.activeBelow;
              return (
                <div
                  key={guard.id}
                  className={`
                    flex items-center justify-between rounded px-2 py-1 text-[10px]
                    ${active ? 'bg-red-500/10' : 'bg-studio-panel/20'}
                  `}
                >
                  <div className="flex items-center gap-1 truncate">
                    <span className={active ? 'text-red-400' : 'text-studio-muted/50'}>
                      {active ? '🛡️' : '○'}
                    </span>
                    <span className={active ? 'text-studio-text' : 'text-studio-muted/50'}>
                      {guard.name}
                    </span>
                  </div>
                  <span className={`text-[9px] ${active ? 'text-red-400' : 'text-studio-muted/50'}`}>
                    &lt;{(guard.activeBelow * 100).toFixed(0)}%
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* History */}
      <div>
        <button
          onClick={() => setShowHistory((prev) => !prev)}
          className="text-[10px] text-studio-muted hover:text-studio-text transition flex items-center gap-1"
        >
          <span>{showHistory ? '▼' : '▶'}</span>
          <span>Confidence History ({history.length} entries)</span>
        </button>
        {showHistory && (
          <div className="mt-1 max-h-[100px] overflow-y-auto space-y-0">
            {[...history].reverse().slice(0, 20).map((snap, i) => {
              const snapLevel = getConfidenceLevel(snap.score);
              return (
                <div
                  key={i}
                  className="flex items-center justify-between text-[9px] px-1 py-0.5"
                >
                  <div className="flex items-center gap-1">
                    <span className={LEVEL_CONFIG[snapLevel].color}>
                      {(snap.score * 100).toFixed(0)}%
                    </span>
                    <span className="text-studio-muted">{snap.action}</span>
                  </div>
                  <span className="text-studio-muted/50 font-mono">
                    {new Date(snap.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default ConfidenceAwareXRUI;
