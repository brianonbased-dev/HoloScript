#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createHoloSystemConfig, inspectHoloSystemConfig } from '../src/index.mjs';

const CLI_RECEIPT_SCHEMA = 'holoscript.holosystem.cli-receipt.v1';
const HELP = `holosystem - create or inspect a portable HoloSystem consumer config

Usage:
  holosystem create [--id <id>] [--workspace <id>] [--output <file>] [--force] [--json]
  holosystem create --stdout
  holosystem inspect [file|-] [--json]
  holosystem --help
  holosystem --version

Defaults:
  create writes holosystem.config.json and never overwrites it without --force.
  inspect reads holosystem.config.json. Use - to read JSON from stdin.
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
} else {
  die(`Unknown command ${command}. Run holosystem --help.`);
}
