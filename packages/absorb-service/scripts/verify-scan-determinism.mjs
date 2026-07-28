#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const packageRoot = resolve(repoRoot, 'packages/absorb-service');

function hash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function stableScan(scan) {
  return Object.fromEntries(
    [...scan.files]
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((file) => [
        file.path,
        (() => {
          const data = {
            language: file.language,
            symbols: [...file.symbols].sort((a, b) =>
              JSON.stringify(a).localeCompare(JSON.stringify(b))
            ),
            imports: [...file.imports].sort((a, b) =>
              JSON.stringify(a).localeCompare(JSON.stringify(b))
            ),
            calls: [...file.calls].sort((a, b) =>
              JSON.stringify(a).localeCompare(JSON.stringify(b))
            ),
            emitSites: [...(file.emitSites ?? [])].sort((a, b) =>
              JSON.stringify(a).localeCompare(JSON.stringify(b))
            ),
            listenSites: [...(file.listenSites ?? [])].sort((a, b) =>
              JSON.stringify(a).localeCompare(JSON.stringify(b))
            ),
            loc: file.loc,
            sizeBytes: file.sizeBytes,
            docComment: file.docComment ?? null,
          };
          return {
            hash: hash(data),
            symbols: file.symbols.length,
            imports: file.imports.length,
            calls: file.calls.length,
            data,
          };
        })(),
      ])
  );
}

function firstDifference(first, second) {
  const length = Math.max(first?.length ?? 0, second?.length ?? 0);
  for (let index = 0; index < length; index += 1) {
    if (JSON.stringify(first?.[index]) !== JSON.stringify(second?.[index])) {
      return { index, first: first?.[index] ?? null, second: second?.[index] ?? null };
    }
  }
  return null;
}

function publicFileRecord(record) {
  if (!record) return null;
  return {
    hash: record.hash,
    symbols: record.symbols,
    imports: record.imports,
    calls: record.calls,
  };
}

async function scanOnce(CodebaseScanner) {
  const scanner = new CodebaseScanner(undefined, false);
  try {
    return await scanner.scan({
      rootDir: packageRoot,
      languages: ['typescript'],
      maxFiles: 500,
      exclude: ['node_modules', 'dist', '__tests__', 'scripts'],
      excludeNameFragments: ['.test.', '.spec.'],
    });
  } finally {
    await scanner.dispose?.();
  }
}

function parseArgs(argv) {
  const options = { out: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    const [flag, inline] = raw.split('=', 2);
    const value = inline ?? argv[index + 1];
    if (inline === undefined && value && !value.startsWith('--')) index += 1;
    if (flag === '--out') options.out = resolve(repoRoot, value);
  }
  return options;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const engineUrl = pathToFileURL(resolve(packageRoot, 'dist/engine/index.js')).href;
  const { CodebaseScanner } = await import(engineUrl);
  const first = stableScan(await scanOnce(CodebaseScanner));
  const second = stableScan(await scanOnce(CodebaseScanner));
  const paths = [...new Set([...Object.keys(first), ...Object.keys(second)])].sort();
  const differences = paths
    .filter((path) => first[path]?.hash !== second[path]?.hash)
    .map((path) => ({
      path,
      first: publicFileRecord(first[path]),
      second: publicFileRecord(second[path]),
      symbolDifference: firstDifference(first[path]?.data.symbols, second[path]?.data.symbols),
      importDifference: firstDifference(first[path]?.data.imports, second[path]?.data.imports),
      callDifference: firstDifference(first[path]?.data.calls, second[path]?.data.calls),
      metadataDifference:
        JSON.stringify({
          ...first[path]?.data,
          symbols: undefined,
          imports: undefined,
          calls: undefined,
        }) ===
        JSON.stringify({
          ...second[path]?.data,
          symbols: undefined,
          imports: undefined,
          calls: undefined,
        })
          ? null
          : {
              first: {
                ...first[path]?.data,
                symbols: undefined,
                imports: undefined,
                calls: undefined,
              },
              second: {
                ...second[path]?.data,
                symbols: undefined,
                imports: undefined,
                calls: undefined,
              },
            },
    }));
  const receipt = {
    schemaVersion: 'holoscript.absorb.scan-determinism.v1',
    status: differences.length === 0 ? 'pass' : 'fail',
    packageRoot,
    first: {
      files: Object.keys(first).length,
      sha256: hash(
        Object.fromEntries(Object.entries(first).map(([path, record]) => [path, record.hash]))
      ),
    },
    second: {
      files: Object.keys(second).length,
      sha256: hash(
        Object.fromEntries(Object.entries(second).map(([path, record]) => [path, record.hash]))
      ),
    },
    differences,
  };
  if (options.out) {
    mkdirSync(dirname(options.out), { recursive: true });
    writeFileSync(options.out, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  }
  console.log(JSON.stringify(receipt, null, 2));
  return receipt.status === 'pass' ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      console.error(error instanceof Error ? error.stack : error);
      process.exit(1);
    }
  );
}
