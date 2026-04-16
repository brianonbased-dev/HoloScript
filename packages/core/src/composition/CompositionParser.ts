/**
 * CompositionParser — Pure Language-Level Composition Traversal
 *
 * Walks HoloScript AST trees (.holo and .hsplus) and produces normalized,
 * platform-independent intermediate data. No runtime, no fs, no platform.
 *
 * Consumers (Hololand, R3F, Babylon, etc.) take the ParsedComposition output
 * and instantiate their own world/scene objects.
 *
 * Migrated from Hololand CompositionLoader (Tier 3, 2026-03-19).
 * @see packages/platform/world/src/loaders/CompositionLoader.ts
 *
 * @packageDocumentation
 */

import { parseHolo } from '../parser/HoloCompositionParser';
import { parse as parseHoloScriptPlus } from '../parser/HoloScriptPlusParser';
import type {
  HoloComposition,
  HoloEnvironment,
  HoloTemplate,
  HoloObjectDecl,
  HoloSpatialGroup,
  HoloLogic,
} from '../parser/HoloCompositionTypes';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES — platform-independent intermediate representation
// ═══════════════════════════════════════════════════════════════════════════

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface ParsedObject {
  id: string;
  type: string;
  position: Vec3;
  scale: Vec3;
  metadata: Record<string, unknown>;
  children: ParsedObject[];
}

export interface ActionDefinition {
  name: string;
  params: string[];
  body: unknown;
}

export interface TemplateDefinition {
  name: string;
  traits: string[];
  state: Record<string, unknown>;
  actions: Map<string, ActionDefinition>;
  children: HoloObjectDecl[];
}

export interface EnvironmentConfig {
  theme?: string;
  skybox?: string;
  ambientLight?: number;
  grid?: boolean;
  fog?: { color: string; near: number; far: number };
}

export interface CompositionLogic {
  actions: Map<string, ActionDefinition>;
  eventHandlers: Map<string, ActionDefinition>;
  frameHandlers: ActionDefinition[];
  keyboardHandlers: Map<string, ActionDefinition>;
}

export interface ParsedComposition {
  name: string;
  objects: ParsedObject[];
  state: Record<string, unknown>;
  logic: CompositionLogic;
  templates: Map<string, TemplateDefinition>;
  environment: EnvironmentConfig;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS — pure property extraction
// ═══════════════════════════════════════════════════════════════════════════

interface GenericProperty {
  key: string;
  value: unknown;
}

function getProp<T = unknown>(props: unknown[] | undefined, key: string): T | undefined {
  if (!props) return undefined;
  const found = (props as GenericProperty[]).find((p) => p.key === key);
  return found ? (found.value as T) : undefined;
}

function getPropsAsRecord(props: unknown[] | undefined): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (!props) return result;
  for (const p of props as GenericProperty[]) {
    result[p.key] = p.value;
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// PARSER
// ═══════════════════════════════════════════════════════════════════════════

export class CompositionParser {
  private objects: ParsedObject[] = [];
  private templates: Map<string, TemplateDefinition> = new Map();
  private state: Record<string, unknown> = {};
  private logic: CompositionLogic = {
    actions: new Map(),
    eventHandlers: new Map(),
    frameHandlers: [],
    keyboardHandlers: new Map(),
  };
  private environment: EnvironmentConfig = {};
  private name = 'Untitled';

  /**
   * Parse a HoloScript source string into a platform-independent representation.
   */
  parse(source: string, fileType: 'holo' | 'hsplus' | 'hs' = 'holo'): ParsedComposition {
    if (fileType === 'holo') {
      const result = parseHolo(source);
      if (!result.success || !result.ast) {
        throw new CompositionParseError('Parse failed', result.errors || []);
      }
      this.processHoloComposition(result.ast);
    } else {
      const result = parseHoloScriptPlus(source);
      if (!result.success) {
        throw new CompositionParseError('Parse failed', result.errors || []);
      }
      this.processHsPlusAST(result.ast);
    }

    return {
      name: this.name,
      objects: this.objects,
      state: this.state,
      logic: this.logic,
      templates: this.templates,
      environment: this.environment,
    };
  }

  // ─── .holo processing ───────────────────────────────────────────────

  private processHoloComposition(composition: HoloComposition): void {
    if (composition.name) this.name = composition.name;

    if (composition.environment) {
      this.processEnvironment(composition.environment);
    }

    if (composition.state) {
      this.state = getPropsAsRecord(composition.state.properties);
    }

    for (const template of composition.templates || []) {
      this.processTemplate(template);
    }

    for (const group of composition.spatialGroups || []) {
      this.processSpatialGroup(group);
    }

    for (const obj of composition.objects || []) {
      this.objects.push(this.processObject(obj));
    }

    if (composition.logic) {
      this.processLogic(composition.logic);
    }
  }

  private processEnvironment(env: HoloEnvironment): void {
    this.environment = {
      theme: getProp<string>(env.properties, 'theme'),
      skybox: getProp<string>(env.properties, 'skybox'),
      ambientLight: getProp<number>(env.properties, 'ambient_light'),
      grid: getProp<boolean>(env.properties, 'grid'),
      fog: getProp<{ color: string; near: number; far: number }>(env.properties, 'fog'),
    };
  }

  private processTemplate(template: HoloTemplate): void {
    const traitsFromProps = getProp<string[]>(template.properties, 'traits') || [];

    const def: TemplateDefinition = {
      name: template.name,
      traits: traitsFromProps,
      state: template.state ? getPropsAsRecord(template.state.properties) : {},
      actions: new Map(),
      children: [],
    };

    for (const action of template.actions || []) {
      def.actions.set(action.name, {
        name: action.name,
        params: action.parameters?.map((p: any) => p.name) || [],
        body: action.body,
      });
    }

    this.templates.set(template.name, def);
  }

  private processSpatialGroup(group: HoloSpatialGroup, parentOffset?: Vec3): void {
    const positionValue = getProp(group.properties, 'position');
    const groupPos = parsePosition(positionValue);
    const offset = parentOffset
      ? {
          x: groupPos.x + parentOffset.x,
          y: groupPos.y + parentOffset.y,
          z: groupPos.z + parentOffset.z,
        }
      : groupPos;

    for (const obj of group.objects || []) {
      this.objects.push(this.processObject(obj, offset));
    }

    for (const subGroup of group.groups || []) {
      this.processSpatialGroup(subGroup, offset);
    }
  }

  private processObject(obj: HoloObjectDecl, offset?: Vec3): ParsedObject {
    let position = parsePosition(getProp(obj.properties, 'position'));
    if (offset) {
      position = {
        x: position.x + offset.x,
        y: position.y + offset.y,
        z: position.z + offset.z,
      };
    }

    const template = obj.template ? this.templates.get(obj.template) : undefined;
    const allProps = getPropsAsRecord(obj.properties);
    const geometry = getProp<string>(obj.properties, 'geometry') || 'box';
    const size = getProp(obj.properties, 'size');
    const scale = getProp(obj.properties, 'scale');
    const color = getProp<string>(obj.properties, 'color');
    const material = getProp<string>(obj.properties, 'material');
    const traits = getProp<string[]>(obj.properties, 'traits') || [];

    const children: ParsedObject[] = [];
    for (const child of obj.children || []) {
      children.push(this.processObject(child, position));
    }

    return {
      id: obj.name,
      type: geometry,
      position,
      scale: parseScale(size || scale),
      metadata: {
        ...template?.state,
        ...allProps,
        traits: [...traits, ...(template?.traits || [])],
        color,
        material,
      },
      children,
    };
  }

  private processLogic(logic: HoloLogic): void {
    for (const action of logic.actions || []) {
      this.logic.actions.set(action.name, {
        name: action.name,
        params: action.parameters?.map((p: any) => p.name) || [],
        body: action.body,
      });
    }

    for (const handler of logic.handlers || []) {
      if (handler.event === 'frame') {
        this.logic.frameHandlers.push({ name: 'on_frame', params: [], body: handler.body });
      } else if (handler.event === 'keydown') {
        this.logic.keyboardHandlers.set('on_keydown', {
          name: 'on_keydown',
          params: ['event'],
          body: handler.body,
        });
      } else {
        this.logic.eventHandlers.set(handler.event, {
          name: handler.event,
          params: handler.parameters?.map((p: any) => p.name) || ['event'],
          body: handler.body,
        });
      }
    }
  }

  // ─── .hsplus processing ─────────────────────────────────────────────

  private processHsPlusAST(ast: unknown): void {
    // @ts-expect-error
    const directives = ast.body || ast.root?.directives || [];

    for (const d of directives) {
      if (d.type === 'orb' || d.type === 'object') {
        this.objects.push(this.processHsPlusObject(d));
      } else if (d.type === 'function') {
        this.logic.actions.set(d.name, { name: d.name, params: d.params || [], body: d.body });
      }
    }
  }

  private processHsPlusObject(d: unknown): ParsedObject {
    return {
      // @ts-expect-error
      id: d.name,
      // @ts-expect-error
      type: d.type === 'orb' ? 'sphere' : d.props?.geometry || 'box',
      // @ts-expect-error
      position: parsePosition(d.props?.position),
      // @ts-expect-error
      scale: parseScale(d.props?.scale),
      // @ts-expect-error
      metadata: { ...d.props, traits: d.traits || [] },
      children: [],
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC HELPERS — exported for reuse
// ═══════════════════════════════════════════════════════════════════════════

export function parsePosition(pos: unknown): Vec3 {
  if (!pos) return { x: 0, y: 0, z: 0 };
  if (Array.isArray(pos)) {
    return { x: Number(pos[0]) || 0, y: Number(pos[1]) || 0, z: Number(pos[2]) || 0 };
  }
  if (typeof pos === 'object' && pos !== null) {
    const p = pos as Record<string, unknown>;
    if ('x' in p || 'y' in p || 'z' in p) {
      return {
        x: Number(p.x) || 0,
        y: Number(p.y) || 0,
        z: Number(p.z) || 0,
      };
    }
    return {
      x: Number(p['0']) || 0,
      y: Number(p['1']) || 0,
      z: Number(p['2']) || 0,
    };
  }
  return { x: 0, y: 0, z: 0 };
}

export function parseScale(scale: unknown): Vec3 {
  if (!scale) return { x: 1, y: 1, z: 1 };
  if (typeof scale === 'number') return { x: scale, y: scale, z: scale };
  if (Array.isArray(scale)) {
    if (scale.length === 2)
      return { x: Number(scale[0]) || 1, y: Number(scale[1]) || 1, z: 1 };
    return { x: Number(scale[0]) || 1, y: Number(scale[1]) || 1, z: Number(scale[2]) || 1 };
  }
  if (typeof scale === 'object' && scale !== null) {
    const s = scale as Record<string, unknown>;
    if ('x' in s || 'y' in s || 'z' in s) {
      return {
        x: Number(s.x) || 1,
        y: Number(s.y) || 1,
        z: Number(s.z) || 1,
      };
    }
    return {
      x: Number(s['0']) || 1,
      y: Number(s['1']) || 1,
      z: Number(s['2']) || 1,
    };
  }
  return { x: 1, y: 1, z: 1 };
}

// ═══════════════════════════════════════════════════════════════════════════
// ERROR CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class CompositionParseError extends Error {
  constructor(
    message: string,
    public errors: unknown[]
  ) {
    super(`${message}: ${JSON.stringify(errors)}`);
    this.name = 'CompositionParseError';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CONVENIENCE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

export function parseComposition(
  source: string,
  fileType: 'holo' | 'hsplus' | 'hs' = 'holo'
): ParsedComposition {
  const parser = new CompositionParser();
  return parser.parse(source, fileType);
}

export function parseHoloComposition(source: string): ParsedComposition {
  return parseComposition(source, 'holo');
}

export function parseHsPlusComposition(source: string): ParsedComposition {
  return parseComposition(source, 'hsplus');
}
