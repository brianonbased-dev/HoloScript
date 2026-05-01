import type { SceneMutation } from './types';

interface RenderedObject {
  name: string;
  type: string;
  primitive?: string;
  position?: number[];
  scale?: number[];
  color?: string;
  radius?: number;
  light_type?: string;
  projection?: string;
  direction?: number[];
  look_at?: number[];
  major_radius?: number;
  minor_radius?: number;
}

function parseCreateObject(input: Record<string, unknown>): RenderedObject {
  return {
    name: String(input.name ?? 'unnamed'),
    type: String(input.type ?? 'unknown'),
    primitive: input.primitive ? String(input.primitive) : undefined,
    position: Array.isArray(input.position) ? (input.position as number[]) : undefined,
    scale: Array.isArray(input.scale) ? (input.scale as number[]) : undefined,
    color: input.color ? String(input.color) : undefined,
    radius: typeof input.radius === 'number' ? input.radius : undefined,
    light_type: input.light_type ? String(input.light_type) : undefined,
    projection: input.projection ? String(input.projection) : undefined,
    direction: Array.isArray(input.direction) ? (input.direction as number[]) : undefined,
    look_at: Array.isArray(input.look_at) ? (input.look_at as number[]) : undefined,
    major_radius: typeof input.major_radius === 'number' ? input.major_radius : undefined,
    minor_radius: typeof input.minor_radius === 'number' ? input.minor_radius : undefined,
  };
}

function formatPosition(pos?: number[]): string {
  if (!pos || pos.length < 3) return 'unknown position';
  return `[${pos.map((n) => Number(n).toFixed(2)).join(', ')}]`;
}

function formatScale(scale?: number[]): string {
  if (!scale || scale.length < 3) return '';
  // If uniform, show single number
  if (scale[0] === scale[1] && scale[1] === scale[2]) {
    return `, size ${scale[0].toFixed(2)}`;
  }
  return `, scale [${scale.map((n) => Number(n).toFixed(2)).join(', ')}]`;
}

function describeObject(obj: RenderedObject): string {
  const parts: string[] = [];

  // Name and type
  parts.push(`- ${obj.name}: ${obj.type}`);

  // Geometry details
  if (obj.primitive) {
    parts.push(`  geometry: ${obj.primitive}`);
  }
  if (obj.radius !== undefined) {
    parts.push(`  radius: ${obj.radius.toFixed(2)}`);
  }
  if (obj.major_radius !== undefined) {
    parts.push(`  major radius: ${obj.major_radius.toFixed(2)}, minor: ${obj.minor_radius?.toFixed(2) ?? '?'}`);
  }

  // Transform
  parts.push(`  position: ${formatPosition(obj.position)}`);
  if (obj.scale) {
    const scaleStr = formatScale(obj.scale);
    if (scaleStr) parts.push(`  ${scaleStr.slice(2)}`); // remove leading ", "
  }

  // Appearance
  if (obj.color) {
    parts.push(`  color: ${obj.color}`);
  }

  // Special properties
  if (obj.light_type) {
    parts.push(`  light type: ${obj.light_type}`);
  }
  if (obj.projection) {
    parts.push(`  projection: ${obj.projection}`);
  }
  if (obj.direction) {
    parts.push(`  direction: ${formatPosition(obj.direction)}`);
  }
  if (obj.look_at) {
    parts.push(`  look-at: ${formatPosition(obj.look_at)}`);
  }

  return parts.join('\n');
}

export function renderMutationsToProse(mutations: SceneMutation[]): string {
  if (mutations.length === 0) return '_(no scene mutations)_';

  const createObjects: RenderedObject[] = [];
  const otherMutations: string[] = [];

  for (const m of mutations) {
    if (m.tool_name === 'create_object') {
      createObjects.push(parseCreateObject(m.input));
    } else {
      const status = m.sim_contract_passed === true
        ? 'passed'
        : m.sim_contract_passed === false
          ? 'rejected'
          : 'unknown';
      otherMutations.push(`- ${m.tool_name}: ${JSON.stringify(m.input)} [${status}]`);
    }
  }

  const lines: string[] = [];

  if (createObjects.length > 0) {
    lines.push(`## Created Objects (${createObjects.length})`);
    for (const obj of createObjects) {
      lines.push(describeObject(obj));
    }
  }

  if (otherMutations.length > 0) {
    lines.push('');
    lines.push(`## Other Scene Mutations (${otherMutations.length})`);
    lines.push(...otherMutations);
  }

  return lines.join('\n');
}
