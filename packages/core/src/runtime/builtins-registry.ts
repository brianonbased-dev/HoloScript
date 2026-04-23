/**
 * Builtins registry — extracted from HoloScriptRuntime (W1-T4 slice 28)
 *
 * Constructs the Map<string, BuiltinFn> of named runtime builtins
 * (`show`, `hide`, `spawn`, `move`, `set`, `get`, math, string,
 * array, misc). The pre-extraction impl lived inline in HSR as
 * `initBuiltins()` — 323 LOC of builder lambdas, each a thin
 * operation over HSR state + slice-already-extracted helpers.
 *
 * **Pattern**: factory + fat context (pattern 5 scaled to max).
 * 20+ callbacks / state containers threaded through one context
 * bag. The caller (HSR) builds this bag once at construction time.
 *
 * This is the W1-T4 task description's "trickiest" slice:
 * task_1776940546034_do0w acknowledged 20+ callback injections.
 * Resolved by grouping callbacks into a single factory signature
 * rather than threading them through N separate function exports.
 *
 * Builtins registered here are ALREADY refactored in prior slices:
 *   - Slice 4: createParticleEffect / createConnectionStream (via ctx callbacks)
 *   - Slice 8: shop / inventory / purchase / presence / invite /
 *              share / physics / gravity / collide / animate
 *   - Slice 13: resolveHoloValue (imported directly)
 *   - Slice 26: executeOrb (via ctx callback)
 *
 * Behavior is LOCKED by HoloScriptRuntime.characterization.test.ts.
 *
 * **See**: W1-T4 slice 28 / board task task_1776940546034_do0w
 *         packages/core/src/HoloScriptRuntime.ts (pre-extraction
 *         LOC 407-730)
 */

import { logger } from '../logger';
import type {
  Animation,
  ExecutionResult,
  HoloScriptValue,
  HoloTemplate,
  HoloValue,
  HologramProperties,
  OrbNode,
  SpatialPosition,
  TemplateNode,
  UIElementState,
} from '../types';
import type { AgentRuntime } from '../types';
import { resolveHoloValue } from './holo-value';
import {
  handleShop,
  handleInventory,
  handlePurchase,
  handlePresence,
  handleInvite,
  handleShare,
  handlePhysics,
  handleGravity,
  handleCollide,
  handleAnimate,
} from './primitives';

/** A builtin function's runtime signature. */
export type BuiltinFn = (
  args: HoloScriptValue[],
) => HoloScriptValue | Promise<HoloScriptValue>;

// ──────────────────────────────────────────────────────────────────
// Default particle counts / colors (named constants)
// ──────────────────────────────────────────────────────────────────

const SHOW_PARTICLES = 15;
const PULSATE_PARTICLES = 30;
const SPAWN_PARTICLES = 25;
const DESPAWN_PARTICLES = 30;
const DEFAULT_PULSATE_DURATION_MS = 1000;
const DEFAULT_PULSATE_COLOR = '#ffffff';
const SPAWN_COLOR = '#00ff00';
const DESPAWN_COLOR = '#ff0000';

// ──────────────────────────────────────────────────────────────────
// Context — callbacks + state containers threaded from HSR
// ──────────────────────────────────────────────────────────────────

/**
 * Context threaded from HSR into every builtin lambda. Many
 * callbacks — this is the widest context in the split (equivalent
 * to slice-26 OrbExecutorContext plus a few).
 */
export interface BuiltinsContext {
  /** UI element registry (show / hide visibility toggles). */
  uiElements: Map<string, UIElementState>;
  /** Hologram state registry (show particle color lookup, despawn). */
  hologramState: Map<string, HologramProperties>;
  /** Spatial memory (pulsate/spawn/despawn/move position lookup). */
  spatialMemory: Map<string, SpatialPosition>;
  /** Animation registry (animate registration). */
  animations: Map<string, Animation>;
  /** Variable registry (spawn delete, despawn delete). */
  variables: Map<string, HoloScriptValue>;
  /** Template registry (spawn mitosis template resolution). */
  templates: Map<string, TemplateNode>;
  /** Execution stack read (think current-agent lookup). */
  executionStack: ReadonlyArray<unknown>;
  /** Agent runtime registry (think agent lookup). */
  agentRuntimes: Map<string, AgentRuntime>;

  /** Particle-effect creator (HSR wrapper threading the Map + limit). */
  createParticleEffect: (
    name: string,
    position: SpatialPosition,
    color: string,
    count: number,
  ) => void;
  /** Connection-stream creator (move move-trail). */
  createConnectionStream: (
    from: string,
    to: string,
    fromPos: SpatialPosition,
    toPos: SpatialPosition,
    dataType: string,
  ) => void;

  /** Fire-and-forget emit (showSettings / openChat / spawn mitosis / notifyParent). */
  emit: (event: string, data?: unknown) => void | Promise<void>;
  /** Variable write (set). */
  setVariable: (name: string, value: HoloScriptValue) => void;
  /** Variable read (get). */
  getVariable: (name: string) => HoloScriptValue;

  /** Orb executor (spawn mitosis runs the newly-built OrbNode). */
  executeOrb: (orbNode: OrbNode) => Promise<ExecutionResult>;

  /** Arc calculator delegate (calculate_arc still in HSR pre-its-own-slice). */
  calculateArc: (args: HoloScriptValue[]) => HoloScriptValue;
}

/**
 * Build the full builtins Map. Merges `customFunctions` first so
 * named builtins override any conflicting custom entry.
 */
export function createBuiltinsMap(
  ctx: BuiltinsContext,
  customFunctions?: Record<string, BuiltinFn>,
): Map<string, BuiltinFn> {
  const builtins = new Map<string, BuiltinFn>();

  // Inject custom functions first; builtin entries below overwrite on conflict.
  if (customFunctions) {
    for (const [name, func] of Object.entries(customFunctions)) {
      builtins.set(name, func);
    }
  }

  // ── Display commands ─────────────────────────────────────────
  builtins.set('show', (args) => {
    const target = String(args[0]);
    const element = ctx.uiElements.get(target);
    if (element) element.visible = true;
    const hologram = ctx.hologramState.get(target);
    if (hologram) {
      ctx.createParticleEffect(`${target}_show`, [0, 0, 0], hologram.color, SHOW_PARTICLES);
    }
    logger.info('show', { target });
    return { shown: target };
  });

  builtins.set('hide', (args) => {
    const target = String(args[0]);
    const element = ctx.uiElements.get(target);
    if (element) element.visible = false;
    logger.info('hide', { target });
    return { hidden: target };
  });

  // ── Animation commands ───────────────────────────────────────
  builtins.set('pulsate', (args): HoloScriptValue => {
    const target = String(args[0]);
    const options = (args[1] as Record<string, HoloScriptValue>) || {};
    const duration = Number(options.duration) || DEFAULT_PULSATE_DURATION_MS;
    const color = String(options.color || DEFAULT_PULSATE_COLOR);

    const position = ctx.spatialMemory.get(target) || [0, 0, 0];
    ctx.createParticleEffect(`${target}_pulse`, position, color, PULSATE_PARTICLES);

    return { pulsing: target, duration };
  });

  builtins.set('animate', (args): HoloScriptValue => {
    const target = String(args[0]);
    const options = (args[1] as Record<string, HoloScriptValue>) || {};

    const animation: Animation = {
      target,
      property: String(options.property || 'position[1]'),
      from: Number(options.from || 0),
      to: Number(options.to || 1),
      duration: Number(options.duration || 1000),
      startTime: Date.now(),
      easing: String(options.easing || 'linear'),
      loop: Boolean(options.loop),
      yoyo: Boolean(options.yoyo),
    };

    ctx.animations.set(`${target}_${animation.property}`, animation);
    return { animating: target, animation };
  });

  // ── Spatial commands ─────────────────────────────────────────
  builtins.set('spawn', async (args): Promise<HoloScriptValue> => {
    const config = args[0] as HoloScriptValue;
    // Legacy support for (name, position)
    if (typeof config === 'string') {
      const target = config;
      const position = (args[1] as SpatialPosition) || [0, 0, 0];
      ctx.spatialMemory.set(target, position);
      ctx.createParticleEffect(`${target}_spawn`, position, SPAWN_COLOR, SPAWN_PARTICLES);
      return { spawned: target, at: position };
    }

    // Mitosis support for ({ template, id, position, ... })
    const spawnConfig = config as Record<string, unknown>;
    const templateName = String(spawnConfig.template);
    const id = String(spawnConfig.id || `${templateName}_${Date.now()}`);
    const position = (spawnConfig.position as SpatialPosition) || [0, 0, 0];

    const template = ctx.templates.get(templateName);
    if (!template) {
      logger.error(`[Mitosis] Template ${templateName} not found`);
      return { error: `Template ${templateName} not found` };
    }

    // Create an OrbNode from the template
    const spawnNode: OrbNode = {
      type: 'orb',
      name: id,
      position,
      properties: { ...((spawnConfig.config as Record<string, HoloScriptValue>) || {}) },
      children: template.children,
      traits: template.traits,
      directives: template.directives,
    };

    // Merge template state and default properties if not overridden in config
    const holoTpl = template as unknown as HoloTemplate;
    if (holoTpl.state) {
      for (const prop of holoTpl.state.properties) {
        if (spawnNode.properties[prop.key] === undefined) {
          spawnNode.properties[prop.key] = resolveHoloValue(prop.value as HoloValue);
        }
      }
    }
    for (const prop of holoTpl.properties) {
      if (spawnNode.properties[prop.key] === undefined) {
        spawnNode.properties[prop.key] = resolveHoloValue(prop.value as HoloValue);
      }
    }

    // Execute the newly created orb
    await ctx.executeOrb(spawnNode);

    // If there's a parent, notify them of the mitosis event
    if (spawnConfig.parentId || spawnConfig.parent_id) {
      const parentId = String(spawnConfig.parentId || spawnConfig.parent_id);
      await ctx.emit(`mitosis_spawned`, { parentId, childId: id });
      await ctx.emit(`${parentId}.mitosis_spawned`, { childId: id });
    }

    return { spawned: id, template: templateName };
  });

  builtins.set('notifyParent', async (args): Promise<HoloScriptValue> => {
    const parentId = String(args[0]);
    const data = args[1];

    await ctx.emit(`mitosis_child_complete`, {
      parentId,
      childId: (args[2] as string) || 'unknown',
      result: data,
    });

    await ctx.emit(`${parentId}.mitosis_child_complete`, {
      childId: (args[2] as string) || 'unknown',
      result: data,
    });

    return { notified: parentId };
  });

  builtins.set('despawn', (args): HoloScriptValue => {
    const target = String(args[0]);
    if (ctx.hologramState.has(target)) {
      const pos = ctx.spatialMemory.get(target) || [0, 0, 0];
      ctx.createParticleEffect(`${target}_despawn`, pos, DESPAWN_COLOR, DESPAWN_PARTICLES);
      ctx.hologramState.delete(target);
      ctx.variables.delete(target);
      ctx.spatialMemory.delete(target);
      logger.info('despawn', { target });
      return { despawned: target };
    }
    return { msg: 'Target not found', target };
  });

  builtins.set('move', (args): HoloScriptValue => {
    const target = String(args[0]);
    const position = (args[1] as SpatialPosition) || [0, 0, 0];

    const current = ctx.spatialMemory.get(target);
    if (current) {
      ctx.spatialMemory.set(target, position);
      ctx.createConnectionStream(target, `${target}_dest`, current, position, 'move');
    }

    return { moved: target, to: position };
  });

  // ── Data commands ────────────────────────────────────────────
  builtins.set('set', (args): HoloScriptValue => {
    const target = String(args[0]);
    const value = args[1];
    ctx.setVariable(target, value);
    return { set: target, value };
  });

  builtins.set('get', (args): HoloScriptValue => {
    const target = String(args[0]);
    return ctx.getVariable(target);
  });

  // ── Math functions ───────────────────────────────────────────
  builtins.set('add', (args): HoloScriptValue => Number(args[0]) + Number(args[1]));
  builtins.set('subtract', (args): HoloScriptValue => Number(args[0]) - Number(args[1]));
  builtins.set('multiply', (args): HoloScriptValue => Number(args[0]) * Number(args[1]));
  builtins.set(
    'divide',
    (args): HoloScriptValue => (Number(args[1]) !== 0 ? Number(args[0]) / Number(args[1]) : 0),
  );
  builtins.set('mod', (args): HoloScriptValue => Number(args[0]) % Number(args[1]));
  builtins.set('abs', (args): HoloScriptValue => Math.abs(Number(args[0])));
  builtins.set('floor', (args): HoloScriptValue => Math.floor(Number(args[0])));
  builtins.set('ceil', (args): HoloScriptValue => Math.ceil(Number(args[0])));
  builtins.set('round', (args): HoloScriptValue => Math.round(Number(args[0])));
  builtins.set('min', (args): HoloScriptValue => Math.min(...args.map(Number)));
  builtins.set('max', (args): HoloScriptValue => Math.max(...args.map(Number)));
  builtins.set('random', (): HoloScriptValue => Math.random());

  // ── String functions ─────────────────────────────────────────
  builtins.set('concat', (args): HoloScriptValue => args.map(String).join(''));
  builtins.set('length', (args): HoloScriptValue => {
    const val = args[0];
    if (typeof val === 'string') return val.length;
    if (Array.isArray(val)) return val.length;
    return 0;
  });
  builtins.set(
    'substring',
    (args): HoloScriptValue => String(args[0]).substring(Number(args[1]), Number(args[2])),
  );

  builtins.set('wait', async (args): Promise<HoloScriptValue> => {
    const ms = Number(args[0]) || 0;
    await new Promise((resolve) => setTimeout(resolve, ms));
    return { waited: ms };
  });

  builtins.set('print', (args): HoloScriptValue => {
    console.log(`[HoloScript]`, ...args);
    return { printed: args.join(' ') };
  });
  builtins.set('uppercase', (args): HoloScriptValue => String(args[0]).toUpperCase());
  builtins.set('lowercase', (args): HoloScriptValue => String(args[0]).toLowerCase());

  // ── Array functions ──────────────────────────────────────────
  builtins.set('push', (args): HoloScriptValue => {
    const arr = args[0];
    if (Array.isArray(arr)) {
      (arr as HoloScriptValue[]).push(args[1]);
      return arr;
    }
    return [args[0], args[1]];
  });
  builtins.set('pop', (args): HoloScriptValue => {
    const arr = args[0];
    if (Array.isArray(arr)) return arr.pop();
    return undefined;
  });
  builtins.set('at', (args): HoloScriptValue => {
    const arr = args[0];
    const index = Number(args[1]);
    if (Array.isArray(arr)) return arr[index];
    return undefined;
  });

  // ── UI helpers ───────────────────────────────────────────────
  builtins.set('showSettings', (): HoloScriptValue => {
    void ctx.emit('show-settings');
    return true as HoloScriptValue;
  });

  builtins.set('openChat', (args): HoloScriptValue => {
    const config = args[0] || {};
    void ctx.emit('show-chat', config);
    return true as HoloScriptValue;
  });

  // ── Console / Debug ──────────────────────────────────────────
  builtins.set('log', (args): HoloScriptValue => {
    logger.info('HoloScript log', { args });
    return args[0];
  });
  // NOTE: 'print' overrides the earlier registration — preserving
  // HSR's pre-extraction behavior (last-write-wins).
  builtins.set('print', (args): HoloScriptValue => {
    const message = args.map(String).join(' ');
    logger.info('print', { message });
    return message;
  });

  // ── Type checking ────────────────────────────────────────────
  builtins.set('typeof', (args): HoloScriptValue => typeof args[0]);
  builtins.set('isArray', (args): HoloScriptValue => Array.isArray(args[0]));
  builtins.set(
    'isNumber',
    (args): HoloScriptValue => typeof args[0] === 'number' && !isNaN(args[0]),
  );
  builtins.set('isString', (args): HoloScriptValue => typeof args[0] === 'string');

  // ── Slice-8 primitives (delegates only — emit via ctx.emit) ──
  const emitFn = (event: string, data?: unknown): void => {
    void ctx.emit(event, data);
  };
  builtins.set('shop', (args) => handleShop(args, emitFn));
  builtins.set('inventory', (args) => handleInventory(args, emitFn));
  builtins.set('purchase', (args) => handlePurchase(args, emitFn));
  builtins.set('presence', (args) => handlePresence(args, emitFn));
  builtins.set('invite', (args) => handleInvite(args, emitFn));
  builtins.set('share', (args) => handleShare(args, emitFn));
  builtins.set('physics', (args) => handlePhysics(args, emitFn));
  builtins.set('gravity', (args) => handleGravity(args, emitFn));
  builtins.set('collide', (args) => handleCollide(args, emitFn));
  // NOTE: 'animate' overrides the earlier one from this module —
  // preserving HSR's pre-extraction last-write-wins behavior.
  builtins.set('animate', (args) => handleAnimate(args, emitFn));
  builtins.set('calculate_arc', (args) => ctx.calculateArc(args));

  // ── Misc ─────────────────────────────────────────────────────
  builtins.set(
    'sleep',
    (args) => new Promise((resolve) => setTimeout(resolve, Number(args[0]) || 0)),
  );
  builtins.set('think', async (args) => {
    const activeNode = ctx.executionStack[ctx.executionStack.length - 1];
    if (!activeNode) return 'No context';
    const agentId = (activeNode as unknown as Record<string, unknown>).name as string;
    const agentRuntime = ctx.agentRuntimes.get(agentId);
    if (agentRuntime) {
      return await agentRuntime.think(String(args[0] || ''));
    }
    return 'Thinking only available for agents.';
  });

  return builtins;
}
