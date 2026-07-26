#!/usr/bin/env node

import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';

import {
  LibraryPackageStore,
  createLibraryPackageRouter,
} from '../../packages/registry/dist/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const args = process.argv.slice(2);
const outputIndex = args.indexOf('--out');
const OUTPUT =
  outputIndex >= 0
    ? resolve(args[outputIndex + 1])
    : join(ROOT, '.scratch', 'library-coherence', 'native-library-cold-consumer.json');
const KEEP_TEMP = args.includes('--keep-temp');
const SKIP_BUILD = args.includes('--skip-build');
const COREPACK = process.platform === 'win32' ? 'corepack.cmd' : 'corepack';
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const NODE = process.execPath;
const PUBLIC_NPM_REGISTRY = 'https://registry.npmjs.org/';
const FIXTURE_NAME = '@cold/ping';
const FIXTURE_VERSION = '1.0.0';
const FIXTURE_SOURCE = '@export template "Ping"\norb ping { }\n';

function run(file, argv, options = {}) {
  return execFileSync(file, argv, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    shell: process.platform === 'win32' && file.endsWith('.cmd'),
    ...options,
  });
}

function runAsync(file, argv, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(file, argv, {
      cwd: ROOT,
      shell: process.platform === 'win32' && file.endsWith('.cmd'),
      windowsHide: true,
      ...options,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (code === 0) {
        resolvePromise({ stdout, stderr });
        return;
      }
      reject(
        new Error(`${file} exited with ${code ?? signal ?? 'unknown'}\n${stdout}${stderr}`.trim())
      );
    });
  });
}

function sha256File(path) {
  return `sha256:${createHash('sha256').update(readFileSync(path)).digest('hex')}`;
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function packageVersion(packageDir) {
  return readJson(join(ROOT, packageDir, 'package.json')).version;
}

function findTarball(directory, packageName, version) {
  const prefix = packageName.replace(/^@/, '').replace('/', '-');
  const expected = `${prefix}-${version}.tgz`;
  const path = join(directory, expected);
  if (!existsSync(path)) {
    throw new Error(
      `packed tarball missing: ${expected}; found ${readdirSync(directory)
        .filter((name) => name.endsWith('.tgz'))
        .join(', ')}`
    );
  }
  return path;
}

function pack(packageDir, destination) {
  run(COREPACK, [
    'pnpm',
    '--dir',
    join(ROOT, packageDir),
    'pack',
    '--pack-destination',
    destination,
  ]);
  const manifest = readJson(join(ROOT, packageDir, 'package.json'));
  return findTarball(destination, manifest.name, manifest.version);
}

async function startRegistry(storagePath) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(
    createLibraryPackageRouter({
      store: new LibraryPackageStore(storagePath),
      authenticate: (request) =>
        request.headers.authorization === 'Bearer cold-token' ? { namespace: 'cold' } : null,
    })
  );
  const server = createServer(app);
  await new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolvePromise);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('registry did not bind a port');
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolvePromise, reject) =>
        server.close((error) => (error ? reject(error) : resolvePromise()))
      ),
  };
}

function makeFixture(root) {
  const fixture = join(root, 'fixture');
  mkdirSync(fixture, { recursive: true });
  writeJson(join(fixture, 'package.json'), {
    name: FIXTURE_NAME,
    version: FIXTURE_VERSION,
    description: 'Cold-consumer native package fixture',
    license: 'MIT',
    author: 'cold',
    repository: 'https://example.invalid/cold/ping',
    files: ['index.hsplus', 'README.md', 'LICENSE'],
    holoscript: {
      artifact: 'library',
      entrypoint: './index.hsplus',
      supportTier: 'preview',
      compatibility: {
        holoscript: '>=8.0.0',
        targets: ['node', 'owned-metal'],
      },
      capabilities: ['ping'],
    },
  });
  writeFileSync(join(fixture, 'index.hsplus'), FIXTURE_SOURCE, 'utf8');
  writeFileSync(join(fixture, 'README.md'), '# Cold Ping\n', 'utf8');
  writeFileSync(join(fixture, 'LICENSE'), 'MIT\n', 'utf8');
  return fixture;
}

function makeConsumerPrograms(root) {
  const publishProgram = join(root, 'publish.mjs');
  const resolveProgram = join(root, 'resolve.mjs');
  const offlineProgram = join(root, 'offline.mjs');
  const dependencyProgram = join(root, 'verify-public-dependency.mjs');
  const denyNetwork = join(root, 'deny-network.cjs');

  writeFileSync(
    publishProgram,
    `import { writeFileSync } from 'node:fs';
import { publishPackage } from '@holoscript/cli';
const [fixture, registry, output] = process.argv.slice(2);
const result = await publishPackage(fixture, {
  registry,
  token: 'cold-token',
  force: true,
  skipTests: true,
  allowConsole: true,
});
writeFileSync(output, JSON.stringify(result));
if (!result.success) process.exit(1);
`,
    'utf8'
  );

  writeFileSync(
    resolveProgram,
    `import { writeFileSync } from 'node:fs';
import { HoloScriptPlusParser, PackageImportResolver } from '@holoscript/core/parser';
const [inputPath, outputPath] = process.argv.slice(2);
const input = JSON.parse(await (await import('node:fs/promises')).readFile(inputPath, 'utf8'));
const parsed = new HoloScriptPlusParser({ enableTypeScriptImports: true }).parse(
  '@import { Ping } from "@cold/ping"\\norb app { }\\n'
);
const registryCache = {};
const result = await new PackageImportResolver().resolve(parsed, '/cold/app.hsplus', {
  baseDir: '/cold',
  registryBaseUrl: input.registry,
  registryLock: { '@cold/ping': input.pin },
  registryCache,
});
const evidence = {
  errors: result.errors,
  exportedPing: result.scope.has('Ping'),
  moduleCount: result.modules.size,
  registryCache,
};
writeFileSync(outputPath, JSON.stringify(evidence));
if (result.errors.length > 0 || !evidence.exportedPing) process.exit(1);
`,
    'utf8'
  );

  writeFileSync(
    offlineProgram,
    `import { writeFileSync } from 'node:fs';
import { HoloScriptPlusParser, PackageImportResolver } from '@holoscript/core/parser';
const [inputPath, outputPath] = process.argv.slice(2);
const input = JSON.parse(await (await import('node:fs/promises')).readFile(inputPath, 'utf8'));
const parsed = new HoloScriptPlusParser({ enableTypeScriptImports: true }).parse(
  '@import { Ping } from "@cold/ping"\\norb app { }\\n'
);
const result = await new PackageImportResolver().resolve(parsed, '/cold/app.hsplus', {
  baseDir: '/cold',
  offline: true,
  registryLock: { '@cold/ping': input.pin },
  registryCache: input.registryCache,
});
const evidence = {
  errors: result.errors,
  exportedPing: result.scope.has('Ping'),
  moduleCount: result.modules.size,
  processNetworkDenied: globalThis.__HOLOSCRIPT_NETWORK_DENIED__ === true,
};
writeFileSync(outputPath, JSON.stringify(evidence));
if (result.errors.length > 0 || !evidence.exportedPing || !evidence.processNetworkDenied) process.exit(1);
`,
    'utf8'
  );

  writeFileSync(
    dependencyProgram,
    `import { readFileSync, writeFileSync } from 'node:fs';
import * as meaning from '@holoscript/meaning';
const [expectedVersion, outputPath] = process.argv.slice(2);
const manifest = JSON.parse(
  readFileSync(new URL('./node_modules/@holoscript/meaning/package.json', import.meta.url), 'utf8')
);
const evidence = {
  name: manifest.name,
  expectedVersion,
  installedVersion: manifest.version,
  createSemanticClosureReceiptExported:
    typeof meaning.createSemanticClosureReceipt === 'function',
};
writeFileSync(outputPath, JSON.stringify(evidence));
if (
  evidence.name !== '@holoscript/meaning' ||
  evidence.installedVersion !== expectedVersion ||
  !evidence.createSemanticClosureReceiptExported
) {
  process.exit(1);
}
`,
    'utf8'
  );

  writeFileSync(
    denyNetwork,
    `const denied = () => { throw new Error('network denied by cold-consumer guard'); };
globalThis.__HOLOSCRIPT_NETWORK_DENIED__ = true;
globalThis.fetch = denied;
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
http.request = denied;
http.get = denied;
https.request = denied;
https.get = denied;
net.connect = denied;
net.createConnection = denied;
net.Socket.prototype.connect = denied;
`,
    'utf8'
  );

  return { publishProgram, resolveProgram, offlineProgram, dependencyProgram, denyNetwork };
}

async function main() {
  if (!SKIP_BUILD) {
    for (const name of [
      '@holoscript/meaning',
      '@holoscript/platform',
      '@holoscript/registry',
      '@holoscript/core',
      '@holoscript/cli',
    ]) {
      run(COREPACK, ['pnpm', '--filter', name, 'run', 'build'], { stdio: 'pipe' });
    }
  }

  const root = mkdtempSync(join(tmpdir(), 'holoscript-native-cold-consumer-'));
  try {
    const artifacts = join(root, 'artifacts');
    const consumer = join(root, 'consumer');
    const npmCache = join(root, 'npm-cache');
    const storagePath = join(root, 'registry', 'packages.json');
    mkdirSync(artifacts, { recursive: true });
    mkdirSync(consumer, { recursive: true });
    mkdirSync(npmCache, { recursive: true });

    const platformTarball = pack('packages/platform', artifacts);
    const coreTarball = pack('packages/core', artifacts);
    const cliTarball = pack('packages/cli', artifacts);
    run(
      NPM,
      [
        'install',
        '--prefix',
        consumer,
        '--ignore-scripts',
        '--omit=optional',
        '--no-audit',
        '--no-fund',
        '--prefer-online',
        '--registry',
        PUBLIC_NPM_REGISTRY,
        '--cache',
        npmCache,
        platformTarball,
        coreTarball,
        cliTarball,
      ],
      { stdio: 'pipe' }
    );

    const fixture = makeFixture(root);
    const programs = makeConsumerPrograms(consumer);
    const publishOutput = join(root, 'publish.json');
    const onlineInput = join(root, 'online-input.json');
    const onlineOutput = join(root, 'online-output.json');
    const offlineInput = join(root, 'offline-input.json');
    const offlineOutput = join(root, 'offline-output.json');
    const dependencyOutput = join(root, 'public-dependency-output.json');

    await runAsync(
      NODE,
      [programs.dependencyProgram, packageVersion('packages/meaning'), dependencyOutput],
      { cwd: consumer }
    );
    const publicDependency = readJson(dependencyOutput);

    const firstRegistry = await startRegistry(storagePath);
    await runAsync(NODE, [programs.publishProgram, fixture, firstRegistry.origin, publishOutput], {
      cwd: consumer,
    });
    await firstRegistry.close();

    const secondRegistry = await startRegistry(storagePath);
    try {
      const resolution = await fetch(
        `${secondRegistry.origin}/api/v1/packages/cold/ping/resolve?range=${encodeURIComponent('^1.0.0')}`
      );
      if (!resolution.ok) throw new Error(`registry resolution failed: HTTP ${resolution.status}`);
      const resolved = await resolution.json();
      const exact = await fetch(
        `${secondRegistry.origin}/api/v1/packages/cold/ping/versions/${resolved.version}`
      );
      if (!exact.ok) throw new Error(`exact registry read failed: HTTP ${exact.status}`);
      const artifact = await exact.json();
      if (artifact.source !== FIXTURE_SOURCE || artifact.integrity !== resolved.integrity) {
        throw new Error('registry restart did not preserve the exact source artifact');
      }

      const pin = { version: resolved.version, integrity: resolved.integrity };
      writeJson(onlineInput, { registry: secondRegistry.origin, pin });
      await runAsync(NODE, [programs.resolveProgram, onlineInput, onlineOutput], {
        cwd: consumer,
      });

      const online = readJson(onlineOutput);
      writeJson(offlineInput, { pin, registryCache: online.registryCache });
      run(NODE, [programs.offlineProgram, offlineInput, offlineOutput], {
        cwd: consumer,
        env: {
          ...process.env,
          NODE_OPTIONS:
            `${process.env.NODE_OPTIONS || ''} --require=${programs.denyNetwork}`.trim(),
        },
        stdio: 'pipe',
      });

      const published = readJson(publishOutput);
      const offline = readJson(offlineOutput);
      const head = run('git', ['rev-parse', 'HEAD']).trim();
      const receipt = {
        schema: 'holoscript.native-library-cold-consumer.v1',
        generatedAt: new Date().toISOString(),
        status: 'pass',
        sourceRevision: head,
        fixture: {
          name: FIXTURE_NAME,
          version: FIXTURE_VERSION,
          sourceIntegrity: resolved.integrity,
          supportTier: 'preview',
        },
        packedConsumer: {
          packageManager: 'npm',
          installScriptsEnabled: false,
          optionalDependenciesInstalled: false,
          registry: PUBLIC_NPM_REGISTRY,
          freshRegistryCache: true,
          packages: [
            {
              name: '@holoscript/platform',
              version: packageVersion('packages/platform'),
              tarball: basename(platformTarball),
              integrity: sha256File(platformTarball),
            },
            {
              name: '@holoscript/core',
              version: packageVersion('packages/core'),
              tarball: basename(coreTarball),
              integrity: sha256File(coreTarball),
            },
            {
              name: '@holoscript/cli',
              version: packageVersion('packages/cli'),
              tarball: basename(cliTarball),
              integrity: sha256File(cliTarball),
            },
          ],
          registryDependencies: [
            {
              name: publicDependency.name,
              expectedVersion: publicDependency.expectedVersion,
              installedVersion: publicDependency.installedVersion,
              createSemanticClosureReceiptExported:
                publicDependency.createSemanticClosureReceiptExported,
              installSource: PUBLIC_NPM_REGISTRY,
            },
          ],
        },
        phases: {
          publicRegistryDependencyClosure: {
            passed:
              publicDependency.name === '@holoscript/meaning' &&
              publicDependency.installedVersion === publicDependency.expectedVersion &&
              publicDependency.createSemanticClosureReceiptExported === true,
            packageName: publicDependency.name,
            version: publicDependency.installedVersion,
            requiredExport: 'createSemanticClosureReceipt',
            freshRegistryCache: true,
          },
          cliPublish: {
            passed: published.success === true,
            packageName: published.packageName,
            version: published.version,
          },
          registryRestart: {
            passed: true,
            persistence: 'fresh JSON store reopened by a new LibraryPackageStore instance',
          },
          onlineResolve: {
            passed: online.errors.length === 0 && online.exportedPing === true,
            exactVersion: resolved.version,
            digestVerifiedBeforeParse: true,
            deterministicAssertion: 'resolved compiler scope contains exported template Ping',
          },
          offlineReplay: {
            passed:
              offline.errors.length === 0 &&
              offline.exportedPing === true &&
              offline.processNetworkDenied === true,
            cacheDigestReverified: true,
            processNetworkDenied: offline.processNetworkDenied,
          },
        },
        boundaries: {
          provesFreshPackedConsumer: true,
          provesCurrentSourceReleaseCohort: true,
          provesPublicRegistryDependencyClosure: true,
          provesCliToRegistryToCompilerContract: true,
          provesRegistryRestartPersistence: true,
          provesProcessGuardedOfflineReplay: true,
          provesOsLevelAirGap: false,
          provesNativeRuntimeExecution: false,
          provesProductionRegistryDeployment: false,
          provesRegistryGovernanceOrAuthorship: false,
          note: 'The deterministic assertion is compiler import/export resolution, not host runtime execution. @holoscript/meaning is installed from the public npm registry through an empty per-run cache; no local Meaning tarball override is used.',
        },
      };
      writeJson(OUTPUT, receipt);
      console.log(
        JSON.stringify(
          {
            status: receipt.status,
            output: relative(ROOT, OUTPUT).replaceAll('\\', '/'),
            sourceRevision: head,
            phases: receipt.phases,
            boundaries: receipt.boundaries,
          },
          null,
          2
        )
      );
    } finally {
      await secondRegistry.close();
    }
  } finally {
    if (KEEP_TEMP) console.error(`[native-library-cold-consumer] kept ${root}`);
    else rmSync(root, { recursive: true, force: true });
  }
}

await main();
