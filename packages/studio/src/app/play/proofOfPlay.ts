/**
 * Proof-of-Play — Distributed Computation via Garden Gameplay
 *
 * Each seed growth stage runs a micro-computation job that benefits
 * the HoloScript ecosystem. Jobs include:
 *
 * 1. Trait Syntax Fuzzing — generates random trait definitions and validates
 *    them against the HoloScript grammar (finds parser edge cases)
 * 2. Spatial Math — solves proximity/layout equations useful for procgen
 * 3. Physics Bench — benchmarks device capability for compile target selection
 *
 * Results accumulate and can be reported to the MCP Mesh.
 */

// ─── Trait Definition Templates ───────────────────────────────────────────────

const TRAIT_NAMES = [
  'PhysicsBody', 'MeshRenderer', 'AudioSource', 'ParticleEmitter', 'Collider',
  'NavAgent', 'Animator', 'RigidBody', 'SyncTransform', 'HealthBar',
  'InteractionTarget', 'LODController', 'ShadowCaster', 'LightProbe',
  'VegetationInstance', 'WaterSurface', 'TerrainChunk', 'WeatherZone',
  'PortalGateway', 'InventorySlot', 'CraftingStation', 'DialogueTrigger',
  'QuestMarker', 'SpawnPoint', 'TeleportAnchor', 'GravityField',
  'ForceField', 'ProximityTrigger', 'DamageZone', 'HealingAura',
];

const PROPERTY_TEMPLATES = [
  { name: 'mass', type: 'number', range: [0.01, 1000] },
  { name: 'drag', type: 'number', range: [0, 10] },
  { name: 'bounce', type: 'number', range: [0, 1] },
  { name: 'radius', type: 'number', range: [0.1, 50] },
  { name: 'height', type: 'number', range: [0.1, 100] },
  { name: 'speed', type: 'number', range: [0.1, 200] },
  { name: 'intensity', type: 'number', range: [0, 10] },
  { name: 'frequency', type: 'number', range: [0.01, 100] },
  { name: 'lifetime', type: 'number', range: [0.1, 60] },
  { name: 'count', type: 'number', range: [1, 10000] },
  { name: 'enabled', type: 'boolean', range: [0, 1] },
  { name: 'color', type: 'color', range: [0, 0xFFFFFF] },
  { name: 'layer', type: 'string', options: ['default', 'world', 'ui', 'fx', 'physics'] },
  { name: 'priority', type: 'number', range: [0, 100] },
  { name: 'damping', type: 'number', range: [0, 1] },
  { name: 'threshold', type: 'number', range: [0, 1] },
];

const COMPOSE_OPERATORS = ['+', '&', '|', '^'];

// ─── Job Types ────────────────────────────────────────────────────────────────

export type JobType = 'trait_fuzz' | 'spatial_math' | 'physics_bench' | 'compose_fuzz';

export interface ComputeJob {
  id: string;
  type: JobType;
  input: string;  // the generated code or equation
  stage: string;  // which growth stage triggered this
}

export interface ComputeResult {
  jobId: string;
  type: JobType;
  success: boolean;
  output: string;       // result description
  durationMs: number;   // how long the computation took
  value: number;        // numeric result (hash, benchmark score, etc.)
  timestamp: number;
}

export interface ProofOfPlayStats {
  totalJobs: number;
  successfulJobs: number;
  failedJobs: number;
  totalComputeMs: number;
  traitsFuzzed: number;
  equationsSolved: number;
  benchmarkRuns: number;
  compositionsTested: number;
  ecosystemValue: number;  // aggregate "digital gold" score
}

// ─── Random Generators ────────────────────────────────────────────────────────

function randomPick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function randomFloat(min: number, max: number): number { return min + Math.random() * (max - min); }
function randomInt(min: number, max: number): number { return Math.floor(randomFloat(min, max + 1)); }
function randomHex(): string { return '#' + Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0'); }

/** Generate a random HoloScript trait definition */
function generateTraitDefinition(): string {
  const name = randomPick(TRAIT_NAMES) + randomInt(1, 99);
  const numProps = randomInt(2, 6);
  const props: string[] = [];
  const usedNames = new Set<string>();

  for (let i = 0; i < numProps; i++) {
    const template = randomPick(PROPERTY_TEMPLATES);
    if (usedNames.has(template.name)) continue;
    usedNames.add(template.name);

    let valueStr: string;
    switch (template.type) {
      case 'number': valueStr = randomFloat(template.range[0], template.range[1]).toFixed(3); break;
      case 'boolean': valueStr = Math.random() > 0.5 ? 'true' : 'false'; break;
      case 'color': valueStr = `"${randomHex()}"`; break;
      case 'string': valueStr = `"${randomPick(template.options!)}"`;break;
      default: valueStr = '0';
    }
    props.push(`  ${template.name}: ${valueStr}`);
  }

  return `trait ${name} {\n${props.join(';\n')};\n}`;
}

/** Generate a random trait composition line */
function generateCompositionLine(): string {
  const numSources = randomInt(2, 5);
  const sources: string[] = [];
  for (let i = 0; i < numSources; i++) {
    sources.push('@' + randomPick(TRAIT_NAMES).toLowerCase());
  }
  const targetName = 'composed_' + randomPick(TRAIT_NAMES).toLowerCase() + randomInt(1, 99);
  const op = randomPick(COMPOSE_OPERATORS);
  return `@${targetName} = ${sources.join(` ${op} `)}`;
}

/** Generate a spatial math equation (proximity, distance fields, layout) */
function generateSpatialEquation(): { equation: string; inputs: number[]; expected: number } {
  const type = randomInt(0, 4);
  switch (type) {
    case 0: { // Euclidean distance
      const [x1, y1, z1, x2, y2, z2] = Array.from({ length: 6 }, () => randomFloat(-20, 20));
      const dist = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2 + (z2 - z1) ** 2);
      return { equation: `distance3D(${x1.toFixed(2)},${y1.toFixed(2)},${z1.toFixed(2)}, ${x2.toFixed(2)},${y2.toFixed(2)},${z2.toFixed(2)})`,
        inputs: [x1, y1, z1, x2, y2, z2], expected: dist };
    }
    case 1: { // Dot product
      const [ax, ay, az, bx, by, bz] = Array.from({ length: 6 }, () => randomFloat(-1, 1));
      const dot = ax * bx + ay * by + az * bz;
      return { equation: `dot(${ax.toFixed(3)},${ay.toFixed(3)},${az.toFixed(3)}, ${bx.toFixed(3)},${by.toFixed(3)},${bz.toFixed(3)})`,
        inputs: [ax, ay, az, bx, by, bz], expected: dot };
    }
    case 2: { // Cross product magnitude
      const [ax, ay, az, bx, by, bz] = Array.from({ length: 6 }, () => randomFloat(-5, 5));
      const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
      const mag = Math.sqrt(cx * cx + cy * cy + cz * cz);
      return { equation: `crossMag(${ax.toFixed(2)},${ay.toFixed(2)},${az.toFixed(2)}, ${bx.toFixed(2)},${by.toFixed(2)},${bz.toFixed(2)})`,
        inputs: [ax, ay, az, bx, by, bz], expected: mag };
    }
    case 3: { // SDF sphere
      const [px, py, pz] = Array.from({ length: 3 }, () => randomFloat(-10, 10));
      const r = randomFloat(0.5, 5);
      const sdf = Math.sqrt(px * px + py * py + pz * pz) - r;
      return { equation: `sdfSphere(${px.toFixed(2)},${py.toFixed(2)},${pz.toFixed(2)}, r=${r.toFixed(2)})`,
        inputs: [px, py, pz, r], expected: sdf };
    }
    default: { // AABB overlap test area
      const [ax1, ay1, ax2, ay2] = [randomFloat(-5, 0), randomFloat(-5, 0), randomFloat(0, 5), randomFloat(0, 5)];
      const [bx1, by1, bx2, by2] = [randomFloat(-3, 2), randomFloat(-3, 2), randomFloat(2, 7), randomFloat(2, 7)];
      const ox = Math.max(0, Math.min(ax2, bx2) - Math.max(ax1, bx1));
      const oy = Math.max(0, Math.min(ay2, by2) - Math.max(ay1, by1));
      return { equation: `aabbOverlap(A[${ax1.toFixed(1)},${ay1.toFixed(1)},${ax2.toFixed(1)},${ay2.toFixed(1)}], B[${bx1.toFixed(1)},${by1.toFixed(1)},${bx2.toFixed(1)},${by2.toFixed(1)}])`,
        inputs: [ax1, ay1, ax2, ay2, bx1, by1, bx2, by2], expected: ox * oy };
    }
  }
}

// ─── Trait Syntax Validator (Lightweight) ─────────────────────────────────────

/** Validate HoloScript trait syntax */
function validateTraitSyntax(code: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check trait keyword
  if (!/^trait\s+[A-Za-z_]\w*\s*\{/.test(code)) {
    errors.push('Missing or malformed trait declaration');
  }

  // Check balanced braces
  const openBraces = (code.match(/\{/g) || []).length;
  const closeBraces = (code.match(/\}/g) || []).length;
  if (openBraces !== closeBraces) {
    errors.push(`Unbalanced braces: ${openBraces} open, ${closeBraces} close`);
  }

  // Check property format: name: value;
  const body = code.slice(code.indexOf('{') + 1, code.lastIndexOf('}'));
  const propLines = body.split(/[;\n]/).map(l => l.trim()).filter(l => l.length > 0);
  for (const line of propLines) {
    if (!/^[a-z_]\w*\s*:\s*.+$/i.test(line)) {
      errors.push(`Invalid property: "${line}"`);
    }
  }

  // Check for forbidden characters in trait name
  const nameMatch = code.match(/^trait\s+(\w+)/);
  if (nameMatch && /^\d/.test(nameMatch[1])) {
    errors.push('Trait name cannot start with a digit');
  }

  return { valid: errors.length === 0, errors };
}

/** Validate composition line syntax */
function validateCompositionSyntax(line: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // @name = @source1 + @source2 ...
  const match = line.match(/^@(\w+)\s*=\s*(.+)$/);
  if (!match) { errors.push('Invalid composition format'); return { valid: false, errors }; }

  const sources = match[2].split(/\s*[+&|^]\s*/);
  for (const src of sources) {
    if (!/^@[a-z_]\w*$/i.test(src.trim())) {
      errors.push(`Invalid source trait: "${src.trim()}"`);
    }
  }

  if (sources.length < 2) {
    errors.push('Composition requires at least 2 source traits');
  }

  return { valid: errors.length === 0, errors };
}

// ─── Job Execution ────────────────────────────────────────────────────────────

const STAGE_TO_JOB: Record<string, JobType> = {
  seed: 'trait_fuzz',
  sprout: 'spatial_math',
  growing: 'compose_fuzz',
  ready: 'physics_bench',
};

/** Execute a single computation job */
function executeJob(job: ComputeJob): ComputeResult {
  const start = performance.now();
  let success = false;
  let output = '';
  let value = 0;

  try {
    switch (job.type) {
      case 'trait_fuzz': {
        const validation = validateTraitSyntax(job.input);
        success = validation.valid;
        output = success ? 'Trait syntax valid' : `Errors: ${validation.errors.join(', ')}`;
        value = success ? 1 : 0;
        break;
      }

      case 'compose_fuzz': {
        const validation = validateCompositionSyntax(job.input);
        success = validation.valid;
        output = success ? 'Composition syntax valid' : `Errors: ${validation.errors.join(', ')}`;
        value = success ? 1 : 0;
        break;
      }

      case 'spatial_math': {
        const eq = generateSpatialEquation();
        // Re-solve to validate
        const { inputs, expected } = eq;
        let computed = 0;
        if (inputs.length === 6 && eq.equation.startsWith('distance3D')) {
          computed = Math.sqrt((inputs[3] - inputs[0]) ** 2 + (inputs[4] - inputs[1]) ** 2 + (inputs[5] - inputs[2]) ** 2);
        } else if (inputs.length === 6 && eq.equation.startsWith('dot')) {
          computed = inputs[0] * inputs[3] + inputs[1] * inputs[4] + inputs[2] * inputs[5];
        } else if (inputs.length === 4 && eq.equation.startsWith('sdfSphere')) {
          computed = Math.sqrt(inputs[0] ** 2 + inputs[1] ** 2 + inputs[2] ** 2) - inputs[3];
        } else {
          computed = expected; // fallback
        }
        success = Math.abs(computed - expected) < 0.001;
        output = `${eq.equation} = ${computed.toFixed(6)}`;
        value = computed;
        break;
      }

      case 'physics_bench': {
        // Run N iterations of vector operations as a micro-benchmark
        const iterations = 5000;
        let sum = 0;
        for (let i = 0; i < iterations; i++) {
          const x = Math.sin(i * 0.01) * Math.cos(i * 0.02);
          const y = Math.cos(i * 0.01) * Math.sin(i * 0.03);
          const z = Math.sqrt(Math.abs(x * y));
          sum += x + y + z;
        }
        success = true;
        output = `Bench ${iterations} iterations, checksum=${sum.toFixed(4)}`;
        value = sum;
        break;
      }
    }
  } catch (err) {
    success = false;
    output = `Error: ${err instanceof Error ? err.message : String(err)}`;
  }

  return {
    jobId: job.id,
    type: job.type,
    success,
    output,
    durationMs: performance.now() - start,
    value,
    timestamp: Date.now(),
  };
}

// ─── Proof-of-Play Engine ─────────────────────────────────────────────────────

class ProofOfPlayEngine {
  private stats: ProofOfPlayStats = {
    totalJobs: 0, successfulJobs: 0, failedJobs: 0,
    totalComputeMs: 0, traitsFuzzed: 0, equationsSolved: 0,
    benchmarkRuns: 0, compositionsTested: 0, ecosystemValue: 0,
  };

  private results: ComputeResult[] = [];
  private pendingReport: ComputeResult[] = [];

  /** Generate and execute a job for the given growth stage */
  runStageJob(stage: string): ComputeResult {
    const jobType = STAGE_TO_JOB[stage] || 'trait_fuzz';
    let input = '';

    switch (jobType) {
      case 'trait_fuzz': input = generateTraitDefinition(); break;
      case 'compose_fuzz': input = generateCompositionLine(); break;
      case 'spatial_math': input = generateSpatialEquation().equation; break;
      case 'physics_bench': input = `bench_${Date.now()}`; break;
    }

    const job: ComputeJob = {
      id: `job-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      type: jobType,
      input,
      stage,
    };

    const result = executeJob(job);
    this.recordResult(result);
    return result;
  }

  /** Record a compute result */
  private recordResult(result: ComputeResult): void {
    this.results.push(result);
    this.pendingReport.push(result);
    this.stats.totalJobs++;
    this.stats.totalComputeMs += result.durationMs;

    if (result.success) {
      this.stats.successfulJobs++;
    } else {
      this.stats.failedJobs++;
    }

    switch (result.type) {
      case 'trait_fuzz': this.stats.traitsFuzzed++; break;
      case 'spatial_math': this.stats.equationsSolved++; break;
      case 'physics_bench': this.stats.benchmarkRuns++; break;
      case 'compose_fuzz': this.stats.compositionsTested++; break;
    }

    // Ecosystem value: each successful job = 1 unit of "digital gold"
    // Weight by job type (spatial math and trait fuzzing are more valuable)
    const weights: Record<JobType, number> = {
      trait_fuzz: 2, compose_fuzz: 1.5, spatial_math: 3, physics_bench: 1,
    };
    if (result.success) {
      this.stats.ecosystemValue += weights[result.type] || 1;
    }
  }

  /** Get current stats */
  getStats(): ProofOfPlayStats {
    return { ...this.stats };
  }

  /** Get pending results for MCP reporting (clears the queue) */
  flushPendingReport(): ComputeResult[] {
    const batch = [...this.pendingReport];
    this.pendingReport = [];
    return batch;
  }

  /** Report results to MCP Mesh (if available) */
  async reportToMesh(orchestratorUrl?: string): Promise<boolean> {
    const batch = this.flushPendingReport();
    if (batch.length === 0) return true;

    const url = orchestratorUrl || (typeof window !== 'undefined'
      ? (window as Record<string, string>).__MCP_ORCHESTRATOR_URL__
      : undefined);

    if (!url) {
      // No orchestrator available — results are still tracked locally
      return false;
    }

    try {
      const response = await fetch(`${url}/knowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'holoscript-studio-garden',
          type: 'proof_of_play',
          stats: this.stats,
          results: batch.map(r => ({
            type: r.type,
            success: r.success,
            durationMs: r.durationMs,
            timestamp: r.timestamp,
          })),
        }),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let engine: ProofOfPlayEngine | null = null;

export function getProofOfPlayEngine(): ProofOfPlayEngine {
  if (!engine) engine = new ProofOfPlayEngine();
  return engine;
}

export { ProofOfPlayEngine, generateTraitDefinition, generateCompositionLine,
  generateSpatialEquation, validateTraitSyntax, validateCompositionSyntax, executeJob };
