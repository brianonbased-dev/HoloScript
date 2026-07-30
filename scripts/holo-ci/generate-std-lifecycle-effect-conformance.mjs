#!/usr/bin/env node
/**
 * Freeze the packaged std `@on_spawn` lifecycle corpus and bind it into the
 * existing std conformance manifest. This generator is deterministic: it
 * records source bytes and expected inert intents, never timestamps.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..', '..');
const descriptorRel =
  'packages/std/conformance/lifecycle/std-lifecycle-effect-abi.v0.json';
const vectorsRel =
  'packages/std/conformance/generated/std-lifecycle-effects.v0.json';
const manifestRel = 'packages/std/conformance/generated/manifest.json';
const stdPackageRel = 'packages/std/package.json';

function absolute(relPath) {
  return join(repoRoot, ...relPath.split('/'));
}

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function fail(message) {
  console.error(`[generate-std-lifecycle-effect-conformance] FAIL: ${message}`);
  process.exit(1);
}

const descriptorBytes = readFileSync(absolute(descriptorRel));
const descriptor = JSON.parse(descriptorBytes.toString('utf8'));
if (descriptor.schema !== 'holoscript.std-lifecycle-effect-abi.v0') {
  fail(`unexpected descriptor schema ${descriptor.schema}`);
}
if (descriptor.dispatched !== false) fail('descriptor must pin dispatched=false');

const sourceDefinitions = {
  math: 'packages/std/src/math.hsplus',
  collections: 'packages/std/src/collections.hsplus',
};
const definitions = [
  {
    id: 'packaged-std-math-on-spawn',
    source: sourceDefinitions.math,
    trait: 'std_math',
    alias: 'math',
    factory: 'get_std_math_lib',
    namespaces: ['math'],
    event: 'std_math_ready',
  },
  {
    id: 'packaged-std-list-on-spawn',
    source: sourceDefinitions.collections,
    trait: 'std_list',
    alias: 'list_lib',
    factory: 'get_std_collections_lib',
    namespaces: ['list_lib', 'map_lib', 'set_lib'],
    event: 'std_list_ready',
  },
  {
    id: 'packaged-std-map-on-spawn',
    source: sourceDefinitions.collections,
    trait: 'std_map',
    alias: 'map_lib',
    factory: 'get_std_collections_lib',
    namespaces: ['list_lib', 'map_lib', 'set_lib'],
    event: 'std_map_ready',
  },
  {
    id: 'packaged-std-set-on-spawn',
    source: sourceDefinitions.collections,
    trait: 'std_set',
    alias: 'set_lib',
    factory: 'get_std_collections_lib',
    namespaces: ['list_lib', 'map_lib', 'set_lib'],
    event: 'std_set_ready',
  },
];

const vectors = definitions.map((definition) => {
  const source = readFileSync(absolute(definition.source), 'utf8');
  const traitMarker = `@trait ${definition.trait}`;
  const bindingMarker = `${definition.alias} = ${definition.factory}()`;
  const emitMarker = `emit("${definition.event}", {})`;
  for (const marker of [traitMarker, bindingMarker, emitMarker]) {
    if (!source.includes(marker)) {
      fail(`${definition.id}: packaged source no longer contains ${JSON.stringify(marker)}`);
    }
  }
  return {
    id: definition.id,
    source: definition.source,
    sourceSha256: sha256(readFileSync(absolute(definition.source))),
    trait: definition.trait,
    expected: {
      schema: descriptor.envelopeSchema,
      subsetId: descriptor.subsetId,
      trait: definition.trait,
      handler: descriptor.handler,
      operations: [
        {
          kind: 'bind_factory',
          alias: definition.alias,
          factory: definition.factory,
          namespaces: definition.namespaces,
        },
        {
          kind: 'emit',
          event: definition.event,
          payload: {},
        },
      ],
      result: null,
      dispatched: false,
    },
  };
});

const vectorDocument = {
  schema: 'holoscript.std-lifecycle-effect-vectors.v0',
  descriptor: descriptorRel,
  descriptorSha256: sha256(descriptorBytes),
  vectorCount: vectors.length,
  vectors,
};
mkdirSync(dirname(absolute(vectorsRel)), { recursive: true });
writeFileSync(absolute(vectorsRel), `${JSON.stringify(vectorDocument, null, 2)}\n`);

const manifest = JSON.parse(readFileSync(absolute(manifestRel), 'utf8'));
if (manifest.schema !== 'holoscript.std-abi-conformance-manifest.v0') {
  fail(`unexpected std conformance manifest schema ${manifest.schema}`);
}
const stdPackage = JSON.parse(readFileSync(absolute(stdPackageRel), 'utf8'));
manifest.stdPackageVersion = stdPackage.version;
manifest.lifecycleEffect = {
  schema: descriptor.schema,
  subsetId: descriptor.subsetId,
  descriptorFile: descriptorRel,
  vectorsFile: vectorsRel,
  vectors: vectors.length,
  packagedSources: Object.values(sourceDefinitions),
  dispatched: false,
};
manifest.files[descriptorRel] = { sha256: sha256(descriptorBytes) };
manifest.files[vectorsRel] = {
  sha256: sha256(readFileSync(absolute(vectorsRel))),
};
for (const relPath of Object.values(sourceDefinitions)) {
  manifest.files[relPath] = { sha256: sha256(readFileSync(absolute(relPath))) };
}
writeFileSync(absolute(manifestRel), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(
  `[generate-std-lifecycle-effect-conformance] OK: ${vectors.length} packaged lifecycle vectors, dispatched=false`
);
