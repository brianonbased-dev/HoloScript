/**
 * Absorb Pipeline Bridge — Connects absorb completion to recursive pipeline.
 *
 * Enables the workflow: Import repo → Absorb patterns → Auto-trigger pipeline
 * → L0 fixes code → L1 optimizes strategy → L2 generates skills.
 *
 * Part of Studio Integration Hub (W.171, P.STUDIO.02).
 */

import type { PipelineMode } from './pipeline/types';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AbsorbCompletionEvent {
  projectPath: string;
  stats: {
    filesProcessed: number;
    patternsDetected: number;
    technologiesFound: string[];
    confidence: number;
  };
}

export interface PipelineTriggerConfig {
  mode: PipelineMode;
  targetProject: string;
  autoStart: boolean;
  notifyOnComplete: boolean;
}

// ─── Default Configs ─────────────────────────────────────────────────────────

export const DEFAULT_PIPELINE_CONFIG: PipelineTriggerConfig = {
  mode: 'continuous',
  targetProject: '',
  autoStart: false,
  notifyOnComplete: true,
};

/** projectPath -> last POST timestamp — avoids duplicate pipeline POSTs in rapid absorb cycles. */
const recentPipelineTriggers = new Map<string, number>();
const PIPELINE_TRIGGER_DEDUP_MS = 5000;

// ─── Bridge Functions ────────────────────────────────────────────────────────

/**
 * Called when absorb completes. Optionally triggers the recursive pipeline
 * based on user preferences.
 */
export async function onAbsorbComplete(
  event: AbsorbCompletionEvent,
  config: PipelineTriggerConfig
): Promise<{ success: boolean; pipelineId?: string; error?: string }> {
  // Skip if auto-start disabled
  if (!config.autoStart) {
    return { success: true };
  }

  const target = config.targetProject || event.projectPath;
  const now = Date.now();
  const last = recentPipelineTriggers.get(target) ?? 0;
  if (now - last < PIPELINE_TRIGGER_DEDUP_MS) {
    return { success: true, pipelineId: undefined };
  }
  recentPipelineTriggers.set(target, now);

  try {
    // Start pipeline
    const response = await fetch('/api/pipeline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: config.mode,
        targetProject: config.targetProject || event.projectPath,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: response.statusText }));
      return {
        success: false,
        error: errorData.error || `HTTP ${response.status}`,
      };
    }

    const data = await response.json();

    // Optionally show notification
    if (config.notifyOnComplete && typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification('Pipeline Started', {
          body: `Recursive improvement started on ${event.projectPath}`,
          icon: '/holoscript-icon.png',
        });
      }
    }

    return {
      success: true,
      pipelineId: data.id,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Analyzes absorb stats to recommend pipeline configuration.
 */
export function recommendPipelineConfig(
  event: AbsorbCompletionEvent
): Partial<PipelineTriggerConfig> {
  const { stats } = event;

  // High confidence + many patterns → continuous mode
  if (stats.confidence > 0.8 && stats.patternsDetected > 50) {
    return {
      mode: 'continuous',
      autoStart: true,
    };
  }

  // Medium confidence → single pass first
  if (stats.confidence > 0.5) {
    return {
      mode: 'single',
      autoStart: false, // Let user review first
    };
  }

  // Low confidence → manual only
  return {
    mode: 'single',
    autoStart: false,
  };
}

/**
 * Stores absorb → pipeline bridge config in localStorage.
 */
export function saveBridgeConfig(config: Partial<PipelineTriggerConfig>): void {
  if (typeof window === 'undefined') return;
  try {
    const stored = getBridgeConfig();
    const merged = { ...stored, ...config };
    localStorage.setItem('holoscript-absorb-pipeline-bridge', JSON.stringify(merged));
  } catch (err) {
    console.warn('[AbsorbPipelineBridge] Failed to save config:', err);
  }
}

/**
 * Retrieves stored bridge config from localStorage.
 */
export function getBridgeConfig(): PipelineTriggerConfig {
  if (typeof window === 'undefined') return DEFAULT_PIPELINE_CONFIG;
  try {
    const stored = localStorage.getItem('holoscript-absorb-pipeline-bridge');
    if (!stored) return DEFAULT_PIPELINE_CONFIG;
    return { ...DEFAULT_PIPELINE_CONFIG, ...JSON.parse(stored) };
  } catch {
    return DEFAULT_PIPELINE_CONFIG;
  }
}

/**
 * Generates a summary of what the pipeline will do based on absorb results.
 */
export function generatePipelineSummary(
  event: AbsorbCompletionEvent,
  config: PipelineTriggerConfig
): string {
  const { stats } = event;
  const parts: string[] = [];

  parts.push(`Analyzed ${stats.filesProcessed} files`);
  parts.push(`Detected ${stats.patternsDetected} patterns`);

  if (stats.technologiesFound.length > 0) {
    parts.push(`Found: ${stats.technologiesFound.slice(0, 3).join(', ')}`);
  }

  if (config.mode === 'continuous') {
    parts.push('→ Continuous improvement mode');
  } else if (config.mode === 'single') {
    parts.push('→ Single-pass improvement');
  } else {
    parts.push('→ Self-target mode (improving HoloScript)');
  }

  return parts.join(' • ');
}
