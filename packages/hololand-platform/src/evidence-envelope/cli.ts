#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  buildEvidenceEnvelope,
  buildPaper12HololandEvidenceEnvelope,
  collectEvidenceRuntime,
  collectGitRevision,
  type EvidenceArtifactInput,
} from './index';

interface ParsedArgs {
  cwd?: string;
  generatedAt?: string;
  hardwareTier?: string;
  harnessCommand?: string;
  help?: boolean;
  hololandRoot?: string;
  out?: string;
  output?: string;
  preset?: string;
  rerunCommand?: string;
  seed?: string;
  setupCommand?: string;
  artifact: string[];
}

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printHelp();
  process.exit(0);
}

const cwd = resolve(args.cwd ?? findGitRoot(process.cwd()) ?? process.cwd());
const out = resolve(cwd, args.out ?? args.output ?? 'docs/public/evidence/paper-12-hololand-envelope.json');
const preset = args.preset ?? 'paper-12-hololand';
const runtime = collectEvidenceRuntime();

const manifest =
  preset === 'paper-12-hololand'
    ? buildPaper12HololandEvidenceEnvelope({
        cwd,
        generatedAt: args.generatedAt,
        hardwareTier: args.hardwareTier,
        hololandRoot: args.hololandRoot,
        outputPath: relativeFromCwd(cwd, out),
        runtime,
        seed: args.seed,
        setupCommand: args.setupCommand,
        harnessCommand: args.harnessCommand,
        rerunCommand: args.rerunCommand,
        ...(args.artifact.length ? { artifacts: args.artifact.map(parseArtifact) } : {}),
      })
    : buildEvidenceEnvelope({
        cwd,
        generatedAt: args.generatedAt,
        hardwareTier: args.hardwareTier ?? 'custom-local',
        runtime,
        sourceRevisions: [collectGitRevision(cwd, 'HoloScript')],
        paper: {
          id: preset,
          title: preset,
        },
        setupCommand: args.setupCommand ?? 'pnpm install --frozen-lockfile',
        seed: args.seed ?? `${preset}-evidence-envelope-v1`,
        harnessCommand: args.harnessCommand ?? 'pnpm test',
        rerunCommand:
          args.rerunCommand ??
          `pnpm --filter @holoscript/hololand-platform run evidence-envelope -- --preset ${preset} --out ${relativeFromCwd(cwd, out)}`,
        artifacts: args.artifact.map(parseArtifact),
      });

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

console.error(`[evidence-envelope] wrote ${relativeFromCwd(cwd, out)}`);
console.error(`[evidence-envelope] manifest ${manifest.manifestId} ${manifest.manifestHash}`);

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = { artifact: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') continue;
    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
      continue;
    }
    if (arg === '--artifact') {
      parsed.artifact.push(readValue(argv, ++i, arg));
      continue;
    }
    if (arg.startsWith('--artifact=')) {
      parsed.artifact.push(arg.slice('--artifact='.length));
      continue;
    }
    if (!arg.startsWith('--')) {
      throw new Error(`Unexpected positional argument: ${arg}`);
    }

    const [rawKey, inline] = arg.slice(2).split(/=(.*)/s, 2);
    const key = rawKey.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
    const value = inline ?? readValue(argv, ++i, arg);
    (parsed as unknown as Record<string, string>)[key] = value;
  }
  return parsed;
}

function parseArtifact(value: string): EvidenceArtifactInput {
  const [roleAndRepo, rawPath] = value.split(/:(.*)/s, 2);
  if (!rawPath) {
    return { role: 'source', path: value };
  }
  const [role, repo] = roleAndRepo.includes('@')
    ? roleAndRepo.split('@', 2)
    : [roleAndRepo, undefined];
  return {
    role: role as EvidenceArtifactInput['role'],
    ...(repo ? { repo } : {}),
    path: rawPath,
  };
}

function readValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function relativeFromCwd(cwd: string, path: string): string {
  const normalizedCwd = cwd.replace(/\\/g, '/').replace(/\/$/, '');
  const normalizedPath = resolve(path).replace(/\\/g, '/');
  return normalizedPath.startsWith(`${normalizedCwd}/`)
    ? normalizedPath.slice(normalizedCwd.length + 1)
    : normalizedPath;
}

function findGitRoot(cwd: string): string | undefined {
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd,
    encoding: 'utf8',
    timeout: 5_000,
  });
  if (result.status !== 0) return undefined;
  return result.stdout.trim() || undefined;
}

function printHelp(): void {
  console.log(`HoloScript evidence-envelope generator

Usage:
  hololand-evidence-envelope --preset paper-12-hololand --out docs/public/evidence/paper-12-hololand-envelope.json

Options:
  --preset <name>          Preset to generate; default paper-12-hololand
  --out <path>             Output JSON path
  --generated-at <iso>     Override generatedAt for reproducible fixtures
  --hardware-tier <label>  Hardware tier label
  --seed <seed>            Reproducibility seed
  --artifact <role:path>   Add artifact path for custom presets
  --help                   Show this message
`);
}
