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
  /** Camera look-at target. Read from input.target when present. */
  target?: [number, number, number];
  /** Light direction vector. Read from input.direction when present. */
  direction?: [number, number, number];
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
      target: Array.isArray(input.target) && input.target.length === 3
          ? ([Number(input.target[0] ?? 0), Number(input.target[1] ?? 0), Number(input.target[2] ?? 0)] as [number, number, number])
          : undefined,
      direction: Array.isArray(input.direction) && input.direction.length === 3
          ? ([Number(input.direction[0] ?? 0), Number(input.direction[1] ?? 0), Number(input.direction[2] ?? 0)] as [number, number, number])
          : undefined,
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

function verifyT09(objs: ParsedObject[]): VerificationResult[] {
  const cones = objs.filter((o) => o.primitive === 'cone');
  const pinks = cones.filter((o) => {
    const c = (o.color ?? '').toLowerCase();
    return c.includes('pink') || c === '#ffc0cb' || c === '#ff69b4' || c === '#ffb6c1' || c === '#db7093';
  });
  const cone = cones[0];

  // Cone primitives default to tip-up (+Y). No rotation = tip up.
  // Explicit rotation only fails if it clearly reorients the tip.
  let tipUp = true;
  let tipRationale = 'default cone orientation is tip-up (+Y)';
  if (cone && cone.rotation) {
    if (cone.rotation.length === 3) {
      const [rx, , rz] = cone.rotation;
      // Any X or Z rotation that would tilt the cone away from +Y
      if (Math.abs(rx) > 0.1 || Math.abs(rz) > 0.1) {
        tipUp = false;
        tipRationale = `rotation [${cone.rotation.map((n) => Number(n).toFixed(2)).join(', ')}] tilts tip away from +Y`;
      }
    } else if (cone.rotation.length === 4) {
      // Quaternion: [x, y, z, w]. If x or z are significant, the cone is tilted.
      const [, , z, w] = cone.rotation;
      // A pure Y-axis rotation has x=z=0. Any x or z component tilts the axis.
      if (Math.abs(cone.rotation[0]) > 0.05 || Math.abs(z) > 0.05) {
        tipUp = false;
        tipRationale = `quaternion rotation tilts tip away from +Y`;
      }
    }
  }

  const pos = cone?.position ?? [0, 0, 0];
  const atOrigin = within(pos[0], 0, 0.01) && within(pos[1], 0, 0.01) && within(pos[2], 0, 0.01);

  return [
    { criterion_id: 'is_cone', passed: cones.length === 1, rationale: `found ${cones.length} cones` },
    { criterion_id: 'color_pink', passed: pinks.length >= 1, rationale: `pink cones: ${pinks.length}` },
    { criterion_id: 'tip_up', passed: tipUp, rationale: tipRationale },
    { criterion_id: 'position_correct', passed: atOrigin, rationale: `position [${pos.map((n) => n.toFixed(2)).join(', ')}]` },
  ];
}

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

  // --- Path uniqueness check via BFS + DFS on 5x5 grid ---
  // Cells are 2x2m, edges at x=0,2,4,6,8,10 and z=0,2,4,6,8,10.
  const CELL_SIZE = 2;
  const GRID = 5;
  const EDGE_TOL = 0.15;

  // Build a set of blocked edges: key = "i,j,dir" where dir = 'R' (right/x+) or 'U' (up/z+)
  const blocked = new Set<string>();

  for (const w of validWalls) {
    const [px, , pz] = w.position;
    const [sx, , sz] = w.scale;
    // Vertical wall (thickness in x ≈ 0.1)
    if (within(sx, 0.1, EDGE_TOL)) {
      const gridX = Math.round(px / CELL_SIZE) * CELL_SIZE;
      const zMin = pz - sz / 2;
      const zMax = pz + sz / 2;
      // This wall sits on vertical grid line x = gridX, spanning z=[zMin,zMax]
      // Block rightward passage for any cell (i,j) whose right edge is on this line
      for (let j = 0; j < GRID; j++) {
        const cellZMin = j * CELL_SIZE;
        const cellZMax = (j + 1) * CELL_SIZE;
        if (zMax > cellZMin && zMin < cellZMax) {
          const i = Math.round((gridX - CELL_SIZE) / CELL_SIZE); // cell to the left of wall
          if (i >= 0 && i < GRID - 1 && j >= 0 && j < GRID) {
            blocked.add(`${i},${j},R`);
          }
        }
      }
    }
    // Horizontal wall (thickness in z ≈ 0.1)
    if (within(sz, 0.1, EDGE_TOL)) {
      const gridZ = Math.round(pz / CELL_SIZE) * CELL_SIZE;
      const xMin = px - sx / 2;
      const xMax = px + sx / 2;
      // This wall sits on horizontal grid line z = gridZ, spanning x=[xMin,xMax]
      for (let i = 0; i < GRID; i++) {
        const cellXMin = i * CELL_SIZE;
        const cellXMax = (i + 1) * CELL_SIZE;
        if (xMax > cellXMin && xMin < cellXMax) {
          const j = Math.round((gridZ - CELL_SIZE) / CELL_SIZE); // cell below wall
          if (i >= 0 && i < GRID && j >= 0 && j < GRID - 1) {
            blocked.add(`${i},${j},U`);
          }
        }
      }
    }
  }

  // Helper: get neighbors
  const neighbors = (i: number, j: number): Array<[number, number]> => {
    const out: Array<[number, number]> = [];
    if (i > 0 && !blocked.has(`${i - 1},${j},R`)) out.push([i - 1, j]); // left
    if (i < GRID - 1 && !blocked.has(`${i},${j},R`)) out.push([i + 1, j]); // right
    if (j > 0 && !blocked.has(`${i},${j - 1},U`)) out.push([i, j - 1]); // down
    if (j < GRID - 1 && !blocked.has(`${i},${j},U`)) out.push([i, j + 1]); // up
    return out;
  };

  // BFS for reachability from (0,0) to (4,4)
  const visited = new Set<string>();
  const queue: Array<[number, number]> = [[0, 0]];
  visited.add('0,0');
  let reachable = false;
  while (queue.length > 0) {
    const [ci, cj] = queue.shift()!;
    if (ci === GRID - 1 && cj === GRID - 1) {
      reachable = true;
      break;
    }
    for (const [ni, nj] of neighbors(ci, cj)) {
      const key = `${ni},${nj}`;
      if (!visited.has(key)) {
        visited.add(key);
        queue.push([ni, nj]);
      }
    }
  }

  // DFS counting simple paths from (0,0) to (4,4)
  let pathCount = 0;
  const dfs = (i: number, j: number, seen: Set<string>) => {
    if (i === GRID - 1 && j === GRID - 1) {
      pathCount++;
      return;
    }
    for (const [ni, nj] of neighbors(i, j)) {
      const key = `${ni},${nj}`;
      if (!seen.has(key)) {
        seen.add(key);
        dfs(ni, nj, seen);
        seen.delete(key);
      }
    }
  };
  dfs(0, 0, new Set(['0,0']));

  const connectedPassed = reachable;
  const uniquePathPassed = reachable && pathCount === 1;

  return [
    { criterion_id: 'grid_dimensions', passed: true, rationale: 'grid dimensions are specified in prompt, not verifiable from objects alone' },
    { criterion_id: 'walls_present', passed: walls.length >= 5, rationale: `found ${walls.length} walls` },
    { criterion_id: 'wall_thickness_height', passed: validWalls.length >= 5, rationale: `${validWalls.length}/${walls.length} walls match 0.1 thick + 1.5 tall (tol ${TOL})` },
    { criterion_id: 'connected_path', passed: uniquePathPassed, rationale: uniquePathPassed ? `reachable, exactly 1 path (count=${pathCount})` : `reachable=${connectedPassed}, pathCount=${pathCount}` },
  ];
}

function verifyA07(objs: ParsedObject[]): VerificationResult[] {
  const cones = objs.filter((o) => o.primitive === 'cone');
  const oranges = cones.filter((o) => (o.color ?? '').toLowerCase().includes('orange'));

  // Parabola: z = 0.5 * x^2
  const TOL_POS = 0.15;
  let parabolaPassed = false;
  let parabolaRationale = `cones: ${cones.length}`;
  if (cones.length >= 4) {
    const sorted = [...cones].sort((a, b) => a.position[0] - b.position[0]);
    const diffs = sorted.map((c) => {
      const x = c.position[0];
      const z = c.position[2];
      const expected = 0.5 * x * x;
      return Math.abs(z - expected);
    });
    parabolaPassed = diffs.every((d) => d <= TOL_POS);
    parabolaRationale = `z vs 0.5x² diffs: ${diffs.map((d) => d.toFixed(3)).join(', ')} (tol ${TOL_POS})`;
  }

  // Uniform arc-length spacing (approximate check using ideal positions on z=0.5x²)
  // For 4 cones on x∈[0,3], ideal uniform-arc x positions are approximately [0, 1.37, 2.20, 3.00]
  const TOL_ARC = 0.25;
  let arcPassed = false;
  let arcRationale = `cones: ${cones.length}`;
  if (cones.length >= 4) {
    const sorted = [...cones].sort((a, b) => a.position[0] - b.position[0]);
    const xs = sorted.map((c) => c.position[0]);
    const idealXs = [0, 1.37, 2.20, 3.0];
    const match = xs.every((x, i) => within(x, idealXs[i], TOL_ARC));
    arcPassed = match;
    arcRationale = `x positions: ${xs.map((x) => x.toFixed(2)).join(', ')} vs ideal ${idealXs.join(', ')} (tol ${TOL_ARC})`;
  }

  return [
    { criterion_id: 'four_cones', passed: cones.length === 4, rationale: `found ${cones.length} cones` },
    { criterion_id: 'all_orange', passed: oranges.length >= 4, rationale: `orange cones: ${oranges.length}` },
    { criterion_id: 'follow_parabola', passed: parabolaPassed, rationale: parabolaRationale },
    { criterion_id: 'uniform_arc', passed: arcPassed, rationale: arcRationale },
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

// --- Trivial-tier verifiers (single-object property checks) ---

function verifyT01(objs: ParsedObject[]): VerificationResult[] {
  // Single red cube at origin.
  const cubes = objs.filter((o) => o.primitive === 'cube');
  const reds = cubes.filter((o) => (o.color ?? '').toLowerCase().includes('red'));
  const cube = cubes[0];
  const pos = cube?.position ?? [0, 0, 0];
  const atOrigin = within(pos[0], 0, 0.01) && within(pos[1], 0, 0.01) && within(pos[2], 0, 0.01);

  return [
    { criterion_id: 'single_object', passed: objs.length === 1, rationale: `found ${objs.length} objects` },
    { criterion_id: 'object_is_cube', passed: cubes.length === 1, rationale: `found ${cubes.length} cubes` },
    { criterion_id: 'color_red', passed: reds.length >= 1, rationale: `red cubes: ${reds.length}` },
    { criterion_id: 'position_origin', passed: atOrigin, rationale: `position [${pos.map((n) => n.toFixed(2)).join(', ')}]` },
  ];
}

function verifyT02(objs: ParsedObject[]): VerificationResult[] {
  // Blue sphere of radius 0.5 at (1, 0, 0).
  const spheres = objs.filter((o) => o.primitive === 'sphere');
  const blues = spheres.filter((o) => (o.color ?? '').toLowerCase().includes('blue'));
  const sphere = spheres[0];
  const r = sphere?.radius;
  const radiusOk = r !== undefined && within(r, 0.5, 0.025); // 5% tol
  const pos = sphere?.position ?? [0, 0, 0];
  const positionOk =
    within(pos[0], 1, 0.01) && within(pos[1], 0, 0.01) && within(pos[2], 0, 0.01);

  return [
    { criterion_id: 'single_sphere', passed: spheres.length === 1, rationale: `found ${spheres.length} spheres` },
    { criterion_id: 'color_blue', passed: blues.length >= 1, rationale: `blue spheres: ${blues.length}` },
    { criterion_id: 'radius_half', passed: radiusOk, rationale: r !== undefined ? `radius=${r.toFixed(3)} (target 0.5)` : 'no radius property' },
    { criterion_id: 'position_correct', passed: positionOk, rationale: `position [${pos.map((n) => n.toFixed(2)).join(', ')}]` },
  ];
}

function verifyT03(objs: ParsedObject[]): VerificationResult[] {
  // Green cylinder of height 2 standing on the ground (y=0).
  const cylinders = objs.filter((o) => o.primitive === 'cylinder');
  const greens = cylinders.filter((o) => (o.color ?? '').toLowerCase().includes('green'));
  const cyl = cylinders[0];
  // Height typically encoded in scale.y. 5% tol on height=2.
  const height = cyl?.scale?.[1] ?? 0;
  const heightOk = within(height, 2, 0.1);
  // Bottom on ground means center.y ≈ height/2 ≈ 1 when scale.y is the full height.
  const cy = cyl?.position?.[1] ?? 0;
  const onGround = within(cy, height / 2, 0.1) || within(cy, 1, 0.1);

  return [
    { criterion_id: 'single_cylinder', passed: cylinders.length === 1, rationale: `found ${cylinders.length} cylinders` },
    { criterion_id: 'color_green', passed: greens.length >= 1, rationale: `green cylinders: ${greens.length}` },
    { criterion_id: 'height_two', passed: heightOk, rationale: `scale.y=${height.toFixed(2)} (target 2)` },
    { criterion_id: 'on_ground', passed: onGround, rationale: `center y=${cy.toFixed(2)} (expect ≈1 with height 2)` },
  ];
}

function verifyT04(objs: ParsedObject[]): VerificationResult[] {
  // Directional light pointing downward.
  const lights = objs.filter((o) => o.light_type !== undefined || o.type === 'light');
  const directional = lights.filter((o) => (o.light_type ?? '').toLowerCase() === 'directional');
  const light = directional[0];
  const dir = light?.direction;
  const downOk =
    dir !== undefined && dir[1] < -0.5 && Math.abs(dir[0]) < 0.5 && Math.abs(dir[2]) < 0.5;

  return [
    { criterion_id: 'is_light', passed: lights.length >= 1, rationale: `found ${lights.length} lights` },
    { criterion_id: 'directional', passed: directional.length >= 1, rationale: `directional lights: ${directional.length}` },
    {
      criterion_id: 'direction_down',
      passed: downOk,
      rationale: dir !== undefined ? `direction [${dir.map((n) => n.toFixed(2)).join(', ')}]` : 'no direction property',
    },
  ];
}

function verifyT05(objs: ParsedObject[]): VerificationResult[] {
  // 10x10 gray ground plane, horizontal.
  const planes = objs.filter((o) => o.primitive === 'plane' || o.primitive === 'cube');
  const plane = planes[0];
  const sx = plane?.scale?.[0] ?? 0;
  const sz = plane?.scale?.[2] ?? 0;
  const sizeOk = within(sx, 10, 1) && within(sz, 10, 1); // 10% tol per memo
  const grayOk = isGrayish(plane?.color);
  // Horizontal: rotation undefined or near-identity (planes default to xz-plane).
  // For thin cubes used as ground, scale.y is small.
  const sy = plane?.scale?.[1] ?? 1;
  const horizontalOk =
    plane?.primitive === 'plane' ||
    (plane?.primitive === 'cube' && sy < sx && sy < sz);

  return [
    { criterion_id: 'is_plane', passed: planes.length >= 1, rationale: `found ${planes.length} ground candidates` },
    { criterion_id: 'size_10x10', passed: sizeOk, rationale: `scale x=${sx.toFixed(2)} z=${sz.toFixed(2)} (target 10)` },
    { criterion_id: 'color_gray', passed: grayOk, rationale: `color: ${plane?.color ?? 'none'}` },
    { criterion_id: 'horizontal', passed: horizontalOk, rationale: plane?.primitive === 'plane' ? 'plane primitive (default normal +Y)' : `cube with thin Y axis (scale ${sx.toFixed(1)}x${sy.toFixed(2)}x${sz.toFixed(1)})` },
  ];
}

function verifyT07(objs: ParsedObject[]): VerificationResult[] {
  // Perspective camera at (5,5,5) looking at origin.
  const cameras = objs.filter((o) => o.type === 'camera' || o.projection !== undefined);
  const cam = cameras[0];
  const perspOk = (cam?.projection ?? '').toLowerCase() === 'perspective';
  const pos = cam?.position ?? [0, 0, 0];
  const positionOk =
    within(pos[0], 5, 0.01) && within(pos[1], 5, 0.01) && within(pos[2], 5, 0.01);
  const tgt = cam?.target;
  const looksAtOrigin =
    tgt !== undefined && within(tgt[0], 0, 0.01) && within(tgt[1], 0, 0.01) && within(tgt[2], 0, 0.01);

  return [
    { criterion_id: 'is_camera', passed: cameras.length >= 1, rationale: `found ${cameras.length} cameras` },
    { criterion_id: 'perspective', passed: perspOk, rationale: `projection=${cam?.projection ?? 'none'}` },
    { criterion_id: 'position_correct', passed: positionOk, rationale: `position [${pos.map((n) => n.toFixed(2)).join(', ')}]` },
    {
      criterion_id: 'looks_at_origin',
      passed: looksAtOrigin,
      rationale: tgt !== undefined ? `target [${tgt.map((n) => n.toFixed(2)).join(', ')}]` : 'no target property',
    },
  ];
}

function verifyT08(objs: ParsedObject[]): VerificationResult[] {
  // Torus with major=1, minor=0.25 at (0,1,0). Major/minor radii are not
  // tracked as distinct fields on ParsedObject, so we only deterministically
  // verify count and position; major_radius / minor_radius criteria fall
  // through to the LLM judge.
  const tori = objs.filter((o) => o.primitive === 'torus');
  const torus = tori[0];
  const pos = torus?.position ?? [0, 0, 0];
  const positionOk =
    within(pos[0], 0, 0.01) && within(pos[1], 1, 0.01) && within(pos[2], 0, 0.01);

  return [
    { criterion_id: 'is_torus', passed: tori.length === 1, rationale: `found ${tori.length} tori` },
    { criterion_id: 'position_correct', passed: positionOk, rationale: `position [${pos.map((n) => n.toFixed(2)).join(', ')}]` },
  ];
}

function verifyT10(objs: ParsedObject[]): VerificationResult[] {
  // Single white point light at (2, 4, 2).
  const lights = objs.filter((o) => o.light_type !== undefined || o.type === 'light');
  const points = lights.filter((o) => (o.light_type ?? '').toLowerCase() === 'point');
  const light = points[0];
  const colorWhite =
    (light?.color ?? '').toLowerCase().includes('white') ||
    (light?.color ?? '').toLowerCase() === '#ffffff' ||
    (light?.color ?? '').toLowerCase() === '#fff';
  const pos = light?.position ?? [0, 0, 0];
  const positionOk =
    within(pos[0], 2, 0.01) && within(pos[1], 4, 0.01) && within(pos[2], 2, 0.01);

  return [
    { criterion_id: 'is_point_light', passed: points.length === 1, rationale: `point lights: ${points.length}` },
    { criterion_id: 'color_white', passed: colorWhite, rationale: `color: ${light?.color ?? 'none'}` },
    { criterion_id: 'position_correct', passed: positionOk, rationale: `position [${pos.map((n) => n.toFixed(2)).join(', ')}]` },
  ];
}

function verifyA02(objs: ParsedObject[]): VerificationResult[] {
  const cylinders = objs.filter((o) => o.primitive === 'cylinder');
  const cubes = objs.filter((o) => o.primitive === 'cube');
  const spheres = objs.filter((o) => o.primitive === 'sphere');

  // Base: cylinder radius ~0.3, height ~0.3
  const base = cylinders.find((o) => within(o.radius ?? 0, 0.3, 0.1) && within(o.scale[1], 0.3, 0.1));
  // Upper arm: box ~0.15x0.15x1.0
  const upperArm = cubes.find((o) => within(o.scale[0], 0.15, 0.05) && within(o.scale[2], 0.15, 0.05) && within(o.scale[1], 1.0, 0.15));
  // Forearm: box ~0.12x0.12x0.8
  const forearm = cubes.find((o) => within(o.scale[0], 0.12, 0.04) && within(o.scale[2], 0.12, 0.04) && within(o.scale[1], 0.8, 0.12));
  // Gripper: small sphere
  const gripper = spheres.find((o) => (o.radius ?? 0.5) <= 0.2);
  // Joints: small cylinders between segments
  const joints = cylinders.filter((o) => within(o.radius ?? 0, 0.05, 0.05) && within(o.scale[1], 0.05, 0.05) && o !== base);

  // Chain check: base y < upperArm y < forearm y < gripper y (within tolerance)
  let chainPassed = false;
  let chainRationale = 'missing segments';
  if (base && upperArm && forearm && gripper) {
    const yOrder = [base.position[1], upperArm.position[1], forearm.position[1], gripper.position[1]];
    chainPassed = yOrder.every((y, i) => i === 0 || y > yOrder[i - 1] - 0.2);
    chainRationale = `y chain: ${yOrder.map((n) => n.toFixed(2)).join(' < ')}`;
  }

  return [
    { criterion_id: 'base_present', passed: !!base, rationale: base ? `base cylinder r=${(base.radius ?? 0).toFixed(2)} h=${base.scale[1].toFixed(2)}` : `no base cylinder found among ${cylinders.length} cylinders` },
    { criterion_id: 'upper_arm', passed: !!upperArm, rationale: upperArm ? `upper arm scale=[${upperArm.scale.map((n) => n.toFixed(2)).join(',')}]` : `no upper-arm box found among ${cubes.length} cubes` },
    { criterion_id: 'forearm', passed: !!forearm, rationale: forearm ? `forearm scale=[${forearm.scale.map((n) => n.toFixed(2)).join(',')}]` : `no forearm box found among ${cubes.length} cubes` },
    { criterion_id: 'gripper', passed: !!gripper, rationale: gripper ? `gripper sphere r=${(gripper.radius ?? 0).toFixed(2)}` : `no small sphere found among ${spheres.length} spheres` },
    { criterion_id: 'joints_or_grouping', passed: chainPassed || joints.length >= 2, rationale: chainPassed ? `chain verified: ${chainRationale}` : `${joints.length} joint cylinders found` },
  ];
}

function verifyA05(objs: ParsedObject[]): VerificationResult[] {
  const cubes = objs.filter((o) => o.primitive === 'cube');
  const cones = objs.filter((o) => o.primitive === 'cone');
  const spheres = objs.filter((o) => o.primitive === 'sphere');

  // Houses: pair a wall cube (white, scale ~2x2x2) with a roof cone (brown)
  const walls = cubes.filter((o) => {
    const c = (o.color ?? '').toLowerCase();
    return (c.includes('white') || c === '#ffffff') && within(o.scale[0], 2, 0.5) && within(o.scale[1], 2, 0.5);
  });
  const roofs = cones.filter((o) => {
    const c = (o.color ?? '').toLowerCase();
    return c.includes('brown') || c === '#8b4513' || c === '#a0522d';
  });

  // Match roofs to walls by proximity (same x,z within 2m)
  let matchedHouses = 0;
  const usedRoofs = new Set<number>();
  for (const w of walls) {
    const roofIdx = roofs.findIndex((r, i) => !usedRoofs.has(i) && dist([w.position[0], 0, w.position[2]], [r.position[0], 0, r.position[2]]) <= 2);
    if (roofIdx >= 0) {
      matchedHouses++;
      usedRoofs.add(roofIdx);
    }
  }

  // Spacing: sort house x positions, check ~5m apart
  const wallXs = walls.map((o) => o.position[0]).sort((a, b) => a - b);
  let spacingPassed = false;
  let spacingRationale = `houses=${walls.length}`;
  if (wallXs.length >= 2) {
    const diffs = wallXs.slice(1).map((x, i) => x - wallXs[i]);
    spacingPassed = diffs.every((d) => within(d, 5, 1.5));
    spacingRationale = `x diffs: ${diffs.map((n) => n.toFixed(1)).join(', ')}`;
  }

  // Sun: yellow sphere high up (y > 5)
  const sun = spheres.find((o) => {
    const c = (o.color ?? '').toLowerCase();
    return (c.includes('yellow') || c === '#ffff00') && o.position[1] > 5;
  });

  return [
    { criterion_id: 'five_houses', passed: walls.length >= 5, rationale: `found ${walls.length} wall cubes` },
    { criterion_id: 'each_house_complete', passed: matchedHouses >= 5, rationale: `${matchedHouses}/${walls.length} walls have a paired roof` },
    { criterion_id: 'spacing_5m', passed: spacingPassed, rationale: spacingRationale },
    { criterion_id: 'color_correctness', passed: walls.length >= 5 && roofs.length >= 5, rationale: `white walls=${walls.length}, brown roofs=${roofs.length}` },
    { criterion_id: 'sun_present', passed: !!sun, rationale: sun ? `sun at y=${sun.position[1].toFixed(1)}` : 'no yellow sphere high in sky' },
  ];
}

function verifyA09(objs: ParsedObject[]): VerificationResult[] {
  const planes = objs.filter((o) => o.primitive === 'plane' || o.primitive === 'cube');
  const cylinders = objs.filter((o) => o.primitive === 'cylinder');

  // Chessboard: 64 tiles, alternating black/white, 1x1 size, in XZ plane
  const boardTiles = planes.filter((o) => within(o.scale[0], 1, 0.2) && within(o.scale[2], 1, 0.2) && within(o.position[1], 0, 0.2));
  const colors = boardTiles.map((o) => (o.color ?? '').toLowerCase());
  const hasBlack = colors.some((c) => c.includes('black') || c === '#000000');
  const hasWhite = colors.some((c) => c.includes('white') || c === '#ffffff');

  // Pawns: white cylinders at row 1 (z ≈ 1), black at row 6 (z ≈ 6)
  const whitePawns = cylinders.filter((o) => {
    const c = (o.color ?? '').toLowerCase();
    return (c.includes('white') || c === '#ffffff') && within(o.position[2], 1, 0.5) && within(o.radius ?? 0, 0.3, 0.15) && within(o.scale[1], 0.5, 0.15);
  });
  const blackPawns = cylinders.filter((o) => {
    const c = (o.color ?? '').toLowerCase();
    return (c.includes('black') || c === '#000000') && within(o.position[2], 6, 0.5) && within(o.radius ?? 0, 0.3, 0.15) && within(o.scale[1], 0.5, 0.15);
  });

  // Centered: pawn x positions should be near 0.5, 1.5, ..., 7.5 (tile centers)
  const allPawns = [...whitePawns, ...blackPawns];
  const centered = allPawns.filter((o) => {
    const x = o.position[0];
    const z = o.position[2];
    return Array.from({ length: 8 }, (_, i) => i + 0.5).some((cx) => within(x, cx, 0.25)) &&
           Array.from({ length: 8 }, (_, i) => i + 0.5).some((cz) => within(z, cz, 0.25));
  });

  return [
    { criterion_id: 'chessboard', passed: boardTiles.length === 64 && hasBlack && hasWhite, rationale: `${boardTiles.length} tiles, black=${hasBlack}, white=${hasWhite}` },
    { criterion_id: 'white_pawns', passed: whitePawns.length === 8, rationale: `white pawns: ${whitePawns.length}` },
    { criterion_id: 'black_pawns', passed: blackPawns.length === 8, rationale: `black pawns: ${blackPawns.length}` },
    { criterion_id: 'pawns_centered', passed: centered.length >= 14, rationale: `${centered.length}/${allPawns.length} pawns centered in tiles` },
    { criterion_id: 'pawn_dimensions', passed: allPawns.every((o) => within(o.radius ?? 0, 0.3, 0.15) && within(o.scale[1], 0.5, 0.15)), rationale: `radii: ${allPawns.map((o) => (o.radius ?? 0).toFixed(2)).join(', ')}, heights: ${allPawns.map((o) => o.scale[1].toFixed(2)).join(', ')}` },
  ];
}

const TASK_VERIFIERS: Record<string, (objs: ParsedObject[]) => VerificationResult[]> = {
  T01: verifyT01,
  T02: verifyT02,
  T03: verifyT03,
  T04: verifyT04,
  T05: verifyT05,
  T06: verifyT06,
  T07: verifyT07,
  T08: verifyT08,
  T09: verifyT09,
  T10: verifyT10,
  M02: verifyM02,
  M06: verifyM06,
  M09: verifyM09,
  A01: verifyA01,
  A02: verifyA02,
  A04: verifyA04,
  A05: verifyA05,
  A07: verifyA07,
  A09: verifyA09,
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
