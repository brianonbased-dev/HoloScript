/**
 * @fileoverview Effect Inference Engine
 * @module @holoscript/core/compiler/safety
 *
 * Maps HoloScript traits and built-in functions to their effect signatures.
 * Provides bottom-up inference: given an AST node, compute the effect row
 * by looking up known effects and composing callee rows.
 *
 * @version 1.0.0
 */

import { EffectRow, VREffect, EffectDeclaration, EffectCategory } from '../../types/effects';

// =============================================================================
// TRAIT → EFFECT MAPPINGS
// =============================================================================

/**
 * Maps standard HoloScript trait names to their effect rows.
 * When a function uses a trait, it inherits these effects.
 */
export const TRAIT_EFFECTS: Record<string, VREffect[]> = {
  // Rendering traits
  '@mesh':        ['render:spawn'],
  '@material':    ['render:material'],
  '@particle':    ['render:particle', 'render:spawn', 'resource:gpu'],
  '@light':       ['render:light'],
  '@shader':      ['render:shader', 'resource:gpu'],
  '@gaussian':    ['render:gaussian', 'resource:gpu', 'resource:memory'],
  '@camera':      ['render:spawn'],
  '@sprite':      ['render:spawn'],
  '@vfx':         ['render:particle', 'render:shader', 'resource:gpu'],

  // Physics traits
  '@physics':     ['physics:force', 'physics:collision', 'resource:cpu'],
  '@rigidbody':   ['physics:force', 'physics:collision'],
  '@collider':    ['physics:collision'],
  '@joint':       ['physics:joint'],
  '@trigger':     ['physics:collision'],
  '@gravity':     ['physics:gravity'],
  '@teleport':    ['physics:teleport'],

  // Audio traits
  '@audio':       ['audio:play'],
  '@spatial_audio': ['audio:spatial'],
  '@reverb':      ['audio:reverb'],
  '@music':       ['audio:play', 'audio:global'],

  // State traits
  '@state':       ['state:read', 'state:write'],
  '@persistent':  ['state:persistent', 'io:write'],
  '@global_state': ['state:global'],

  // Networking
  '@networked':   ['io:network', 'state:write'],
  '@multiplayer': ['io:network', 'agent:communicate'],
  '@sync':        ['io:network', 'state:write'],

  // Agent traits
  '@agent':       ['agent:spawn', 'resource:cpu'],
  '@npc':         ['agent:spawn', 'agent:observe'],
  '@ai':          ['agent:observe', 'resource:cpu'],
  '@behavior':    ['agent:observe', 'state:read'],

  // Inventory / economy
  '@inventory':   ['inventory:take', 'inventory:give'],
  '@tradeable':   ['inventory:trade'],
  '@consumable':  ['inventory:destroy'],
  '@loot':        ['inventory:give'],

  // Authority / permissions
  '@owned':       ['authority:own'],
  '@delegated':   ['authority:delegate'],
  '@zone':        ['authority:zone'],

  // Animation (mostly pure, some render effects)
  '@animation':   ['render:material'],
  '@keyframe':    ['state:read'],
  '@tween':       ['state:read', 'state:write'],

  // Script / lifecycle
  '@script':      ['state:read', 'state:write'],
  '@timer':       ['io:timer'],
  '@event':       ['state:read'],

  // Sandbox (explicitly limited)
  '@sandbox':     [],  // Pure — sandboxed code should have no effects
};

/**
 * Maps built-in functions to their effect rows.
 */
export const BUILTIN_EFFECTS: Record<string, VREffect[]> = {
  // Object manipulation
  'spawn':          ['render:spawn', 'resource:memory'],
  'destroy':        ['render:destroy'],
  'clone':          ['render:spawn', 'resource:memory'],

  // Physics
  'applyForce':     ['physics:force'],
  'applyImpulse':   ['physics:impulse'],
  'setVelocity':    ['physics:force'],
  'teleportTo':     ['physics:teleport'],
  'setGravity':     ['physics:gravity'],

  // Audio
  'playSound':      ['audio:play'],
  'stopSound':      ['audio:stop'],
  'playSpatial':    ['audio:spatial'],
  'playMusic':      ['audio:global'],

  // State
  'setState':       ['state:write'],
  'getState':       ['state:read'],
  'setGlobal':      ['state:global'],
  'persist':        ['state:persistent', 'io:write'],
  'load':           ['state:read', 'io:read'],
  'save':           ['state:write', 'io:write'],

  // IO
  'fetch':          ['io:network'],
  'httpGet':        ['io:network'],
  'httpPost':       ['io:network', 'io:write'],
  'readFile':       ['io:read'],
  'writeFile':      ['io:write'],
  'setTimeout':     ['io:timer'],
  'setInterval':    ['io:timer'],

  // Inventory
  'giveItem':       ['inventory:give'],
  'takeItem':       ['inventory:take'],
  'destroyItem':    ['inventory:destroy'],
  'tradeWith':      ['inventory:trade'],

  // Agent
  'spawnAgent':     ['agent:spawn', 'resource:cpu'],
  'killAgent':      ['agent:kill'],
  'sendMessage':    ['agent:communicate'],
  'observe':        ['agent:observe'],

  // Authority
  'transferOwnership': ['authority:delegate'],
  'revokeAccess':      ['authority:revoke'],
  'claimZone':         ['authority:zone'],

  // Resource-heavy operations
  'createParticleSystem': ['render:particle', 'resource:gpu'],
  'compileShader':        ['render:shader', 'resource:gpu'],
  'allocateBuffer':       ['resource:memory', 'resource:gpu'],

  // Pure functions (no effects)
  'Math.sin':     [],
  'Math.cos':     [],
  'Math.random':  [],
  'lerp':         [],
  'clamp':        [],
  'distance':     [],
  'normalize':    [],
  'dot':          [],
  'cross':        [],
};

// =============================================================================
// INFERENCE ENGINE
// =============================================================================

/** Result of inferring effects for an AST node */
export interface InferredEffects {
  /** The inferred effect row */
  row: EffectRow;
  /** Source of each effect (which trait/function caused it) */
  sources: Map<VREffect, string[]>;
  /** Any warnings generated during inference */
  warnings: string[];
}

/**
 * Infer effects from a list of trait names used by an object/function.
 */
export function inferFromTraits(traitNames: string[]): InferredEffects {
  const allEffects: VREffect[] = [];
  const sources = new Map<VREffect, string[]>();
  const warnings: string[] = [];

  for (const trait of traitNames) {
    const normalized = trait.startsWith('@') ? trait : `@${trait}`;
    const effects = TRAIT_EFFECTS[normalized];
    if (effects) {
      for (const e of effects) {
        allEffects.push(e);
        const existing = sources.get(e) || [];
        existing.push(normalized);
        sources.set(e, existing);
      }
    } else {
      warnings.push(`Unknown trait '${normalized}': cannot infer effects. Assuming pure.`);
    }
  }

  return { row: new EffectRow(allEffects), sources, warnings };
}

/**
 * Infer effects from a list of built-in function calls.
 */
export function inferFromBuiltins(functionNames: string[]): InferredEffects {
  const allEffects: VREffect[] = [];
  const sources = new Map<VREffect, string[]>();
  const warnings: string[] = [];

  for (const fn of functionNames) {
    const effects = BUILTIN_EFFECTS[fn];
    if (effects) {
      for (const e of effects) {
        allEffects.push(e);
        const existing = sources.get(e) || [];
        existing.push(fn);
        sources.set(e, existing);
      }
    }
    // Unknown functions are NOT warned — they may be user-defined (checked separately)
  }

  return { row: new EffectRow(allEffects), sources, warnings };
}

/**
 * Compose multiple inferred effect rows into a single row.
 * This is the row-polymorphic union: fn effects = ∪(callee effects).
 */
export function composeEffects(...inferred: InferredEffects[]): InferredEffects {
  let combined = EffectRow.PURE;
  const allSources = new Map<VREffect, string[]>();
  const allWarnings: string[] = [];

  for (const inf of inferred) {
    combined = combined.union(inf.row);
    for (const [effect, srcs] of inf.sources) {
      const existing = allSources.get(effect) || [];
      allSources.set(effect, [...existing, ...srcs]);
    }
    allWarnings.push(...inf.warnings);
  }

  return { row: combined, sources: allSources, warnings: allWarnings };
}

/**
 * Get the effect declaration for a trait.
 */
export function traitEffectDeclaration(traitName: string): EffectDeclaration {
  const normalized = traitName.startsWith('@') ? traitName : `@${traitName}`;
  const effects = TRAIT_EFFECTS[normalized];
  return {
    declared: effects ? new EffectRow(effects) : EffectRow.PURE,
    origin: effects ? 'annotated' : 'inferred',
  };
}

/**
 * List all known trait names.
 */
export function knownTraits(): string[] {
  return Object.keys(TRAIT_EFFECTS);
}

/**
 * List all known built-in function names.
 */
export function knownBuiltins(): string[] {
  return Object.keys(BUILTIN_EFFECTS);
}
