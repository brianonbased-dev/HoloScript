import { getGoldenCase } from './golden-cases';
import type { SceneMutation, Task } from './types';

/**
 * Deterministic verifier — checks basic spatial/count criteria from mutations
 * without LLM interpretation. Returns partial verdicts that the judge can
 * override with nuance, but these are ground-truth for counts, positions,
 * colors, and simple geometric relationships.
 */

interface VerificationResult {
  criterion_id: string;
  passed: boolean;
  rationale: string;
}

interface ParsedObject {
  name: string;
  type: string;
  primitive?: string;
  position: [number, number, number];
  scale: [number, number, number];
  rotation?: [number, number, number] | [number, number, number, number];
  color?: string;
  radius?: number;
  light_type?: string;
  projection?: string;
}

function parseObjects(mutations: SceneMutation[]): ParsedObject[] {
  return mutations
    .filter((m) => m.tool_name === 'create_object')
    .map((m) => {
      const input = m.input;
      const pos = Array.isArray(input.position) ? input.position : [0, 0, 0];
      return {
        name: String(input.name ?? 'unnamed'),
        type: String(input.type ?? 'mesh'),
        primitive: input.primitive ? String(input.primitive) : undefined,
        position: [Number(pos[0] ?? 0), Number(pos[1] ?? 0), Number(pos[2] ?? 0)] as [number, number, number],
        scale: Array.isArray(input.scale)
          ? ([Number(input.scale[0] ?? 1), Number(input.scale[1] ?? 1), Number(input.scale[2] ?? 1)] as [number, number, number])
          : [1, 1, 1],
      rotation: Array.isArray(input.rotation) && (input.rotation.length === 3 || input.rotation.length === 4)
          ? (input.rotation.map((n: unknown) => Number(n ?? 0)) as [number, number, number] | [number, number, number, number])
          : undefined,
      color: input.color ? String(input.color) : undefined,
      radius: typeof input.radius === 'number' ? input.radius : undefined,
      light_type: input.light_type ? String(input.light_type) : undefined,
      projection: input.projection ? String(input.projection) : undefined,
      };
    });
}

function dist(a: [number, number, number], b: [number, number, number]): number {
  return Math.sqrt((a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2);
}

function within(a: number, b: number, tol: number): boolean {
  return Math.abs(a - b) <= tol;
}

function isGrayish(color: string | undefined): boolean {
  const c = (color ?? '').toLowerCase().trim();
  if (!c) return false;
  // Named colors
  if (c.includes('gray') || c.includes('grey') || c.includes('silver') || c.includes('metal')) return true;
  // Hex gray: R ≈ G ≈ B (tolerance 8/255 ≈ 0.03)
  if (c.startsWith('#')) {
    const hex = c.slice(1);
    if (hex.length === 3 || hex.length === 6) {
      const r = parseInt(hex.length === 3 ? hex[0] + hex[0] : hex.slice(0, 2), 16);
      const g = parseInt(hex.length === 3 ? hex[1] + hex[1] : hex.slice(2, 4), 16);
      const b = parseInt(hex.length === 3 ? hex[2] + hex[2] : hex.slice(4, 6), 16);
      if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
        const maxDiff = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
        return maxDiff <= 16; // ≈ 6% tolerance
      }
    }
  }
  return false;
}

function extractYRotationEuler(rotation: [number, number, number] | [number, number, number, number] | undefined): number | undefined {
  if (!rotation) return undefined;
  if (rotation.length === 3) {
    const y = rotation[1];
    // Could be radians or degrees. Normalise to degrees.
    if (Math.abs(y) <= 2 * Math.PI) {
      // Likely radians — but 45° = 0.785 rad, 90° = 1.571 rad. If y > 6 it's definitely degrees.
      const deg = y > 6 ? y : (y * 180) / Math.PI;
      return deg;
    }
    return y;
  }
  // Quaternion → euler Y (simplified; assumes ZYX order, extracts yaw)
  const [x, y, z, w] = rotation;
  const sinr_cosp = 2 * (w * y - z * x);
  const cosr_cosp = 1 - 2 * (x * x + y * y);
  const yaw = Math.atan2(sinr_cosp, cosr_cosp);
  return (yaw * 180) / Math.PI;
}

function matchGoldenCase(
  actualObjs: ParsedObject[],
  taskId: string,
  tol = 0.15
): { matched: number; total: number; missing: string[] } {
  const golden = getGoldenCase(taskId);
  if (!golden) return { matched: 0, total: 0, missing: [] };

  const missing: string[] = [];
  let matched = 0;

  for (const expected of golden.objects) {
    // Find closest actual object by name or position
    const candidate = actualObjs.find((o) => {
      const nameMatch = o.name.toLowerCase().includes(expected.name.toLowerCase().slice(0, 4));
      const posMatch =
        within(o.position[0], expected.position[0], tol) &&
        within(o.position[1], expected.position[1], tol) &&
        within(o.position[2], expected.position[2], tol);
      return nameMatch || posMatch;
    });

    if (candidate) {
      matched++;
    } else {
      missing.push(expected.name);
    }
  }

  return { matched, total: golden.objects.length, missing };
}

function countBy(objs: ParsedObject[], fn: (o: ParsedObject) => boolean): number {
  return objs.filter(fn).length;
}

// --- Task-specific deterministic checks ---

function verifyT06(objs: ParsedObject[]): VerificationResult[] {
  const cubes = objs.filter((o) => o.primitive === 'cube');
  const yellows = cubes.filter((o) => (o.color ?? '').toLowerCase().includes('yellow'));
  const yellowCube = yellows[0];
  const yRot = yellowCube ? extractYRotationEuler(yellowCube.rotation) : undefined;
  const rotPassed = yRot !== undefined && within(Math.abs(yRot), 45, 2); // ±2° tolerance

  return [
    { criterion_id: 'single_cube', passed: cubes.length === 1, rationale: `found ${cubes.length} cubes` },
    { criterion_id: 'color_yellow', passed: yellows.length >= 1, rationale: `yellow cubes: ${yellows.length}` },
    { criterion_id: 'rotation_y_45', passed: rotPassed, rationale: yRot !== undefined ? `Y rotation ≈ ${yRot.toFixed(1)}°` : 'no rotation property' },
  ];
}

function verifyM02(objs: ParsedObject[]): VerificationResult[] {
  const cubes = objs.filter((o) => o.primitive === 'cube');
  const reds = cubes.filter((o) => (o.color ?? '').toLowerCase().includes('red'));
  const greens = cubes.filter((o) => (o.color ?? '').toLowerCase().includes('green'));
  const blues = cubes.filter((o) => (o.color ?? '').toLowerCase().includes('blue'));
  const positions = cubes.map((o) => o.position[1]).sort((a, b) => a - b);
  const scales = cubes.map((o) => o.scale);
  const uniformSize = scales.every((s) => s[0] === 1 && s[1] === 1 && s[2] === 1);

  return [
    { criterion_id: 'three_cubes', passed: cubes.length === 3, rationale: `found ${cubes.length} cubes` },
    { criterion_id: 'color_order', passed: reds.length >= 1 && greens.length >= 1 && blues.length >= 1, rationale: `red=${reds.length} green=${greens.length} blue=${blues.length}` },
    { criterion_id: 'stacked_vertically', passed: positions.length === 3 && within(positions[1], positions[0]+1, 0.1) && within(positions[2], positions[1]+1, 0.1), rationale: `y positions: ${positions.map((n) => n.toFixed(2)).join(', ')}` },
    { criterion_id: 'uniform_size', passed: uniformSize, rationale: uniformSize ? 'all scales are [1,1,1]' : `scales: ${scales.map((s) => `[${s.join(',')}]`).join('; ')}` },
  ];
}

function verifyM06(objs: ParsedObject[]): VerificationResult[] {
  const tiles = objs.filter((o) => o.primitive === 'plane' || o.primitive === 'cube');
  const colors = tiles.map((o) => (o.color ?? '').toLowerCase());
  const hasBlackWhite = colors.some((c) => c.includes('black') || c === '#000000') && colors.some((c) => c.includes('white') || c === '#ffffff');

  // Check checkerboard: sort by position, verify alternating
  const byPos = [...tiles].sort((a, b) => {
    if (Math.abs(a.position[0] - b.position[0]) > 0.1) return a.position[0] - b.position[0];
    return a.position[2] - b.position[2];
  });

  return [
    { criterion_id: 'sixtyfour_squares', passed: tiles.length === 64, rationale: `found ${tiles.length} tiles` },
    { criterion_id: 'alternating_colors', passed: tiles.length === 64 && hasBlackWhite, rationale: `${tiles.length} tiles, black/white present: ${hasBlackWhite}` },
    { criterion_id: 'grid_origin', passed: byPos.length > 0 && within(byPos[0].position[0], 0, 0.5) && within(byPos[0].position[2], 0, 0.5), rationale: `first tile at [${byPos[0]?.position.map((n) => n.toFixed(2)).join(', ') ?? 'none'}]` },
    { criterion_id: 'in_xz_plane', passed: tiles.every((o) => within(o.position[1], 0, 0.1)), rationale: `y values: ${[...new Set(tiles.map((o) => o.position[1].toFixed(2)))].join(', ')}` },
  ];
}

function verifyM09(objs: ParsedObject[]): VerificationResult[] {
  const spheres = objs.filter((o) => o.primitive === 'sphere');
  const whites = spheres.filter((o) => (o.color ?? '').toLowerCase().includes('white'));
  const blacks = spheres.filter((o) => (o.color ?? '').toLowerCase().includes('black'));
  const bodySpheres = whites.sort((a, b) => a.position[1] - b.position[1]);
  const radii = bodySpheres.map((o) => o.radius ?? 0.5);

  // Check touching: center offset should equal sum of radii
  let touching = true;
  for (let i = 1; i < bodySpheres.length; i++) {
    const expected = (bodySpheres[i-1].radius ?? 0.5) + (bodySpheres[i].radius ?? 0.5);
    const actual = bodySpheres[i].position[1] - bodySpheres[i-1].position[1];
    if (!within(actual, expected, 0.15)) touching = false;
  }

  const sizePassed =
    radii.length >= 3 &&
    within(radii[0], 1.0, 0.15) &&
    within(radii[1], 0.7, 0.15) &&
    within(radii[2], 0.5, 0.15);

  return [
    { criterion_id: 'five_spheres', passed: spheres.length === 5, rationale: `found ${spheres.length} spheres` },
    { criterion_id: 'body_sizes', passed: sizePassed, rationale: `radii (bottom to top): ${radii.map((r) => r.toFixed(2)).join(', ')}` },
    { criterion_id: 'stacked_correctly', passed: touching, rationale: touching ? 'spheres are touching' : 'spacing mismatch between body spheres' },
    { criterion_id: 'eyes_present', passed: blacks.length >= 2, rationale: `found ${blacks.length} black spheres (eyes)` },
  ];
}

function verifyA01(objs: ParsedObject[]): VerificationResult[] {
  // Floors: large gray cubes with tall Y scale
  const floors = objs.filter((o) =>
    o.primitive === 'cube' &&
    ((o.color ?? '').toLowerCase() === 'gray' || (o.scale?.[1] ?? 0) >= 2.5)
  );
  // Windows: small cubes that are NOT floors
  const windows = objs.filter((o) =>
    o.primitive === 'cube' && !floors.includes(o)
  );

  // Check coplanarity: each window should sit on a floor face plane
  // Floor centers at y ≈ 1.5, 4.5, 7.5 with half-height 1.5 → faces at y=0,3,6,9 (horizontal)
  // and x=±5, z=±5 (vertical). Windows are on vertical faces.
  let coplanarCount = 0;
  const floorYCenters = floors.map((f) => f.position[1]).sort((a, b) => a - b);
  for (const w of windows) {
    const wx = w.position[0];
    const wy = w.position[1];
    const wz = w.position[2];
    const onVerticalFace =
      within(Math.abs(wx), 5, 0.5) || within(Math.abs(wz), 5, 0.5);
    const alignedToFloor = floorYCenters.some((y) => within(wy, y, 1.6));
    if (onVerticalFace && alignedToFloor) coplanarCount++;
  }

  return [
    { criterion_id: 'three_floors', passed: floors.length === 3, rationale: `found ${floors.length} floors` },
    { criterion_id: 'stacked_no_gap', passed: floors.length === 3, rationale: `floors: ${floors.length}` },
    { criterion_id: 'windows_per_face', passed: windows.length >= 48, rationale: `found ${windows.length} windows (need 48)` },
    { criterion_id: 'windows_in_face_plane', passed: coplanarCount >= 48, rationale: `${coplanarCount}/${windows.length} windows are coplanar with floor faces` },
  ];
}

function verifyA04(objs: ParsedObject[]): VerificationResult[] {
  const walls = objs.filter((o) => o.primitive === 'cube' && (o.scale?.[1] ?? 0) > 1);

  // Each wall must have one dimension ~1.5 (height) and one ~0.1 (thickness).
  const TOL = 0.05;
  const validWalls = walls.filter((o) => {
    const dims = [o.scale[0], o.scale[1], o.scale[2]];
    const hasHeight = dims.some((d) => within(d, 1.5, TOL));
    const hasThickness = dims.some((d) => within(d, 0.1, TOL));
    return hasHeight && hasThickness;
  });

  return [
    { criterion_id: 'grid_dimensions', passed: true, rationale: 'grid dimensions are specified in prompt, not verifiable from objects alone' },
    { criterion_id: 'walls_present', passed: walls.length >= 5, rationale: `found ${walls.length} walls` },
    { criterion_id: 'wall_thickness_height', passed: validWalls.length >= 5, rationale: `${validWalls.length}/${walls.length} walls match 0.1 thick + 1.5 tall (tol ${TOL})` },
    { criterion_id: 'connected_path', passed: walls.length >= 5, rationale: `walls present: ${walls.length}` },
  ];
}

function verifyA10(objs: ParsedObject[]): VerificationResult[] {
  const cylinders = objs.filter((o) => o.primitive === 'cylinder');
  const cubes = objs.filter((o) => o.primitive === 'cube');
  const gears = cylinders.filter((o) => (o.radius ?? 0) >= 0.3);
  const axles = cylinders.filter((o) => (o.radius ?? 0) <= 0.1);

  // Tangency: small gear center should be at distance (r1 + r2) from large gear center.
  const TOL = 0.05;
  let tangencyPassed = false;
  let tangencyRationale = `gears: ${gears.length}`;
  if (gears.length >= 2) {
    const sorted = [...gears].sort((a, b) => (b.radius ?? 0) - (a.radius ?? 0));
    const large = sorted[0];
    const small = sorted[1];
    const d = dist(large.position, small.position);
    const expected = (large.radius ?? 0) + (small.radius ?? 0);
    tangencyPassed = within(d, expected, TOL);
    tangencyRationale = `center distance=${d.toFixed(3)}, expected=${expected.toFixed(3)} (tol ${TOL})`;
  }

  return [
    { criterion_id: 'two_gears', passed: gears.length >= 2, rationale: `found ${gears.length} gear cylinders` },
    { criterion_id: 'tangency', passed: tangencyPassed, rationale: tangencyRationale },
    { criterion_id: 'teeth_per_gear', passed: cubes.length >= 16, rationale: `found ${cubes.length} cube teeth (need 16)` },
    { criterion_id: 'axles', passed: axles.length >= 2, rationale: `found ${axles.length} axle cylinders` },
    { criterion_id: 'axle_color', passed: axles.some((o) => isGrayish(o.color)), rationale: `axle colors: ${axles.map((o) => o.color).join(', ')}` },
  ];
}

const TASK_VERIFIERS: Record<string, (objs: ParsedObject[]) => VerificationResult[]> = {
  T06: verifyT06,
  M02: verifyM02,
  M06: verifyM06,
  M09: verifyM09,
  A01: verifyA01,
  A04: verifyA04,
  A10: verifyA10,
};

export function verifyDeterministically(
  task: Task,
  mutations: SceneMutation[]
): VerificationResult[] {
  const verifier = TASK_VERIFIERS[task.id];
  if (!verifier) return [];
  const objs = parseObjects(mutations);
  return verifier(objs);
}

export function hasDeterministicVerifier(taskId: string): boolean {
  return taskId in TASK_VERIFIERS;
}
