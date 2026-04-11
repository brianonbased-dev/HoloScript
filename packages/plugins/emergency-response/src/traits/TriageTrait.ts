/**
 * @triage Trait — Mass Casualty Triage Classification
 *
 * Implements START (Simple Triage and Rapid Treatment) color coding:
 *   - Red (Immediate): life-threatening, treatable
 *   - Yellow (Delayed): serious but stable
 *   - Green (Minor): walking wounded
 *   - Black (Expectant): deceased or non-survivable
 *
 * Usage in .hsplus:
 * ```hsplus
 * @triage {
 *   priority: "red"
 *   patientCount: 12
 *   assessmentMethod: "START"
 * }
 * ```
 *
 * @trait triage
 * @category emergency-response
 * @version 1.0.0
 */

import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

// =============================================================================
// TYPES
// =============================================================================

export type TriagePriority = 'red' | 'yellow' | 'green' | 'black';

export type AssessmentMethod = 'START' | 'JumpSTART' | 'SALT' | 'SMART' | 'custom';

export interface TriageConfig {
  /** Triage color/priority level */
  priority: TriagePriority;
  /** Number of patients in this triage category */
  patientCount: number;
  /** Assessment methodology used */
  assessmentMethod: AssessmentMethod;
  /** Whether reassessment timer is active */
  reassessmentEnabled: boolean;
  /** Reassessment interval in seconds */
  reassessmentIntervalSec: number;
  /** Severity score 0-100 for finer granularity within a color */
  severityScore: number;
  /** Tag ID for patient tracking */
  tagId?: string;
}

export interface TriageStatistics {
  red: number;
  yellow: number;
  green: number;
  black: number;
  total: number;
  lastUpdated: number;
}

// =============================================================================
// STATE
// =============================================================================

const nodeTimers = new Map<string, number>();
const nodeStats = new Map<string, TriageStatistics>();

// =============================================================================
// TRAIT HANDLER
// =============================================================================

export const triageHandler: TraitHandler<TriageConfig> = {
  name: 'triage',

  defaultConfig: {
    priority: 'green',
    patientCount: 0,
    assessmentMethod: 'START',
    reassessmentEnabled: true,
    reassessmentIntervalSec: 300,
    severityScore: 0,
  },

  onAttach(node: HSPlusNode, config: TriageConfig, ctx: TraitContext): void {
    const id = node.id ?? 'unknown';

    // Initialize statistics for this triage point
    nodeStats.set(id, {
      red: 0,
      yellow: 0,
      green: 0,
      black: 0,
      total: 0,
      lastUpdated: Date.now(),
    });

    // Set initial count in the correct bucket
    const stats = nodeStats.get(id)!;
    stats[config.priority] = config.patientCount;
    stats.total = config.patientCount;

    // Reset reassessment timer
    nodeTimers.set(id, 0);

    ctx.emit?.('triage:attached', {
      nodeId: id,
      priority: config.priority,
      patientCount: config.patientCount,
      method: config.assessmentMethod,
    });
  },

  onDetach(node: HSPlusNode, _config: TriageConfig, ctx: TraitContext): void {
    const id = node.id ?? 'unknown';
    nodeTimers.delete(id);
    nodeStats.delete(id);
    ctx.emit?.('triage:detached', { nodeId: id });
  },

  onUpdate(node: HSPlusNode, config: TriageConfig, ctx: TraitContext, delta: number): void {
    if (!config.reassessmentEnabled) return;

    const id = node.id ?? 'unknown';
    const elapsed = (nodeTimers.get(id) ?? 0) + delta;
    nodeTimers.set(id, elapsed);

    if (elapsed >= config.reassessmentIntervalSec) {
      nodeTimers.set(id, 0);
      ctx.emit?.('triage:reassessment_due', {
        nodeId: id,
        priority: config.priority,
        patientCount: config.patientCount,
        elapsedSec: elapsed,
      });
    }
  },

  onEvent(node: HSPlusNode, config: TriageConfig, ctx: TraitContext, event: TraitEvent): void {
    const id = node.id ?? 'unknown';
    const eventType = typeof event === 'string' ? event : event.type;

    switch (eventType) {
      case 'triage:reclassify': {
        const newPriority = event.payload?.priority as TriagePriority | undefined;
        if (newPriority && ['red', 'yellow', 'green', 'black'].includes(newPriority)) {
          const oldPriority = config.priority;
          config.priority = newPriority;

          const stats = nodeStats.get(id);
          if (stats) {
            stats[oldPriority] = Math.max(0, stats[oldPriority] - 1);
            stats[newPriority] += 1;
            stats.lastUpdated = Date.now();
          }

          ctx.emit?.('triage:reclassified', {
            nodeId: id,
            from: oldPriority,
            to: newPriority,
          });
        }
        break;
      }

      case 'triage:add_patients': {
        const count = (event.payload?.count as number) ?? 1;
        config.patientCount += count;

        const stats = nodeStats.get(id);
        if (stats) {
          stats[config.priority] += count;
          stats.total += count;
          stats.lastUpdated = Date.now();
        }

        ctx.emit?.('triage:patients_added', {
          nodeId: id,
          count,
          newTotal: config.patientCount,
        });
        break;
      }

      case 'triage:get_stats': {
        const stats = nodeStats.get(id);
        ctx.emit?.('triage:stats', { nodeId: id, stats });
        break;
      }
    }
  },
};

export const TRIAGE_TRAIT = {
  name: 'triage',
  category: 'emergency-response',
  description: 'Mass casualty triage with START/JumpSTART/SALT/SMART classification',
  compileTargets: ['node', 'python', 'headless', 'r3f'],
  requiresRenderer: false,
  parameters: [
    { name: 'priority', type: 'enum', required: true, enumValues: ['red', 'yellow', 'green', 'black'], description: 'Triage color priority' },
    { name: 'patientCount', type: 'number', required: true, description: 'Number of patients' },
    { name: 'assessmentMethod', type: 'enum', required: false, enumValues: ['START', 'JumpSTART', 'SALT', 'SMART', 'custom'], default: 'START', description: 'Triage methodology' },
    { name: 'severityScore', type: 'number', required: false, default: 0, description: 'Fine-grained severity 0-100' },
    { name: 'reassessmentEnabled', type: 'boolean', required: false, default: true, description: 'Enable periodic reassessment' },
    { name: 'reassessmentIntervalSec', type: 'number', required: false, default: 300, description: 'Reassessment interval in seconds' },
    { name: 'tagId', type: 'string', required: false, description: 'Patient tracking tag ID' },
  ],
};

export default triageHandler;
