/**
 * CodebaseTrustGate — HoloLand World Build Cockpit
 *
 * First slice implementation for task_1779267196745_rhwb
 *
 * Renders (or provides data for) the trust gate in the World Build Cockpit.
 * Shows the AI Lab / JEPA / SimulationContract receipt status for the
 * current world "codebase" being built.
 *
 * This enforces the "receipt with solver" rule (F.058) and dogfoods the
 * HoloLand-as-JEPA-testbed (D.050) by making trust visible during world creation.
 *
 * Ties into:
 * - D.055 public receipts surface (the gate can deep-link to public profile)
 * - Recent Paper 26 benchmark (shows verified vs baseline status)
 * - D.007 bridges (the world may come from ROS 2 / other bridged data)
 */

import type { WorldModelReceipt, SimulationContractReference } from '@holoscript/core/world-model';

export interface CodebaseTrustGateProps {
  worldId: string;
  currentReceipt?: WorldModelReceipt;
  solverType?: string;
  jepaVerified: boolean;
  trustScore: number; // 0-100
  lastVerifiedAt: string;
  receiptCount: number;
}

export interface CodebaseTrustGateRender {
  status: 'trusted' | 'warning' | 'unverified';
  badge: string;
  details: string;
  actions: string[];
  deepLink: string; // to D.055 public profile or receipt inspector
}

/**
 * Renders the trust gate UI data for the World Build Cockpit.
 * In a real React/VR context this would return JSX or a Three.js node.
 */
export function renderCodebaseTrustGate(props: CodebaseTrustGateProps): CodebaseTrustGateRender {
  const { worldId, jepaVerified, trustScore, receiptCount, solverType = 'unknown' } = props;

  let status: 'trusted' | 'warning' | 'unverified';
  let badge: string;
  let details: string;
  let actions: string[] = [];

  if (jepaVerified && trustScore >= 85 && receiptCount > 0) {
    status = 'trusted';
    badge = '✓ JEPA + Receipt Verified';
    details = `World model anchored by ${receiptCount} SimulationContract receipts. Solver: ${solverType}. Trust score ${trustScore}.`;
    actions = [
      'Publish to HoloMesh public (D.055)',
      'Use as JEPA training corpus for HoloLand NPCs',
      'Share verified world link'
    ];
  } else if (trustScore >= 60) {
    status = 'warning';
    badge = '⚠ Partial Verification';
    details = `Some receipts present but JEPA verification incomplete or trust score low (${trustScore}).`;
    actions = [
      'Run full JEPA benchmark on this world',
      'Regenerate receipts with current solver',
      'Inspect in public profile'
    ];
  } else {
    status = 'unverified';
    badge = '⚠ Unverified Codebase';
    details = 'No valid WorldModelReceipt or JEPA verification found for this world build.';
    actions = [
      'Generate SimulationContract receipt now',
      'Run JEPAObjective on current solver trajectory',
      'Block publish until verified (policy)'
    ];
  }

  const deepLink = `https://holomesh.public/agents/hololand-world-${worldId}/receipts`;

  return {
    status,
    badge,
    details,
    actions,
    deepLink
  };
}

/**
 * Example usage in the World Build Cockpit:
 *
 * const gate = renderCodebaseTrustGate({
 *   worldId: currentWorld.id,
 *   currentReceipt: latestWorldModelReceipt,
 *   jepaVerified: true,
 *   trustScore: 92,
 *   receiptCount: 17,
 *   solverType: 'gazebo+ros2'
 * });
 *
 * // Then render the badge + details panel + action buttons in the cockpit UI
 * // Clicking deepLink opens the D.055 public receipt view.
 */

export default renderCodebaseTrustGate;