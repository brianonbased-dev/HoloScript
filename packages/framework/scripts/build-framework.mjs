import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const distDir = join(packageRoot, 'dist');
const require = createRequire(import.meta.url);
const nodeCmd = process.execPath;
const tsupCli = require.resolve('tsup/dist/cli-default.js', { paths: [packageRoot] });
const tscCli = require.resolve('typescript/bin/tsc', { paths: [packageRoot] });

const buildSteps = [
  {
    name: 'root',
    config: 'tsup.config.ts',
    heapMb: 6144,
  },
  {
    name: 'agents/economy/swarm',
    config: 'tsup.config.agents.ts',
    heapMb: 4096,
  },
  {
    name: 'ai/training/learning',
    config: 'tsup.config.ai.ts',
    heapMb: 4096,
  },
  {
    name: 'skills/negotiation',
    config: 'tsup.config.skills.ts',
    heapMb: 4096,
  },
];

rmSync(distDir, { recursive: true, force: true });

for (const step of buildSteps) {
  console.log(`\n=== Building framework batch: ${step.name} (${step.heapMb} MB heap) ===`);

  const existingNodeOptions = process.env.NODE_OPTIONS?.trim();
  const nodeOptions = [existingNodeOptions, `--max-old-space-size=${step.heapMb}`]
    .filter(Boolean)
    .join(' ');

  const result = spawnSync(
    nodeCmd,
    [tsupCli, '--config', step.config],
    {
      cwd: packageRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_OPTIONS: nodeOptions,
      },
    }
  );

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log('\n=== Emitting framework declarations with tsc ===');

const declarationResult = spawnSync(
  nodeCmd,
  [tscCli, '-p', 'tsconfig.build.json'],
  {
    cwd: packageRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_OPTIONS: [process.env.NODE_OPTIONS?.trim(), '--max-old-space-size=12288']
        .filter(Boolean)
        .join(' '),
    },
  }
);

if (declarationResult.status !== 0) {
  process.exit(declarationResult.status ?? 1);
}
