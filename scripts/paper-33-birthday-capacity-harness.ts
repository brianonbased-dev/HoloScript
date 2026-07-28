import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { getAllEntries, validateCoord } from '../packages/core/src/traits/pillar/BrainCoordMapper';

interface HarnessOptions {
  addressSpace: number;
  addressesPerSimulation: number;
  trials: number;
  seed: number;
  sampleSizes: number[];
  simulationCounts: number[];
  out: string;
}

interface MonteCarloResult {
  trials: number;
  collisions: number;
  collision_probability: number;
  standard_error: number;
}

const DEFAULT_OPTIONS: HarnessOptions = {
  addressSpace: 510_000,
  addressesPerSimulation: 1_000,
  trials: 10_000,
  seed: 0x5eed_0033,
  sampleSizes: [10, 25, 50, 75, 100, 101, 102, 150, 250, 500, 1_000],
  simulationCounts: [1, 2, 5, 10, 25, 50, 100, 250, 500],
  out: 'research/paper-33-artifacts/birthday-capacity-2026-06-21.json',
};

function parseCsvInts(value: string, name: string): number[] {
  const parsed = value
    .split(',')
    .map((item) => Number.parseInt(item.trim(), 10))
    .filter((item) => Number.isFinite(item));
  if (parsed.length === 0 || parsed.some((item) => item < 0)) {
    throw new Error(`Invalid --${name}: ${value}`);
  }
  return parsed;
}

function parseArgs(argv: string[]): HarnessOptions {
  const options = { ...DEFAULT_OPTIONS };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const next = argv[i + 1];
    if (arg === '--address-space' && next) {
      options.addressSpace = Number.parseInt(next, 10);
      i++;
    } else if (arg === '--addresses-per-sim' && next) {
      options.addressesPerSimulation = Number.parseInt(next, 10);
      i++;
    } else if (arg === '--trials' && next) {
      options.trials = Number.parseInt(next, 10);
      i++;
    } else if (arg === '--seed' && next) {
      options.seed = Number.parseInt(next, 10);
      i++;
    } else if (arg === '--sample-sizes' && next) {
      options.sampleSizes = parseCsvInts(next, 'sample-sizes');
      i++;
    } else if (arg === '--simulation-counts' && next) {
      options.simulationCounts = parseCsvInts(next, 'simulation-counts');
      i++;
    } else if (arg === '--out' && next) {
      options.out = next;
      i++;
    } else if (arg === '--help') {
      printHelpAndExit();
    } else {
      throw new Error(`Unknown or missing argument: ${arg}`);
    }
  }

  if (!Number.isInteger(options.addressSpace) || options.addressSpace <= 1) {
    throw new Error('--address-space must be an integer greater than 1');
  }
  if (!Number.isInteger(options.addressesPerSimulation) || options.addressesPerSimulation <= 0) {
    throw new Error('--addresses-per-sim must be a positive integer');
  }
  if (!Number.isInteger(options.trials) || options.trials <= 0) {
    throw new Error('--trials must be a positive integer');
  }
  return options;
}

function printHelpAndExit(): never {
  console.log(`Usage: pnpm exec tsx scripts/paper-33-birthday-capacity-harness.ts [options]

Options:
  --address-space <n>         Address slots, default 510000
  --addresses-per-sim <n>     Unique slice addresses per simulation, default 1000
  --trials <n>                Monte Carlo trials per coordinate-draw row, default 10000
  --seed <n>                  Deterministic xorshift seed
  --sample-sizes <csv>        Coordinate draw counts for analytic + Monte Carlo rows
  --simulation-counts <csv>   Simulation counts for namespace/full-sim rows
  --out <path>                JSON output path`);
  process.exit(0);
}

function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  if (state === 0) state = 0x9e37_79b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

function round(value: number, digits = 12): number {
  if (!Number.isFinite(value)) return value;
  return Number(value.toFixed(digits));
}

function collisionProbability(draws: number, addressSpace: number): number {
  if (draws <= 1) return 0;
  if (draws > addressSpace) return 1;

  let logNoCollision = 0;
  for (let i = 0; i < draws; i++) {
    logNoCollision += Math.log1p(-i / addressSpace);
  }

  return 1 - Math.exp(logNoCollision);
}

function monteCarloCollisionProbability(
  draws: number,
  addressSpace: number,
  trials: number,
  rng: () => number
): MonteCarloResult {
  let collisions = 0;
  for (let trial = 0; trial < trials; trial++) {
    const seen = new Set<number>();
    let collision = false;
    for (let draw = 0; draw < draws; draw++) {
      const slot = Math.floor(rng() * addressSpace);
      if (seen.has(slot)) {
        collision = true;
        break;
      }
      seen.add(slot);
    }
    if (collision) collisions++;
  }

  const p = collisions / trials;
  return {
    trials,
    collisions,
    collision_probability: round(p),
    standard_error: round(Math.sqrt((p * (1 - p)) / trials)),
  };
}

function firstDrawCountAbove(targetProbability: number, addressSpace: number): number {
  for (let draws = 0; draws <= addressSpace + 1; draws++) {
    if (collisionProbability(draws, addressSpace) > targetProbability) {
      return draws;
    }
  }
  return addressSpace + 1;
}

function sortedStringify(value: unknown): string {
  return JSON.stringify(sortForJson(value), null, 2);
}

function sortForJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortForJson);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.keys(record)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortForJson(record[key]);
        return acc;
      }, {});
  }
  return value;
}

function sha256Hex(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function run(): void {
  const options = parseArgs(process.argv.slice(2));
  const rng = makeRng(options.seed);
  const mapperEntries = getAllEntries();
  const invalidMapperEntries = mapperEntries
    .filter(({ entry }) => !validateCoord(entry))
    .map(({ domain }) => domain);
  const firstAboveOnePercent = firstDrawCountAbove(0.01, options.addressSpace);

  const coordinateDrawRows = options.sampleSizes.map((draws) => ({
    draws,
    analytic_collision_probability: round(collisionProbability(draws, options.addressSpace)),
    monte_carlo: monteCarloCollisionProbability(draws, options.addressSpace, options.trials, rng),
  }));

  const namespacedSimulationRows = options.simulationCounts.map((simulations) => ({
    simulations,
    equivalent_draws: simulations,
    analytic_collision_probability: round(collisionProbability(simulations, options.addressSpace)),
  }));

  const fullSimulationRows = options.simulationCounts.map((simulations) => {
    const draws = simulations * options.addressesPerSimulation;
    return {
      simulations,
      addresses_per_simulation: options.addressesPerSimulation,
      equivalent_draws: draws,
      analytic_collision_probability: round(collisionProbability(draws, options.addressSpace)),
    };
  });

  const body = {
    harness: {
      name: 'paper-33-birthday-capacity-harness',
      generated_at: new Date().toISOString(),
      script: 'scripts/paper-33-birthday-capacity-harness.ts',
      seed: options.seed,
      monte_carlo_trials_per_coordinate_row: options.trials,
    },
    brain_coord_mapper: {
      source_path: 'packages/core/src/traits/pillar/BrainCoordMapper.ts',
      seed_entry_count: mapperEntries.length,
      invalid_seed_entries: invalidMapperEntries,
      domains: mapperEntries.map(({ domain, entry }) => ({
        domain,
        mni_x: entry.mni_x,
        mni_y: entry.mni_y,
        mni_z: entry.mni_z,
        cortical_depth: entry.cortical_depth,
        brodmann_area: entry.brodmann_area ?? null,
        surface_type: entry.surface_type ?? null,
      })),
    },
    mni152_capacity_model: {
      gray_matter_voxels_1mm: 85_000,
      cortical_depth_layers: 6,
      address_space: options.addressSpace,
      source_formula: '85000 1mm gray-matter voxels * 6 cortical depth layers',
      birthday_bound_thresholds: {
        first_unique_draw_count_above_1pct: firstAboveOnePercent,
        max_unique_draw_count_at_or_below_1pct: firstAboveOnePercent - 1,
        collision_probability_at_500_unique_draws: round(
          collisionProbability(500, options.addressSpace)
        ),
      },
    },
    coordinate_draw_rows: coordinateDrawRows,
    simulation_namespace_rows: namespacedSimulationRows,
    full_simulation_slice_rows: fullSimulationRows,
    paper_claim_check: {
      claim:
        'At ~1000 unique slices per 15-day physics simulation, 510000 addresses support ~500 full simulations before collision risk exceeds 1%.',
      stated_simulations: 500,
      stated_addresses_per_simulation: options.addressesPerSimulation,
      threshold: 0.01,
      if_one_address_per_simulation_collision_probability: round(
        collisionProbability(500, options.addressSpace)
      ),
      if_1000_addresses_per_simulation_collision_probability: round(
        collisionProbability(500 * options.addressesPerSimulation, options.addressSpace)
      ),
      supported_under_plain_birthday_bound: false,
      conclusion:
        'The implemented BrainCoordMapper is present and valid, but the ~500 simulations before 1% collision-risk statement is not supported by the ordinary birthday bound for a 510000-slot global address space.',
    },
  };

  const bodyJson = sortedStringify(body);
  const artifact = {
    artifact_body_sha256: sha256Hex(bodyJson),
    ...body,
  };
  const artifactJson = `${sortedStringify(artifact)}\n`;
  mkdirSync(dirname(options.out), { recursive: true });
  writeFileSync(options.out, artifactJson, 'utf8');

  console.log(
    JSON.stringify(
      {
        out: options.out,
        artifact_sha256: sha256Hex(artifactJson),
        artifact_body_sha256: artifact.artifact_body_sha256,
        seed_entry_count: mapperEntries.length,
        invalid_seed_entries: invalidMapperEntries.length,
        first_unique_draw_count_above_1pct: firstAboveOnePercent,
        p_collision_500_unique_draws:
          artifact.paper_claim_check.if_one_address_per_simulation_collision_probability,
        p_collision_500_full_simulations:
          artifact.paper_claim_check.if_1000_addresses_per_simulation_collision_probability,
      },
      null,
      2
    )
  );
}

run();
