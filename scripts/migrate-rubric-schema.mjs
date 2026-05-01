import fs from 'node:fs';
import path from 'node:path';

const TASKS_DIR = 'packages/studio/src/__benchmarks__/brittney-vs-baselines/tasks';

const VERIFIER_MAP = {
  M02: {
    three_cubes: { type: 'count' },
    color_order: { type: 'presence' },
    stacked_vertically: { type: 'geometric', tolerance: 0.1 },
    uniform_size: { type: 'geometric' },
  },
  M06: {
    sixtyfour_squares: { type: 'count' },
    alternating_colors: { type: 'presence' },
    grid_origin: { type: 'geometric', tolerance: 0.05 },
    in_xz_plane: { type: 'geometric', tolerance: 0.1 },
  },
  M09: {
    five_spheres: { type: 'count' },
    body_sizes: { type: 'geometric' },
    stacked_correctly: { type: 'geometric', tolerance: 0.15 },
    eyes_present: { type: 'count' },
  },
  A01: {
    three_floors: { type: 'count' },
    stacked_no_gap: { type: 'geometric' },
    windows_per_face: { type: 'count' },
    windows_in_face_plane: { type: 'geometric' },
  },
  A04: {
    grid_dimensions: { type: 'llm' },
    walls_present: { type: 'count' },
    wall_thickness_height: { type: 'geometric', tolerance: 0.05 },
    connected_path: { type: 'llm' },
  },
  A10: {
    two_gears: { type: 'count' },
    tangency: { type: 'geometric', tolerance: 0.05 },
    teeth_per_gear: { type: 'count' },
    axles: { type: 'count' },
    axle_color: { type: 'presence' },
  },
};

function processFile(filename) {
  const p = path.join(TASKS_DIR, filename);
  const tasks = JSON.parse(fs.readFileSync(p, 'utf8'));

  let changed = false;
  for (const task of tasks) {
    const map = VERIFIER_MAP[task.id];
    if (!map) continue;
    for (const criterion of task.evaluation_rubric) {
      const entry = map[criterion.id];
      if (!entry) continue;
      criterion.verifier_type = entry.type;
      if (entry.tolerance !== undefined) {
        criterion.tolerance = entry.tolerance;
      }
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(p, JSON.stringify(tasks, null, 2) + '\n');
    console.log(`Updated ${filename}`);
  }
}

processFile('multi-object-scene.json');
processFile('agentic-multi-step.json');
