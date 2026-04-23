/**
 * Orb executor — extracted from HoloScriptRuntime (W1-T4 slice 26)
 *
 * Biggest single executor in the runtime. Runs a seven-phase
 * pipeline to reconcile an orb with runtime state:
 *
 *   1. State reconciliation — check context.variables for an
 *      existing orb by name; determine create vs. update.
 *   2. Position normalization — coerce node.position (array or
 *      array-like) to a concrete [x, y, z] triple, then scale
 *      by context.currentScale.
 *   3. Property evaluation — evaluate string-valued properties
 *      through the runtime's expression evaluator. Supports both
 *      Array (HoloScript composition) and Record (HS+ type) shapes.
 *   4. Template merging — for orbs with `template`, merge missing
 *      properties and prepend template directives onto the node.
 *   5. Hologram construction — use explicit node.hologram if present
 *      (with size×scale), else derive from evaluated properties
 *      (color/geometry/scale/glow/interactive defaults).
 *   6. Migration logic — if the template version increased, run the
 *      matching migration block from the old version.
 *   7. OrbData build + mutation — create or update orbData with
 *      properties, directives, position, hologram, templateRef;
 *      apply directives; emit creation particle effect; initialize
 *      agent runtime if node is an agent; log + broadcast.
 *
 * **Pattern**: fat context (pattern 5 scaled up). 13 callbacks +
 * state containers. Similar shape to slice 20 GraphExecutorContext.
 *
 * **Preserved semantic**: Phase 4 MUTATES `node.directives` in place
 * (when template directives are prepended). Caller observes the
 * mutation — do not change this without a re-lock.
 *
 * Behavior is LOCKED by HoloScriptRuntime.characterization.test.ts.
 *
 * **See**: W1-T4 slice 26 / board task task_1776940471985_57z8
 *         packages/core/src/HoloScriptRuntime.ts (pre-extraction
 *         LOC 1281-1518)
 */

import { logger } from '../logger';
import type {
  AgentRuntime,
  ASTNode,
  ExecutionResult,
  HologramProperties,
  HologramShape,
  HoloScriptValue,
  IParentRuntime,
  MigrationBlock,
  OrbNode,
  TemplateNode,
} from '../types';

/** Fat context for orb execution — 13 fields, some optional. */
export interface OrbExecutorContext {
  /** Current scale multiplier from the runtime context. */
  getCurrentScale: () => number;
  /** Variable registry read (state reconciliation). */
  getVariable: (name: string) => unknown;
  /** Variable registry write (new-orb registration). */
  setVariable: (name: string, value: HoloScriptValue) => void;
  /** Spatial-position registry (adjustedPos save). */
  setSpatialPosition: (name: string, pos: [number, number, number]) => void;
  /** Expression evaluator (property string eval). */
  evaluateExpression: (expr: string) => HoloScriptValue;
  /** Template registry lookup (template merging + version check). */
  getTemplate: (name: string) => TemplateNode | undefined;
  /** Hologram state registry (post-build save). */
  setHologramState: (name: string, hologram: HologramProperties) => void;
  /** Migration executor (Phase 6). */
  executeMigrationBlock: (existingOrb: Record<string, unknown>, migration: MigrationBlock) => Promise<void>;
  /** Builtin-function registry lookup (for show/hide/pulse orb methods). */
  getBuiltinFunction: (
    name: string,
  ) => ((args: HoloScriptValue[]) => HoloScriptValue | Promise<HoloScriptValue>) | undefined;
  /** Apply directives — trait handlers, @state, @method processing. */
  applyDirectives: (node: ASTNode) => void;
  /** Agent-detection predicate. */
  isAgent: (node: OrbNode) => boolean;
  /** Agent runtime registry (get + set). */
  getAgentRuntime: (name: string) => AgentRuntime | undefined;
  setAgentRuntime: (name: string, runtime: AgentRuntime) => void;
  /** Agent pool — reuse worker-like runtimes across orbs. */
  acquireAgentRuntime: () => AgentRuntime;
  /** Parent runtime reference passed into AgentRuntime.reset(). */
  parentRuntime: IParentRuntime;
  /** Particle-effect creator (creation puff). */
  createParticleEffect: (name: string, position: [number, number, number], color: string, count: number) => void;
  /** Broadcast creator/updater event to visualizer clients. */
  broadcast: (event: string, payload: Record<string, unknown>) => void;
}

/** Type guard: checks if a value looks like an orb record (has __type: 'orb'). */
function isOrbData(v: unknown): v is Record<string, unknown> & { __type: 'orb' } {
  return v !== null && typeof v === 'object' && (v as Record<string, unknown>).__type === 'orb';
}

/** Default hologram color when neither node.hologram nor properties.color are set. */
const DEFAULT_HOLOGRAM_COLOR = '#ffffff';
/** Default hologram size. */
const DEFAULT_HOLOGRAM_SIZE = 1;
/** Default hologram shape. */
const DEFAULT_HOLOGRAM_SHAPE: HologramShape = 'sphere';
/** Creation-puff color. */
const CREATION_PUFF_COLOR = '#00ffff';
/** Creation-puff particle count. */
const CREATION_PUFF_COUNT = 20;

/** Normalize a (possibly array-like) node.position to a concrete triple. */
function normalizePosition(
  position: OrbNode['position'],
): [number, number, number] {
  if (!position) return [0, 0, 0];
  if (Array.isArray(position)) {
    return [
      Number(position[0]) || 0,
      Number(position[1]) || 0,
      Number(position[2]) || 0,
    ];
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = position as any;
  return [Number(p[0]) || 0, Number(p[1]) || 0, Number(p[2]) || 0];
}

/**
 * Execute an `orb` AST node. Returns an ExecutionResult whose
 * `output` is the orbData record (or the updated existing orb
 * reference — same object, not a copy, for reference equality).
 */
export async function executeOrb(
  node: OrbNode,
  ctx: OrbExecutorContext,
): Promise<ExecutionResult> {
  const scale = ctx.getCurrentScale() || 1;

  // ── Phase 1: state reconciliation ────────────────────────────
  const existingRaw = ctx.getVariable(node.name);
  const existingOrb = isOrbData(existingRaw) ? existingRaw : undefined;
  const isUpdate = !!existingOrb;

  // ── Phase 2: position normalization + scale ──────────────────
  const pos = normalizePosition(node.position);
  const adjustedPos: [number, number, number] = [pos[0] * scale, pos[1] * scale, pos[2] * scale];

  if (node.position) {
    ctx.setSpatialPosition(node.name, adjustedPos);
  }

  // ── Phase 3: property evaluation ─────────────────────────────
  const evaluatedProperties: Record<string, HoloScriptValue> = {};

  if (Array.isArray(node.properties)) {
    for (const prop of node.properties as Array<{ key: string; value: HoloScriptValue }>) {
      const val = prop.value;
      evaluatedProperties[prop.key] = typeof val === 'string' ? ctx.evaluateExpression(val) : val;
    }
  } else if (node.properties) {
    for (const [key, val] of Object.entries(node.properties)) {
      evaluatedProperties[key] = typeof val === 'string' ? ctx.evaluateExpression(val) : val;
    }
  }

  // ── Phase 4: template merging (object-wins, template directives prepended) ─
  const orbNodeExt = node as OrbNode & { template?: string };
  if (orbNodeExt.template) {
    const tpl = ctx.getTemplate(orbNodeExt.template);
    if (tpl) {
      if (tpl.properties) {
        for (const [key, val] of Object.entries(tpl.properties)) {
          if (evaluatedProperties[key] === undefined) {
            evaluatedProperties[key] = typeof val === 'string' ? ctx.evaluateExpression(val) : val;
          }
        }
      }
      if (tpl.directives) {
        const existingDirectives = node.directives || [];
        // PRESERVED BEHAVIOR: mutate node.directives in place so
        // subsequent reads see the merged set. See slice-26 docstring.
        node.directives = [...tpl.directives, ...existingDirectives];
      }
    }
  }

  // ── Phase 5: hologram construction ───────────────────────────
  const hologram: HologramProperties = node.hologram
    ? {
        ...node.hologram,
        size:
          (node.hologram.size ||
            Number(evaluatedProperties.size) ||
            Number(evaluatedProperties.scale) ||
            DEFAULT_HOLOGRAM_SIZE) * scale,
      }
    : ({
        color: (evaluatedProperties.color as string) || DEFAULT_HOLOGRAM_COLOR,
        size:
          (Number(evaluatedProperties.size) ||
            Number(evaluatedProperties.scale) ||
            DEFAULT_HOLOGRAM_SIZE) * scale,
        shape: (evaluatedProperties.geometry || DEFAULT_HOLOGRAM_SHAPE) as HologramShape,
        glow: !!evaluatedProperties.glow,
        interactive: !!evaluatedProperties.interactive,
      } as HologramProperties);

  // ── Phase 6: migration logic (version upgrade) ───────────────
  if (isUpdate && node.template) {
    const tpl = ctx.getTemplate(node.template);
    const oldTpl = (existingOrb as Record<string, unknown>)?._templateRef as TemplateNode | undefined;

    if (tpl && oldTpl && tpl.version !== undefined && oldTpl.version !== undefined) {
      if (Number(tpl.version) > Number(oldTpl.version)) {
        logger.info(
          `Template version increase detected for ${node.name}: ${oldTpl.version} -> ${tpl.version}`,
        );
        const migrations = tpl.migrations || [];
        const migration = migrations.find((m) => m.fromVersion === Number(oldTpl.version));
        if (migration) {
          logger.info(`Executing migration from version ${oldTpl.version} for ${node.name}`);
          await ctx.executeMigrationBlock(
            existingOrb as unknown as Record<string, unknown>,
            migration,
          );
        }
      }
    }
  }

  // ── Phase 7: orbData build + mutation + apply + broadcast ────
  const orbData = isUpdate
    ? existingOrb!
    : ({
        __type: 'orb',
        id: node.name,
        name: node.name,
        created: Date.now(),
        // Methods bound to this orb — fire-and-forget through builtins registry
        show: () => ctx.getBuiltinFunction('show')!([node.name]),
        hide: () => ctx.getBuiltinFunction('hide')!([node.name]),
        pulse: (opts?: Record<string, unknown>) =>
          ctx.getBuiltinFunction('pulse')!([node.name, opts as HoloScriptValue]),
      } as Record<string, unknown>);

  // Update dynamic properties — preserve existing on update (state preservation)
  if (isUpdate) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (orbData as any).properties = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...((orbData as any).properties as Record<string, HoloScriptValue>),
      ...evaluatedProperties,
    };
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (orbData as any).properties = evaluatedProperties;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (orbData as any).directives = node.directives || [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (orbData as any).position = adjustedPos;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (orbData as any).hologram = hologram;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (orbData as any)._templateRef = node.template ? ctx.getTemplate(node.template) : undefined;

  if (!isUpdate) {
    ctx.setVariable(node.name, orbData as HoloScriptValue);
  }

  if (hologram) {
    ctx.setHologramState(node.name, hologram);
  }

  // Apply directives (@trait, @state, @method processing)
  if (node.directives) {
    ctx.applyDirectives(orbData as unknown as ASTNode);
  }

  if (!isUpdate) {
    ctx.createParticleEffect(`${node.name}_creation`, adjustedPos, CREATION_PUFF_COLOR, CREATION_PUFF_COUNT);
  }

  // Agent initialization — LLM-backed orbs get an AgentRuntime
  if (ctx.isAgent(node)) {
    if (!isUpdate || !ctx.getAgentRuntime(node.name)) {
      const agentRuntime = ctx.acquireAgentRuntime();
      agentRuntime.reset(node, ctx.parentRuntime);
      ctx.setAgentRuntime(node.name, agentRuntime);
      (orbData as Record<string, unknown>).state = agentRuntime.getState();

      // Bind agent action methods
      (node.directives as Array<{ type: string; name: string }>)
        ?.filter((d) => d.type === 'method')
        .forEach((m) => {
          (orbData as Record<string, unknown>)[m.name] = (...args: HoloScriptValue[]) =>
            agentRuntime.executeAction(m.name, args);
        });
    }
  }

  logger.info(isUpdate ? 'Orb updated' : 'Orb created', {
    name: node.name,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    properties: Object.keys((orbData as any).properties as Record<string, unknown>),
    scale,
  });

  // Broadcast to visualizer clients
  ctx.broadcast(isUpdate ? 'orb_updated' : 'orb_created', {
    orb: {
      id: node.name,
      name: node.name,
      position: adjustedPos,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      properties: (orbData as any).properties,
      hologram,
      traits:
        node.directives
          ?.filter((d) => d.type === 'trait')
          .map((d) => (d as unknown as { name: string }).name) || [],
    },
  });

  return {
    success: true,
    output: orbData as unknown as HoloScriptValue,
    hologram,
    spatialPosition: adjustedPos,
  };
}
