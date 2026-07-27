#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const valueAfter = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : fallback;
};

const REGISTRY = valueAfter(
  '--registry',
  'https://registry-production-c21b.up.railway.app'
).replace(/\/+$/, '');
const TOKEN_ENV = valueAfter('--token-env', 'REGISTRY_BOOTSTRAP_TOKEN');
const CLI_SPEC = valueAfter('--cli', '@holoscript/cli@8.0.12');
const CORE_SPEC = valueAfter('--core', '@holoscript/core@8.0.18');
const FIXTURE_VERSION = valueAfter('--fixture-version', '0.0.1-public-cli');
const DEPLOYMENT_ID = valueAfter('--deployment-id', null);
const SOURCE_REVISION = valueAfter('--source-revision', null);
const OUTPUT = resolve(
  valueAfter(
    '--out',
    join(
      ROOT,
      'reports',
      'library-coherence',
      '2026-07-26_native-registry-public-consumer.v1.json'
    )
  )
);
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const token = process.env[TOKEN_ENV];

if (!token) throw new Error(`missing production registry token in ${TOKEN_ENV}`);
if (!/^[0-9A-Za-z.-]+$/.test(FIXTURE_VERSION)) {
  throw new Error(`invalid fixture version: ${FIXTURE_VERSION}`);
}
if (!/^@holoscript\/cli@[0-9A-Za-z][0-9A-Za-z.+-]*$/.test(CLI_SPEC)) {
  throw new Error(`invalid public CLI package spec: ${CLI_SPEC}`);
}
if (!/^@holoscript\/core@[0-9A-Za-z][0-9A-Za-z.+-]*$/.test(CORE_SPEC)) {
  throw new Error(`invalid public compiler package spec: ${CORE_SPEC}`);
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

const work = mkdtempSync(join(tmpdir(), 'holoscript-production-registry-'));

try {
  writeJson(join(work, 'package.json'), {
    name: 'holoscript-production-registry-consumer',
    private: true,
    type: 'module',
  });

  execFileSync(
    NPM,
    [
      'install',
      CLI_SPEC,
      CORE_SPEC,
      '--ignore-scripts',
      '--omit=optional',
      '--no-audit',
      '--no-fund',
      '--prefer-online',
      '--registry',
      'https://registry.npmjs.org/',
    ],
    {
      cwd: work,
      encoding: 'utf8',
      shell: process.platform === 'win32',
      stdio: 'pipe',
      timeout: 180_000,
    }
  );

  const fixture = join(work, 'fixture');
  mkdirSync(fixture, { recursive: true });
  const name = '@holoscript/railway-public-cli-canary';
  const source =
    '@export template "RailwayPublicCliCanary"\n' +
    `orb railway_public_cli_canary { revision: "${SOURCE_REVISION || 'unknown'}" }\n`;
  writeJson(join(fixture, 'package.json'), {
    name,
    version: FIXTURE_VERSION,
    description: 'Public CLI to production native registry canary',
    license: 'MIT',
    author: 'holoscript',
    repository: 'https://github.com/brianonbased-dev/HoloScript',
    files: ['index.hsplus', 'README.md', 'LICENSE'],
    holoscript: {
      artifact: 'library',
      entrypoint: './index.hsplus',
      supportTier: 'preview',
      compatibility: {
        holoscript: '>=8.0.0',
        targets: ['node', 'owned-metal'],
      },
      capabilities: ['railway-public-cli-canary'],
    },
  });
  writeFileSync(join(fixture, 'index.hsplus'), source, 'utf8');
  writeFileSync(join(fixture, 'README.md'), '# Railway Public CLI Canary\n', 'utf8');
  writeFileSync(join(fixture, 'LICENSE'), 'MIT\n', 'utf8');

  const consumerProgram = join(work, 'consumer.mjs');
  writeFileSync(
    consumerProgram,
    `import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { publishPackage } from '@holoscript/cli';
import { HoloScriptPlusParser, PackageImportResolver } from '@holoscript/core/parser';

const [fixture, registry, name, version] = process.argv.slice(2);
const published = await publishPackage(fixture, {
  registry,
  token: process.env.${TOKEN_ENV},
  force: true,
  skipTests: true,
  skipLint: true,
  allowConsole: true,
});
if (!published.success) {
  throw new Error(
    \`public CLI publish failed: \${published.error || published.errors?.join('; ') || 'unknown'}\`
  );
}

const identity = name.slice(1).split('/');
const resolutionResponse = await fetch(
  \`\${registry}/api/v1/packages/\${identity[0]}/\${identity[1]}/resolve?range=\${encodeURIComponent(version)}\`
);
if (!resolutionResponse.ok) {
  throw new Error(\`production resolve failed: HTTP \${resolutionResponse.status}\`);
}
const pin = await resolutionResponse.json();
const parsed = new HoloScriptPlusParser({ enableTypeScriptImports: true }).parse(
  '@import { RailwayPublicCliCanary } from "@holoscript/railway-public-cli-canary"\\norb app { }\\n'
);
const registryCache = {};
const resolved = await new PackageImportResolver().resolve(parsed, '/public-cold/app.hsplus', {
  baseDir: '/public-cold',
  registryBaseUrl: registry,
  registryLock: { [name]: { version: pin.version, integrity: pin.integrity } },
  registryCache,
});
const cliManifest = JSON.parse(
  readFileSync(join(process.cwd(), 'node_modules', '@holoscript', 'cli', 'package.json'), 'utf8')
);
const coreManifest = JSON.parse(
  readFileSync(join(process.cwd(), 'node_modules', '@holoscript', 'core', 'package.json'), 'utf8')
);
const result = {
  installedFrom: 'https://registry.npmjs.org/',
  cli: \`\${cliManifest.name}@\${cliManifest.version}\`,
  compiler: \`\${coreManifest.name}@\${coreManifest.version}\`,
  publishedPackage: \`\${name}@\${version}\`,
  publishSuccess: published.success,
  exactPin: { version: pin.version, integrity: pin.integrity },
  compilerErrors: resolved.errors,
  compilerExportResolved: resolved.scope.has('RailwayPublicCliCanary'),
  moduleCount: resolved.modules.size,
  registryCacheEntries: Object.keys(registryCache).length,
};
process.stdout.write('\\n__HOLOSCRIPT_RECEIPT__' + JSON.stringify(result));
if (resolved.errors.length > 0 || !result.compilerExportResolved) process.exitCode = 1;
`,
    'utf8'
  );

  const child = spawnSync(
    process.execPath,
    [consumerProgram, fixture, REGISTRY, name, FIXTURE_VERSION],
    {
      cwd: work,
      encoding: 'utf8',
      env: { ...process.env, [TOKEN_ENV]: token },
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120_000,
    }
  );
  if (child.status !== 0) {
    throw new Error(
      `public CLI/compiler consumer failed: ${child.stderr || child.stdout || child.error?.message}`
    );
  }
  const marker = '__HOLOSCRIPT_RECEIPT__';
  const markerIndex = child.stdout.lastIndexOf(marker);
  if (markerIndex < 0) throw new Error('public consumer did not emit its receipt marker');
  const publicConsumer = JSON.parse(child.stdout.slice(markerIndex + marker.length));
  const healthResponse = await fetch(`${REGISTRY}/health`);
  if (!healthResponse.ok) throw new Error(`registry health failed: HTTP ${healthResponse.status}`);
  const health = await healthResponse.json();

  const receipt = {
    schema: 'holoscript.native-registry-public-consumer.v1',
    generatedAt: new Date().toISOString(),
    status: 'pass',
    sourceRevision: SOURCE_REVISION,
    deploymentId: DEPLOYMENT_ID,
    registry: REGISTRY,
    health: {
      status: health.status,
      service: health.service,
      version: health.version,
      tokens: health.tokens,
      nativePackages: health.nativePackages,
    },
    publicConsumer,
    boundaries: {
      provesProductionDeployment: true,
      provesPublicCliPublish: true,
      provesPublicCompilerResolution: true,
      provesExactDigestPin: true,
      provesProcessRestartDurability: false,
      provesRollbackExecution: false,
      exposesCredential: false,
    },
  };
  writeJson(OUTPUT, receipt);
  console.log(
    JSON.stringify(
      {
        status: receipt.status,
        output: relative(ROOT, OUTPUT).replaceAll('\\', '/'),
        deploymentId: DEPLOYMENT_ID,
        publicConsumer,
      },
      null,
      2
    )
  );
} finally {
  if (existsSync(work)) rmSync(work, { recursive: true, force: true });
}
