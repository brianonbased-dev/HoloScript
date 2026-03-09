/**
 * @fileoverview Capability Types — Compile-Time Capability Verification
 * @module @holoscript/core/compiler/safety
 *
 * Maps runtime CapabilityRBAC resources to compile-time type annotations.
 * Functions that require specific capabilities must declare them; the
 * compiler verifies that callers hold the required capabilities.
 *
 * @version 1.0.0
 */

import { VREffect, EffectCategory } from '../../types/effects';

// =============================================================================
// CAPABILITY DEFINITIONS
// =============================================================================

/** Capability scopes — what resource domains exist */
export type CapabilityScope =
  | 'scene:read'
  | 'scene:write'
  | 'scene:admin'
  | 'physics:read'
  | 'physics:write'
  | 'network:read'
  | 'network:write'
  | 'network:admin'
  | 'inventory:read'
  | 'inventory:write'
  | 'inventory:admin'
  | 'authority:delegate'
  | 'authority:admin'
  | 'agent:spawn'
  | 'agent:admin'
  | 'audio:play'
  | 'audio:admin'
  | 'system:debug'
  | 'system:admin';

/** A capability requirement for a function/trait */
export interface CapabilityRequirement {
  scope: CapabilityScope;
  reason: string;
  source: string; // Which trait/call requires this
}

/** Result of capability checking */
export interface CapabilityCheckResult {
  name: string;
  required: CapabilityRequirement[];
  granted: CapabilityScope[];
  missing: CapabilityRequirement[];
  passed: boolean;
}

// =============================================================================
// EFFECT → CAPABILITY MAPPING
// =============================================================================

/**
 * Maps VR effects to the capabilities they require.
 * This bridges the effect system (Layer 1-2) to the capability system.
 */
export const EFFECT_TO_CAPABILITY: Partial<Record<VREffect, CapabilityScope>> = {
  // Render effects need scene write
  'render:spawn': 'scene:write',
  'render:destroy': 'scene:write',
  'render:material': 'scene:write',
  'render:particle': 'scene:write',
  'render:light': 'scene:write',
  'render:shader': 'scene:write',
  'render:gaussian': 'scene:write',

  // Physics
  'physics:force': 'physics:write',
  'physics:impulse': 'physics:write',
  'physics:collision': 'physics:read',
  'physics:teleport': 'physics:write',
  'physics:gravity': 'physics:write',
  'physics:joint': 'physics:write',

  // Audio
  'audio:play': 'audio:play',
  'audio:stop': 'audio:play',
  'audio:spatial': 'audio:play',
  'audio:global': 'audio:admin',
  'audio:reverb': 'audio:play',

  // State
  'state:read': 'scene:read',
  'state:write': 'scene:write',
  'state:global': 'scene:admin',
  'state:persistent': 'scene:admin',

  // IO
  'io:read': 'scene:read',
  'io:write': 'scene:write',
  'io:network': 'network:write',
  'io:timer': 'scene:read',

  // Inventory
  'inventory:take': 'inventory:write',
  'inventory:give': 'inventory:write',
  'inventory:destroy': 'inventory:admin',
  'inventory:duplicate': 'inventory:admin',
  'inventory:trade': 'inventory:write',

  // Authority
  'authority:own': 'authority:admin',
  'authority:delegate': 'authority:delegate',
  'authority:revoke': 'authority:admin',
  'authority:zone': 'authority:admin',
  'authority:world': 'authority:admin',

  // Agent
  'agent:spawn': 'agent:spawn',
  'agent:kill': 'agent:admin',
  'agent:communicate': 'agent:spawn',
  'agent:observe': 'scene:read',
  'agent:control': 'agent:admin',

  // Resource
  'resource:cpu': 'scene:read',
  'resource:memory': 'scene:write',
  'resource:gpu': 'scene:write',
  'resource:bandwidth': 'network:write',
  'resource:storage': 'scene:admin',
};

/**
 * Capability hierarchy: admin capabilities subsume write, write subsumes read.
 */
export const CAPABILITY_HIERARCHY: Record<CapabilityScope, CapabilityScope[]> = {
  'scene:admin': ['scene:write', 'scene:read'],
  'scene:write': ['scene:read'],
  'scene:read': [],
  'physics:write': ['physics:read'],
  'physics:read': [],
  'network:admin': ['network:write', 'network:read'],
  'network:write': ['network:read'],
  'network:read': [],
  'inventory:admin': ['inventory:write', 'inventory:read'],
  'inventory:write': ['inventory:read'],
  'inventory:read': [],
  'authority:admin': ['authority:delegate'],
  'authority:delegate': [],
  'agent:admin': ['agent:spawn'],
  'agent:spawn': [],
  'audio:admin': ['audio:play'],
  'audio:play': [],
  'system:admin': ['system:debug'],
  'system:debug': [],
};

/**
 * Expand a set of granted capabilities using the hierarchy.
 * e.g., 'scene:admin' expands to include 'scene:write' and 'scene:read'.
 */
export function expandCapabilities(granted: CapabilityScope[]): Set<CapabilityScope> {
  const expanded = new Set<CapabilityScope>(granted);
  let changed = true;
  while (changed) {
    changed = false;
    for (const cap of [...expanded]) {
      for (const sub of CAPABILITY_HIERARCHY[cap] || []) {
        if (!expanded.has(sub)) {
          expanded.add(sub);
          changed = true;
        }
      }
    }
  }
  return expanded;
}

/**
 * Check if a set of granted capabilities satisfies all requirements.
 */
export function checkCapabilities(
  requirements: CapabilityRequirement[],
  granted: CapabilityScope[]
): CapabilityCheckResult {
  const expanded = expandCapabilities(granted);
  const missing = requirements.filter((req) => !expanded.has(req.scope));
  return {
    name: '',
    required: requirements,
    granted,
    missing,
    passed: missing.length === 0,
  };
}

/**
 * Derive capability requirements from an effect row.
 */
export function deriveRequirements(effects: VREffect[], source: string): CapabilityRequirement[] {
  const reqs: CapabilityRequirement[] = [];
  const seen = new Set<CapabilityScope>();

  for (const effect of effects) {
    const cap = EFFECT_TO_CAPABILITY[effect];
    if (cap && !seen.has(cap)) {
      seen.add(cap);
      reqs.push({ scope: cap, reason: `Required by effect '${effect}'`, source });
    }
  }

  return reqs;
}

/** Default capabilities for different agent trust levels */
export const TRUST_LEVEL_CAPABILITIES: Record<string, CapabilityScope[]> = {
  untrusted: ['scene:read'],
  basic: ['scene:read', 'scene:write', 'physics:read', 'audio:play'],
  trusted: [
    'scene:read',
    'scene:write',
    'physics:read',
    'physics:write',
    'audio:play',
    'inventory:read',
    'agent:spawn',
  ],
  admin: [
    'scene:admin',
    'physics:write',
    'network:admin',
    'inventory:admin',
    'authority:admin',
    'agent:admin',
    'audio:admin',
  ],
  system: [
    'scene:admin',
    'physics:write',
    'network:admin',
    'inventory:admin',
    'authority:admin',
    'agent:admin',
    'audio:admin',
    'system:admin',
  ],
};
