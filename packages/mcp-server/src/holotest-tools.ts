/**
 * HoloTest MCP Tools — execute_holotest
 *
 * Enables AI agents to run spatial assertions against HoloScript scenes and
 * receive structured semantic feedback for self-correction loops.
 *
 * Tool: execute_holotest
 *
 * Workflow:
 *   1. Parse the scene code (HoloScript / .holo)
 *   2. Extract objects with resolved world-space bounds
 *   3. Run spatial assertions (explicit or auto-detect all intersecting pairs)
 *   4. Return JSON-RPC payload with AgentFeedback for each failure
 *
 * Self-contained: does NOT depend on @holoscript/test (which requires vitest).
 * BoundingBox math is inlined so this file can run inside the mcp-server process.
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { parseHolo, HoloScriptPlusParser } from '@holoscript/core';

// ── Inline spatial math (mirrors packages/test/src/spatial/) ──────────────

interface Vec3 { x: number; y: number; z: number; }

class BoundingBox {
  constructor(readonly min: Readonly<Vec3>, readonly max: Readonly<Vec3>) {}

  static fromMinMax(min: Vec3, max: Vec3): BoundingBox {
    return new BoundingBox(
      { x: Math.min(min.x, max.x), y: Math.min(min.y, max.y), z: Math.min(min.z, max.z) },
      { x: Math.max(min.x, max.x), y: Math.max(min.y, max.y), z: Math.max(min.z, max.z) }
    );
  }

  static fromBottomCenter(bc: Vec3, size: Vec3): BoundingBox {
    const hx = Math.abs(size.x) / 2, hz = Math.abs(size.z) / 2;
    return new BoundingBox(
      { x: bc.x - hx, y: bc.y, z: bc.z - hz },
      { x: bc.x + hx, y: bc.y + Math.abs(size.y), z: bc.z + hz }
    );
  }

  center(): Vec3 {
    return { x: (this.min.x + this.max.x) / 2, y: (this.min.y + this.max.y) / 2, z: (this.min.z + this.max.z) / 2 };
  }

  contains(p: Vec3): boolean {
    return p.x >= this.min.x && p.x <= this.max.x && p.y >= this.min.y && p.y <= this.max.y && p.z >= this.min.z && p.z <= this.max.z;
  }

  intersects(o: BoundingBox): boolean {
    return this.min.x <= o.max.x && this.max.x >= o.min.x &&
           this.min.y <= o.max.y && this.max.y >= o.min.y &&
           this.min.z <= o.max.z && this.max.z >= o.min.z;
  }

  intersectionVolume(o: BoundingBox): number {
    const ox = Math.min(this.max.x, o.max.x) - Math.max(this.min.x, o.min.x);
    const oy = Math.min(this.max.y, o.max.y) - Math.max(this.min.y, o.min.y);
    const oz = Math.min(this.max.z, o.max.z) - Math.max(this.min.z, o.min.z);
    if (ox <= 0 || oy <= 0 || oz <= 0) return 0;
    return ox * oy * oz;
  }

  penetrationDepth(o: BoundingBox): Vec3 {
    if (!this.intersects(o)) return { x: 0, y: 0, z: 0 };
    return {
      x: Math.min(this.max.x, o.max.x) - Math.max(this.min.x, o.min.x),
      y: Math.min(this.max.y, o.max.y) - Math.max(this.min.y, o.min.y),
      z: Math.min(this.max.z, o.max.z) - Math.max(this.min.z, o.min.z),
    };
  }

  toString(): string {
    const { min: n, max: x } = this;
    return `BoundingBox(${n.x},${n.y},${n.z}→${x.x},${x.y},${x.z})`;
  }
}

class SpatialEntity {
  constructor(readonly id: string, public bounds: BoundingBox, readonly tags: string[] = []) {}

  static at(id: string, pos: [number, number, number], size: [number, number, number]): SpatialEntity {
    return new SpatialEntity(id, BoundingBox.fromBottomCenter(
      { x: pos[0], y: pos[1], z: pos[2] },
      { x: size[0], y: size[1], z: size[2] }
    ));
  }

  get position(): Vec3 {
    const c = this.bounds.center(); const s = { x: this.bounds.max.x - this.bounds.min.x, y: this.bounds.max.y - this.bounds.min.y, z: this.bounds.max.z - this.bounds.min.z };
    return { x: c.x, y: c.y - s.y / 2, z: c.z };
  }

  intersects(other: SpatialEntity | BoundingBox): boolean {
    return this.bounds.intersects(other instanceof SpatialEntity ? other.bounds : other);
  }

  isWithinVolume(box: BoundingBox): boolean {
    return box.contains(this.bounds.min) && box.contains(this.bounds.max);
  }
}

// ── Result types (mirrors packages/test/src/reporter/) ────────────────────

type SpatialErrorType = 'IntersectionViolation' | 'OutOfBounds' | 'ValueViolation' | 'PositionViolation' | 'PhysicsViolation';

interface AgentFeedback {
  error_type: SpatialErrorType;
  semantic_message: string;
  spatial_hint: string;
  fix_suggestion: string;
  affected_lines: number[];
}

interface HolotestResult {
  tool_name: 'execute_holotest';
  status: 'passed' | 'failed' | 'error';
  summary: string;
  tests: TestReport[];
  agent_feedback?: AgentFeedback;
}

interface TestReport {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  duration_ms: number;
  error?: AgentFeedback;
}

// ── Semantic reporting ─────────────────────────────────────────────────────

function minAxis(pen: Vec3): { axis: 'X' | 'Y' | 'Z'; depth: number } {
  const ax = Math.abs(pen.x), ay = Math.abs(pen.y), az = Math.abs(pen.z);
  if (ay <= ax && ay <= az) return { axis: 'Y', depth: pen.y };
  if (ax <= az) return { axis: 'X', depth: pen.x };
  return { axis: 'Z', depth: pen.z };
}

function f(n: number) { return n.toFixed(3); }

function intersectionFeedback(a: SpatialEntity, b: SpatialEntity): AgentFeedback {
  const pen = a.bounds.penetrationDepth(b.bounds);
  const { axis, depth } = minAxis(pen);
  const vol = a.bounds.intersectionVolume(b.bounds);
  const sign = depth > 0 ? '+' : '';
  const bA = a.bounds, bB = b.bounds;
  let desc = `'${a.id}' and '${b.id}' are clipping (${f(vol)} m³ overlap)`;
  if (axis === 'Y') {
    desc = `'${a.id}' bottom Y (${f(bA.min.y)}m) overlaps '${b.id}' top Y (${f(bB.max.y)}m) by ${f(Math.abs(depth))}m`;
  }
  return {
    error_type: 'IntersectionViolation',
    semantic_message: `SpatialAssertionError: ${desc}.`,
    spatial_hint: `Smallest penetration axis is ${axis} (${f(Math.abs(depth))}m). Moving on ${axis} is the cheapest fix.`,
    fix_suggestion: `Adjust ${axis} of '${a.id}' by ${sign}${f(depth)} units to resolve clipping.`,
    affected_lines: [],
  };
}

function outOfBoundsFeedback(entity: SpatialEntity, container: BoundingBox): AgentFeedback {
  const b = entity.bounds; const c = container;
  const violations: string[] = [];
  if (b.min.x < c.min.x) violations.push(`min.x (${f(b.min.x)}) < ${f(c.min.x)}: shift +X ${f(c.min.x - b.min.x)}m`);
  if (b.min.y < c.min.y) violations.push(`min.y (${f(b.min.y)}) < ${f(c.min.y)}: shift +Y ${f(c.min.y - b.min.y)}m`);
  if (b.min.z < c.min.z) violations.push(`min.z (${f(b.min.z)}) < ${f(c.min.z)}: shift +Z ${f(c.min.z - b.min.z)}m`);
  if (b.max.x > c.max.x) violations.push(`max.x (${f(b.max.x)}) > ${f(c.max.x)}: shift -X ${f(b.max.x - c.max.x)}m`);
  if (b.max.y > c.max.y) violations.push(`max.y (${f(b.max.y)}) > ${f(c.max.y)}: shift -Y ${f(b.max.y - c.max.y)}m`);
  if (b.max.z > c.max.z) violations.push(`max.z (${f(b.max.z)}) > ${f(c.max.z)}: shift -Z ${f(b.max.z - c.max.z)}m`);
  return {
    error_type: 'OutOfBounds',
    semantic_message: `SpatialAssertionError: '${entity.id}' is outside its container.\n${violations.map(v => `  · ${v}`).join('\n')}`,
    spatial_hint: `Container: ${container}. Entity: ${entity.bounds}.`,
    fix_suggestion: violations[0] ?? 'Adjust entity position or size.',
    affected_lines: [],
  };
}

function missingFeedback(detail: string): AgentFeedback {
  return { error_type: 'ValueViolation', semantic_message: detail, spatial_hint: 'Check entity IDs match names in the scene.', fix_suggestion: 'Run execute_holotest with the full scene code.', affected_lines: [] };
}

// ── Tool Definitions ───────────────────────────────────────────────────────

export const holotestTools: Tool[] = [
  {
    name: 'execute_holotest',
    description:
      'Execute spatial assertions against a HoloScript scene and return semantic feedback ' +
      'for AI agent self-correction. Parses the scene to extract object bounds, then runs: ' +
      '(1) explicit assertions you specify, or (2) auto-detects all intersecting object pairs. ' +
      'Returns structured JSON-RPC with a semantic_message, spatial_hint, and fix_suggestion ' +
      'for each failure — designed to feed directly into an LLM self-correction loop.',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description:
            'HoloScript scene code (.hs, .hsplus, or .holo). Objects with position/size properties ' +
            'will be extracted and tested.',
        },
        format: {
          type: 'string',
          enum: ['holo', 'hsplus', 'hs', 'auto'],
          description: 'Code format. Defaults to "auto" (detects from content).',
        },
        assertions: {
          type: 'array',
          description:
            'Optional list of explicit spatial assertions to run. ' +
            'If omitted, all object pairs are checked for unexpected intersections.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Test name (used in report).' },
              type: {
                type: 'string',
                enum: ['no_intersect', 'intersects', 'within_volume', 'poly_count'],
                description:
                  'Assertion type: ' +
                  '"no_intersect" = expect no clipping, ' +
                  '"intersects" = expect overlap, ' +
                  '"within_volume" = entity must be inside a box, ' +
                  '"poly_count" = numeric limit check.',
              },
              entityA: { type: 'string', description: 'ID of the first entity.' },
              entityB: { type: 'string', description: 'ID of the second entity (for pair assertions).' },
              container: {
                type: 'object',
                description: 'For within_volume: { min: [x,y,z], max: [x,y,z] }',
                properties: {
                  min: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 },
                  max: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 },
                },
              },
              value: { type: 'number', description: 'For poly_count: the actual value to check.' },
              limit: { type: 'number', description: 'For poly_count: the maximum allowed value.' },
            },
            required: ['type'],
          },
        },
        auto_check_intersections: {
          type: 'boolean',
          description:
            'When true (default when no assertions specified), automatically checks all object pairs ' +
            'for unintended intersections and reports clipping issues.',
        },
      },
      required: ['code'],
    },
  },
];

// ── Handler ────────────────────────────────────────────────────────────────

export async function handleHolotestTool(
  name: string,
  args: Record<string, unknown>
): Promise<HolotestResult | null> {
  if (name !== 'execute_holotest') return null;
  return runExecuteHolotest(args);
}

// ── Execution Engine ───────────────────────────────────────────────────────

interface Assertion {
  name?: string;
  type: 'no_intersect' | 'intersects' | 'within_volume' | 'poly_count';
  entityA?: string;
  entityB?: string;
  container?: { min: [number, number, number]; max: [number, number, number] };
  value?: number;
  limit?: number;
}

async function runExecuteHolotest(args: Record<string, unknown>): Promise<HolotestResult> {
  const code = args.code as string;
  const format = (args.format as string | undefined) ?? 'auto';
  const assertions = (args.assertions as Assertion[] | undefined) ?? [];
  const autoCheck = args.auto_check_intersections !== false;

  // 1. Parse & extract entities
  let entities: SpatialEntity[];
  try {
    entities = extractEntities(code, format);
  } catch (err) {
    return {
      tool_name: 'execute_holotest',
      status: 'error',
      summary: `Parse error: ${(err as Error).message}`,
      tests: [],
      agent_feedback: {
        error_type: 'ValueViolation',
        semantic_message: `Failed to parse HoloScript code: ${(err as Error).message}`,
        spatial_hint: 'Check that the code is valid HoloScript (.hs, .hsplus, or .holo).',
        fix_suggestion: 'Run validate_holoscript first to verify syntax.',
        affected_lines: [],
      },
    };
  }

  const entityMap = new Map<string, SpatialEntity>(entities.map((e) => [e.id, e]));

  // 2. Run assertions
  const tests: TestReport[] = [];
  const start = Date.now();

  // Explicit assertions
  for (const assertion of assertions) {
    const t0 = Date.now();
    const report = runAssertion(assertion, entityMap);
    tests.push({ ...report, duration_ms: Date.now() - t0 });
  }

  // Auto-intersection check (all pairs)
  if (assertions.length === 0 && autoCheck && entities.length >= 2) {
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const a = entities[i];
        const b = entities[j];
        const t0 = Date.now();
        if (a.intersects(b)) {
          tests.push({
            name: `[auto] no_intersect: '${a.id}' vs '${b.id}'`,
            status: 'failed',
            duration_ms: Date.now() - t0,
            error: intersectionFeedback(a, b),
          });
        } else {
          tests.push({
            name: `[auto] no_intersect: '${a.id}' vs '${b.id}'`,
            status: 'passed',
            duration_ms: Date.now() - t0,
          });
        }
      }
    }
  }

  const failed = tests.filter((t) => t.status === 'failed');
  const passed = tests.filter((t) => t.status === 'passed');

  const status: HolotestResult['status'] = failed.length > 0 ? 'failed' : 'passed';
  const summary = `${tests.length} tests — ${passed.length} passed, ${failed.length} failed (${Date.now() - start}ms)`;

  const result: HolotestResult = {
    tool_name: 'execute_holotest',
    status,
    summary,
    tests,
  };

  if (failed.length > 0 && failed[0].error) {
    result.agent_feedback = failed[0].error;
  }

  return result;
}

function runAssertion(a: Assertion, entities: Map<string, SpatialEntity>): Omit<TestReport, 'duration_ms'> {
  const testName = a.name ?? `${a.type}(${a.entityA ?? '?'}, ${a.entityB ?? a.type})`;

  switch (a.type) {
    case 'no_intersect':
    case 'intersects': {
      if (!a.entityA || !a.entityB) {
        return { name: testName, status: 'failed', error: missingFeedback(`'${testName}': entityA and entityB required`) };
      }
      const ea = entities.get(a.entityA);
      const eb = entities.get(a.entityB);
      if (!ea || !eb) {
        const missing = !ea ? a.entityA : a.entityB;
        return { name: testName, status: 'failed', error: missingFeedback(`'${testName}': Entity '${missing}' not found in parsed scene.`) };
      }
      const overlaps = ea.intersects(eb);
      const expectOverlap = a.type === 'intersects';
      if (overlaps === expectOverlap) {
        return { name: testName, status: 'passed' };
      }
      return {
        name: testName,
        status: 'failed',
        error: intersectionFeedback(ea, eb),
      };
    }

    case 'within_volume': {
      if (!a.entityA || !a.container) {
        return { name: testName, status: 'failed', error: missingFeedback(`'${testName}': entityA and container required`) };
      }
      const ea = entities.get(a.entityA);
      if (!ea) {
        return { name: testName, status: 'failed', error: missingFeedback(`'${testName}': Entity '${a.entityA}' not found.`) };
      }
      const box = BoundingBox.fromMinMax(
        { x: a.container.min[0], y: a.container.min[1], z: a.container.min[2] },
        { x: a.container.max[0], y: a.container.max[1], z: a.container.max[2] }
      );
      if (ea.isWithinVolume(box)) {
        return { name: testName, status: 'passed' };
      }
      return {
        name: testName,
        status: 'failed',
        error: outOfBoundsFeedback(ea, box),
      };
    }

    case 'poly_count': {
      if (a.value === undefined || a.limit === undefined) {
        return { name: testName, status: 'failed', error: missingFeedback(`'${testName}': value and limit required for poly_count`) };
      }
      if (a.value <= a.limit) {
        return { name: testName, status: 'passed' };
      }
      return {
        name: testName,
        status: 'failed',
        error: {
          error_type: 'ValueViolation',
          semantic_message: `SceneViolation: poly count ${a.value} exceeds limit ${a.limit} (excess: ${a.value - a.limit}).`,
          spatial_hint: 'Reduce mesh complexity or use LOD objects.',
          fix_suggestion: `Reduce polyCount by at least ${a.value - a.limit} triangles.`,
          affected_lines: [],
        },
      };
    }

    default:
      return { name: testName, status: 'failed', error: missingFeedback(`Unknown assertion type: ${a.type}`) };
  }
}

// ── Scene Parser ───────────────────────────────────────────────────────────

/**
 * Parse HoloScript code and extract SpatialEntity objects from `object` definitions
 * that have position and size/geometry properties.
 */
function extractEntities(code: string, format: string): SpatialEntity[] {
  const entities: SpatialEntity[] = [];

  // Detect format
  const isHolo =
    format === 'holo' ||
    (format === 'auto' && /composition\s+"/.test(code) && !/template\s+"|@\w+/.test(code));

  // Try structured parse first
  try {
    if (isHolo) {
      const ast = parseHolo(code);
      extractFromHoloAst(ast, entities);
    } else {
      const parser = new HoloScriptPlusParser();
      const ast = parser.parse(code);
      extractFromHsplusAst(ast, entities);
    }
  } catch {
    // Fall back to regex extraction if parser fails
  }

  // Regex fallback / supplement: find object "Name" { position: [...] } blocks
  if (entities.length === 0) {
    extractViaRegex(code, entities);
  }

  return entities;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractFromHoloAst(ast: any, out: SpatialEntity[]): void {
  if (!ast || typeof ast !== 'object') return;
  const objects = findNodes(ast, 'object');
  for (const obj of objects) {
    const entity = astNodeToEntity(obj);
    if (entity) out.push(entity);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractFromHsplusAst(ast: any, out: SpatialEntity[]): void {
  if (!ast || typeof ast !== 'object') return;
  const objects = findNodes(ast, 'object');
  for (const obj of objects) {
    const entity = astNodeToEntity(obj);
    if (entity) out.push(entity);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findNodes(node: any, type: string, acc: any[] = []): any[] {
  if (!node || typeof node !== 'object') return acc;
  if (node.type === type || node.nodeType === type || node.kind === type) acc.push(node);
  for (const val of Object.values(node)) {
    if (Array.isArray(val)) {
      for (const child of val) findNodes(child, type, acc);
    } else if (val && typeof val === 'object') {
      findNodes(val, type, acc);
    }
  }
  return acc;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function astNodeToEntity(node: any): SpatialEntity | null {
  // Extract id/name
  const id: string = node.name ?? node.id ?? node.identifier ?? 'unknown';

  // Extract position
  const pos = extractVec3Property(node, ['position', 'pos', 'location']);
  if (!pos) return null;

  // Extract size
  const size = extractVec3Property(node, ['size', 'scale', 'dimensions', 'extents']);

  if (size) {
    return SpatialEntity.at(id, [pos.x, pos.y, pos.z], [size.x, size.y, size.z]);
  }

  // If no size, use a default 1m³ cube
  return SpatialEntity.at(id, [pos.x, pos.y, pos.z], [1, 1, 1]);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractVec3Property(node: any, keys: string[]): Vec3 | null {
  for (const key of keys) {
    const val = node[key] ?? node.properties?.[key] ?? node.props?.[key];
    if (!val) continue;
    if (Array.isArray(val) && val.length >= 3) {
      return { x: Number(val[0]), y: Number(val[1]), z: Number(val[2]) };
    }
    if (typeof val === 'object' && 'x' in val) {
      return { x: Number(val.x), y: Number(val.y ?? 0), z: Number(val.z ?? 0) };
    }
  }
  return null;
}

/**
 * Regex-based extraction for when the AST parser doesn't find positioned objects.
 * Handles: position: [x, y, z]  and  size: [w, h, d]
 */
function extractViaRegex(code: string, out: SpatialEntity[]): void {
  // Match: object "Name" { ... } blocks
  const objectBlockRE = /object\s+"([^"]+)"\s*(?:using\s+"[^"]+"\s*)?\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/gs;
  let match: RegExpExecArray | null;

  while ((match = objectBlockRE.exec(code)) !== null) {
    const id = match[1];
    const body = match[2];

    const pos = extractArrayProp(body, 'position');
    if (!pos) continue;

    const size = extractArrayProp(body, 'size') ?? extractArrayProp(body, 'scale');

    out.push(
      SpatialEntity.at(id, [pos[0], pos[1], pos[2]], size ? [size[0], size[1], size[2]] : [1, 1, 1])
    );
  }
}

function extractArrayProp(body: string, key: string): [number, number, number] | null {
  const re = new RegExp(`${key}\\s*:\\s*\\[\\s*([\\d.+-]+)\\s*,\\s*([\\d.+-]+)\\s*,\\s*([\\d.+-]+)\\s*\\]`);
  const m = re.exec(body);
  if (!m) return null;
  return [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])];
}
