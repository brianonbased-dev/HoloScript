#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  buildSubstrateClosure,
  createHoloSystemConfig,
  discoverConsumptionSurfaceCatalog,
  discoverSourceLineage,
  importNpmPackageLock,
  inspectHoloSystemConfig,
} from '../src/index.mjs';

const CLI_RECEIPT_SCHEMA = 'holoscript.holosystem.cli-receipt.v1';
const HELP = `holosystem - portable HoloSystem consumer configuration and evidence

Usage:
  holosystem create [--id <id>] [--workspace <id>] [--output <file>] [--force] [--json]
  holosystem create --stdout
  holosystem inspect [file|-] [--json]
  holosystem catalog --seeds <file> --portfolio <file> --manifest <file> [--lineage <file>] [--active-batches <file>] [--promotions <file>] [--output <file>] [--json]
  holosystem lineage --portfolio <file> [--concurrency <1-12>] [--output <file>] [--json]
  holosystem substrate-import --lock <package-lock.json> --config <file> [--output <file>] [--force] [--json]
  holosystem substrate --input <file> [--output <file>] [--force] [--json]
  holosystem --help
  holosystem --version

Defaults:
  create writes holosystem.config.json and never overwrites it without --force.
  inspect reads holosystem.config.json. Use - to read JSON from stdin.
  catalog, lineage, substrate-import, and substrate read caller-owned evidence and never read credentials.
`;

function die(message, { json = false, code = 1 } = {}) {
  if (json) {
    process.stderr.write(
      `${JSON.stringify({ schema: CLI_RECEIPT_SCHEMA, ok: false, error: message }, null, 2)}\n`
    );
  } else {
    process.stderr.write(`[holosystem] ${message}\n`);
  }
  process.exit(code);
}

function parseArguments(args, specification) {
  const options = {};
  const positionals = [];
  for (let index = 0; index < args.length; index += 1) {
    const item = args[index];
    if (!item.startsWith('--')) {
      positionals.push(item);
      continue;
    }
    const equals = item.indexOf('=');
    const name = item.slice(2, equals === -1 ? undefined : equals);
    const type = specification[name];
    if (!type) throw new Error(`Unknown option --${name}.`);
    if (type === 'boolean') {
      if (equals !== -1) throw new Error(`Option --${name} does not accept a value.`);
      options[name] = true;
      continue;
    }
    const value = equals === -1 ? args[index + 1] : item.slice(equals + 1);
    if (!value || value.startsWith('--')) throw new Error(`Option --${name} requires a value.`);
    options[name] = value;
    if (equals === -1) index += 1;
  }
  return { options, positionals };
}

function receipt(operation, fields) {
  return {
    schema: CLI_RECEIPT_SCHEMA,
    generatedAt: new Date().toISOString(),
    operation,
    ...fields,
  };
}

function outputJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function runCreate(args) {
  let parsed;
  try {
    parsed = parseArguments(args, {
      id: 'value',
      workspace: 'value',
      output: 'value',
      force: 'boolean',
      stdout: 'boolean',
      json: 'boolean',
    });
  } catch (error) {
    die(error.message, { json: args.includes('--json') });
  }
  const { options, positionals } = parsed;
  if (positionals.length > 0)
    die('create does not accept positional arguments.', { json: options.json });
  if (options.stdout && options.output) {
    die('--stdout and --output cannot be combined.', { json: options.json });
  }
  if (options.stdout && options.json) {
    die('--stdout already emits JSON config and cannot be combined with --json.', { json: true });
  }

  let config;
  try {
    config = createHoloSystemConfig({
      consumerId: options.id || 'external-founder',
      workspace: options.workspace || 'default',
    });
  } catch (error) {
    die(error.message, { json: options.json, code: 2 });
  }

  if (options.stdout) {
    outputJson(config);
    return;
  }

  const output = options.output || 'holosystem.config.json';
  const absoluteOutput = resolve(process.cwd(), output);
  if (existsSync(absoluteOutput) && !options.force) {
    die(`${output} already exists; use --force to replace it.`, { json: options.json });
  }
  writeFileSync(absoluteOutput, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  const report = inspectHoloSystemConfig(config);
  const result = receipt('create', { ok: report.ready, output, report });
  if (options.json) outputJson(result);
  else process.stdout.write(`Created ${output}\nPortable: ${report.portable ? 'yes' : 'no'}\n`);
}

function readStdin() {
  return readFileSync(0, 'utf8');
}

function readJsonFile(path, label) {
  if (!path) throw new Error(`--${label} is required.`);
  const absolute = resolve(process.cwd(), path);
  return JSON.parse(readFileSync(absolute, 'utf8').replace(/^\uFEFF/u, ''));
}

function readOptionalJsonFile(path, fallback) {
  if (!path) return fallback;
  return JSON.parse(readFileSync(resolve(process.cwd(), path), 'utf8').replace(/^\uFEFF/u, ''));
}

function writeJsonOutput(path, value, { force = false } = {}) {
  const absolute = resolve(process.cwd(), path);
  if (existsSync(absolute) && !force)
    throw new Error(`${path} already exists; use --force to replace it.`);
  writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function runInspect(args) {
  let parsed;
  try {
    parsed = parseArguments(args, { json: 'boolean' });
  } catch (error) {
    die(error.message, { json: args.includes('--json') });
  }
  const { options, positionals } = parsed;
  if (positionals.length > 1) die('inspect accepts at most one file.', { json: options.json });
  const input = positionals[0] || 'holosystem.config.json';
  let config;
  try {
    const source =
      input === '-' ? readStdin() : readFileSync(resolve(process.cwd(), input), 'utf8');
    config = JSON.parse(source.replace(/^\uFEFF/u, ''));
  } catch (error) {
    die(`Cannot read ${input}: ${error.message}`, { json: options.json });
  }

  const report = inspectHoloSystemConfig(config);
  if (options.json) outputJson(receipt('inspect', { ok: report.ready, input, report }));
  else {
    process.stdout.write(
      `Ready: ${report.ready ? 'yes' : 'no'}\nPortable: ${report.portable ? 'yes' : 'no'}\n`
    );
    for (const check of report.checks) {
      process.stdout.write(`${check.ok ? 'PASS' : 'FAIL'} ${check.id}\n`);
    }
    for (const error of report.errors) process.stdout.write(`  ${error.path}: ${error.message}\n`);
  }
  if (!report.ready) process.exitCode = 2;
}

async function runCatalog(args) {
  let parsed;
  try {
    parsed = parseArguments(args, {
      seeds: 'value',
      portfolio: 'value',
      manifest: 'value',
      lineage: 'value',
      'active-batches': 'value',
      promotions: 'value',
      output: 'value',
      force: 'boolean',
      json: 'boolean',
    });
  } catch (error) {
    die(error.message, { json: args.includes('--json') });
  }
  const { options, positionals } = parsed;
  if (positionals.length > 0)
    die('catalog does not accept positional arguments.', { json: options.json });
  let catalog;
  try {
    const seeds = readJsonFile(options.seeds, 'seeds');
    const portfolio = readJsonFile(options.portfolio, 'portfolio');
    const manifest = readJsonFile(options.manifest, 'manifest');
    const lineage = readOptionalJsonFile(options.lineage, null);
    const activeProofBatches = readOptionalJsonFile(options['active-batches'], []);
    const promotionHistory = readOptionalJsonFile(options.promotions, []);
    catalog = await discoverConsumptionSurfaceCatalog({
      seeds,
      portfolio,
      manifest,
      lineage,
      activeProofBatches: Array.isArray(activeProofBatches)
        ? activeProofBatches
        : activeProofBatches.batches,
      promotionHistory: Array.isArray(promotionHistory)
        ? promotionHistory
        : promotionHistory.promotions,
      evidence: {
        operatingSet: options.manifest,
        packageAdmission: options.portfolio,
        sourceLineage: options.lineage || 'not-supplied',
      },
    });
    if (options.output) writeJsonOutput(options.output, catalog, { force: options.force });
  } catch (error) {
    die(`Cannot build catalog: ${error.message}`, { json: options.json, code: 2 });
  }
  if (options.json) outputJson(catalog);
  else {
    process.stdout.write(`Catalog: ${catalog.status}\n`);
    for (const [id, rail] of Object.entries(catalog.rails)) {
      process.stdout.write(
        `${id}: published=${rail.published} ready=${rail.consumerReady} gaps=${rail.gaps}\n`
      );
    }
    if (options.output) process.stdout.write(`Wrote ${options.output}\n`);
  }
  if (catalog.status !== 'current') process.exitCode = 2;
}

async function runLineage(args) {
  let parsed;
  try {
    parsed = parseArguments(args, {
      portfolio: 'value',
      concurrency: 'value',
      output: 'value',
      force: 'boolean',
      json: 'boolean',
    });
  } catch (error) {
    die(error.message, { json: args.includes('--json') });
  }
  const { options, positionals } = parsed;
  if (positionals.length > 0)
    die('lineage does not accept positional arguments.', { json: options.json });
  let lineage;
  try {
    const portfolio = readJsonFile(options.portfolio, 'portfolio');
    lineage = await discoverSourceLineage({
      portfolio,
      concurrency: options.concurrency ? Number(options.concurrency) : 6,
    });
    if (options.output) writeJsonOutput(options.output, lineage, { force: options.force });
  } catch (error) {
    die(`Cannot build lineage: ${error.message}`, { json: options.json, code: 2 });
  }
  if (options.json) outputJson(lineage);
  else {
    process.stdout.write(
      `Lineage: ${lineage.status} mapped=${lineage.summary.mapped}/${lineage.summary.total} gaps=${lineage.summary.gaps}\n`
    );
    if (options.output) process.stdout.write(`Wrote ${options.output}\n`);
  }
  if (lineage.status !== 'complete') process.exitCode = 2;
}

function runSubstrateImport(args) {
  let parsed;
  try {
    parsed = parseArguments(args, {
      lock: 'value',
      config: 'value',
      output: 'value',
      force: 'boolean',
      json: 'boolean',
    });
  } catch (error) {
    die(error.message, { json: args.includes('--json') });
  }
  const { options, positionals } = parsed;
  if (positionals.length > 0) {
    die('substrate-import does not accept positional arguments.', { json: options.json });
  }

  let imported;
  try {
    const lockfile = readJsonFile(options.lock, 'lock');
    const config = readJsonFile(options.config, 'config');
    imported = importNpmPackageLock({
      lockfile,
      root: config.root,
      verificationPolicy: config.verificationPolicy,
      includeDev: config.includeDev,
      externalCustody: config.externalCustody,
    });
    if (options.output) writeJsonOutput(options.output, imported.input, { force: options.force });
  } catch (error) {
    die(`Cannot import npm substrate: ${error.message}`, {
      json: options.json,
      code: 2,
    });
  }

  if (options.json) outputJson(imported);
  else {
    process.stdout.write(
      `Substrate import: ${imported.status} components=${imported.summary.components} dependencies=${imported.summary.dependencies} missing-attestations=${imported.summary.missingAttestations}\n`
    );
    for (const item of imported.issues) {
      process.stdout.write(`BLOCK ${item.code} ${item.path}: ${item.message}\n`);
    }
    if (options.output) process.stdout.write(`Wrote ${options.output}\n`);
  }
  if (!imported.importable) process.exitCode = 2;
}

function runSubstrate(args) {
  let parsed;
  try {
    parsed = parseArguments(args, {
      input: 'value',
      output: 'value',
      force: 'boolean',
      json: 'boolean',
    });
  } catch (error) {
    die(error.message, { json: args.includes('--json') });
  }
  const { options, positionals } = parsed;
  if (positionals.length > 0) {
    die('substrate does not accept positional arguments.', { json: options.json });
  }

  let substrate;
  try {
    const input = readJsonFile(options.input, 'input');
    substrate = buildSubstrateClosure(input);
    if (options.output) writeJsonOutput(options.output, substrate, { force: options.force });
  } catch (error) {
    die(`Cannot build substrate closure: ${error.message}`, {
      json: options.json,
      code: 2,
    });
  }

  if (options.json) outputJson(substrate);
  else {
    process.stdout.write(
      `Substrate: ${substrate.status} components=${substrate.summary.components} dependencies=${substrate.summary.dependencies} external=${substrate.summary.external}\n`
    );
    for (const boundary of substrate.sovereignty.externalBoundaries) {
      process.stdout.write(
        `EXTERNAL ${boundary.id} kind=${boundary.kind} owner=${boundary.owner}\n`
      );
    }
    for (const item of substrate.issues) {
      process.stdout.write(`BLOCK ${item.code} ${item.path}: ${item.message}\n`);
    }
    if (options.output) process.stdout.write(`Wrote ${options.output}\n`);
  }
  if (!substrate.ready) process.exitCode = 2;
}

const argv = process.argv.slice(2);
const command = argv[0];
if (!command || command === '--help' || command === '-h' || command === 'help') {
  process.stdout.write(HELP);
} else if (command === '--version' || command === '-v') {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  process.stdout.write(`${manifest.version}\n`);
} else if (command === 'create') {
  runCreate(argv.slice(1));
} else if (command === 'inspect') {
  runInspect(argv.slice(1));
} else if (command === 'catalog') {
  await runCatalog(argv.slice(1));
} else if (command === 'lineage') {
  await runLineage(argv.slice(1));
} else if (command === 'substrate-import') {
  runSubstrateImport(argv.slice(1));
} else if (command === 'substrate') {
  runSubstrate(argv.slice(1));
} else {
  die(`Unknown command ${command}. Run holosystem --help.`);
}
