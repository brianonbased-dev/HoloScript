#!/usr/bin/env node
/**
 * check-language-registry.mjs - generated registry drift gate.
 *
 * language-registry.json is now an artifact. The live sources are:
 *   - SupportedLanguage in src/engine/types.ts (language universe and order)
 *   - adapters/index.ts plus adapter class metadata (implemented/native paths)
 *   - language-adapters/*.holo @language_adapter declarations (data adapters)
 *
 * Run:
 *   pnpm --filter @holoscript/absorb-service generate:language-registry
 *   pnpm --filter @holoscript/absorb-service check:language-registry
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FALLBACK_LANGUAGE,
  findRegistryRuntimeDrift,
  isAdapterBacked,
} from '../src/engine/adapters/registry-truth.ts';

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(pkgRoot, '..', '..');
const registryPath = resolve(pkgRoot, 'src', 'engine', 'adapters', 'language-registry.json');
const indexPath = resolve(pkgRoot, 'src', 'engine', 'adapters', 'index.ts');
const typesPath = resolve(pkgRoot, 'src', 'engine', 'types.ts');
const pkgJsonPath = resolve(pkgRoot, 'package.json');
const declarationsDir = resolve(pkgRoot, 'language-adapters');
const adapterDir = resolve(pkgRoot, 'src', 'engine', 'adapters');

const args = new Set(process.argv.slice(2));
const write = args.has('--write');
const errors = [];
const warnings = [];
const parseHolo = await loadParseHolo();

// This map used to carry java/cpp/csharp/php/swift/kotlin/javascript so the
// generator could emit "declared" rows for languages nothing could parse. Those
// rows were the defect: the registry advertised capabilities with no adapter
// behind them. A future language earns an entry here when its
// `@language_adapter` .holo ships, not before.
const DEFAULTS = {
  typescript: {
    grammarPackage: 'tree-sitter-typescript',
    extensions: ['.ts', '.tsx', '.mts', '.cts'],
  },
  plaintext: { grammarPackage: null, extensions: [] },
};

// `plaintext` is the ONLY id allowed to exist without a registered adapter.
// FALLBACK_LANGUAGE is imported from registry-truth.ts so the generator, the
// gate and the test cannot disagree about which exemption is legitimate.

const STATUS_TEXT = {
  implemented: 'Has a registered adapter; tree-sitter grammars must be installed package deps.',
  native: 'Parsed by the HoloScript-native adapter rather than tree-sitter.',
  declared:
    'REJECTED. An id with no registered adapter is a capability that does not exist; '
    + 'the runtime-truth check fails on it. Ship the adapter or drop the id.',
  fallback: 'Plain text path for unrecognized extensions. Never has an adapter.',
};

async function loadParseHolo() {
  try {
    return (await import('@holoscript/core/parser')).parseHolo;
  } catch (error) {
    warnings.push(
      `@holoscript/core/parser dist unavailable, using source parser fallback (${error.code || error.message}).`
    );
    return (await import('../../core/src/parser/HoloCompositionParser.ts')).parseHolo;
  }
}

function read(path) {
  return readFileSync(path, 'utf8');
}

function parseSupportedLanguages(source) {
  const typeBlock = source.match(/export type SupportedLanguage\s*=([\s\S]*?);/);
  if (!typeBlock) {
    errors.push('Could not locate SupportedLanguage type union in src/engine/types.ts.');
    return [];
  }
  return [...typeBlock[1].matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
}

function parseRegisteredAdapters(source) {
  return new Set([...source.matchAll(/registerAdapter\(\s*new\s+(\w+)\s*\(/g)].map((m) => m[1]));
}

function parseReadonlyString(source, field) {
  return source.match(new RegExp(`readonly\\s+${field}\\s*=\\s*'([^']+)'`))?.[1] ?? null;
}

function parseReadonlyArray(source, field) {
  const match = source.match(new RegExp(`readonly\\s+${field}\\s*=\\s*\\[([^\\]]*)\\]`, 's'));
  if (!match) return [];
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

function adapterMetadata(adapterName) {
  const sourcePath = resolve(adapterDir, `${adapterName}.ts`);
  if (!existsSync(sourcePath)) return null;
  const source = read(sourcePath);
  return {
    language: parseReadonlyString(source, 'language'),
    extensions: parseReadonlyArray(source, 'extensions'),
    grammarPackage: parseReadonlyString(source, 'grammarPackage'),
  };
}

function listHoloFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) out.push(...listHoloFiles(full));
    else if (entry.endsWith('.holo')) out.push(full);
  }
  return out.sort();
}

function stripGrammarVersion(spec) {
  if (typeof spec !== 'string') return null;
  if (spec.startsWith('@')) {
    const versionAt = spec.indexOf('@', 1);
    return versionAt === -1 ? spec : spec.slice(0, versionAt);
  }
  const versionAt = spec.indexOf('@');
  return versionAt === -1 ? spec : spec.slice(0, versionAt);
}

function requireString(config, key, sourcePath) {
  if (typeof config[key] === 'string' && config[key]) return config[key];
  errors.push(`${sourcePath}: @language_adapter.${key} must be a non-empty string.`);
  return '';
}

function requireStringArray(config, key, sourcePath) {
  const value = config[key];
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) return value;
  errors.push(`${sourcePath}: @language_adapter.${key} must be an array of strings.`);
  return [];
}

function countRules(config) {
  const count = (key) => (Array.isArray(config[key]) ? config[key].length : 0);
  // Single-object rule families (TypeScript clauseImports / eventSites) count
  // as one rule each when present, so the registry's extractorRules total
  // reflects them alongside the array-valued families.
  const one = (key) => (config[key] && typeof config[key] === 'object' ? 1 : 0);
  return (
    count('symbols') +
    count('imports') +
    count('pathImports') +
    count('moduleImports') +
    count('calls') +
    one('clauseImports') +
    one('eventSites')
  );
}

function loadTraitDeclarations() {
  const declarations = [];
  for (const file of listHoloFiles(declarationsDir)) {
    const source = read(file);
    const parsed = parseHolo(source, { tolerant: false });
    const sourceLabel = relative(repoRoot, file).replaceAll('\\', '/');
    if (!parsed.success || !parsed.ast) {
      const messages = (parsed.errors || []).map((e) => e.message).join('; ');
      errors.push(`${sourceLabel}: failed to parse as HoloScript: ${messages || 'unknown error'}`);
      continue;
    }

    const traits = parsed.ast.traits || [];
    for (const trait of traits) {
      if (trait.name !== 'language_adapter') continue;
      const config = trait.config || {};
      const language = requireString(config, 'language', sourceLabel);
      const id = typeof config.id === 'string' ? config.id : language;
      if (id !== language) {
        errors.push(`${sourceLabel}: id "${id}" must match language "${language}".`);
      }
      const grammarPackage = stripGrammarVersion(config.grammarPackage ?? config.grammar);
      if (!grammarPackage) {
        errors.push(`${sourceLabel}: provide grammarPackage or grammar.`);
      }
      declarations.push({
        id: language,
        status: 'implemented',
        adapter: 'TreeSitterTraitAdapter',
        grammarPackage,
        extensions: requireStringArray(config, 'extensions', sourceLabel),
        declaration: sourceLabel,
        extractorRules: countRules(config),
        notes: 'Generated from @language_adapter .holo data.',
      });
    }
  }

  if (declarations.length === 0) {
    errors.push(
      'No @language_adapter declarations found under packages/absorb-service/language-adapters.'
    );
  }
  return declarations;
}

function makeBaseEntry(id) {
  if (id === 'plaintext') {
    return {
      id,
      status: 'fallback',
      adapter: null,
      grammarPackage: null,
      extensions: [],
      notes: 'Generated fallback for raw text ingestion.',
    };
  }
  const defaults = DEFAULTS[id] || { grammarPackage: null, extensions: [] };
  return {
    id,
    status: 'declared',
    adapter: null,
    grammarPackage: defaults.grammarPackage,
    extensions: defaults.extensions,
    notes: 'Generated build target from SupportedLanguage.',
  };
}

function applyAdapter(entries, id, adapter, metadata, overrides = {}) {
  if (!entries.has(id)) {
    errors.push(`Adapter "${adapter}" maps to unsupported language "${id}".`);
    return;
  }
  const existing = entries.get(id);
  entries.set(id, {
    ...existing,
    id,
    status: overrides.status || 'implemented',
    adapter,
    grammarPackage: overrides.grammarPackage ?? metadata.grammarPackage,
    extensions: overrides.extensions ?? metadata.extensions,
    notes: overrides.notes || `Generated from ${adapter}.ts.`,
  });
}

function generateRegistry() {
  const supportedLanguages = parseSupportedLanguages(read(typesPath));
  const registeredAdapters = parseRegisteredAdapters(read(indexPath));
  const entries = new Map(supportedLanguages.map((id) => [id, makeBaseEntry(id)]));

  for (const adapter of registeredAdapters) {
    if (adapter === 'TreeSitterTraitAdapter') continue;
    const metadata = adapterMetadata(adapter);
    if (!metadata) {
      errors.push(`Registered adapter "${adapter}" has no matching source file.`);
      continue;
    }
    if (adapter === 'TypeScriptAdapter') {
      applyAdapter(entries, 'typescript', adapter, metadata, {
        extensions: DEFAULTS.typescript.extensions,
        grammarPackage: 'tree-sitter-typescript',
        notes: 'Generated from TypeScriptAdapter.ts.',
      });
      // No javascript row is projected here any more. The typescript adapter
      // claims the .js extensions, so JS files are ingested AS typescript;
      // emitting a second 'javascript' row said a runtime id existed when
      // detectLanguage() could never return one.
      continue;
    }
    applyAdapter(entries, metadata.language, adapter, metadata, {
      status: adapter === 'HoloAdapter' ? 'native' : 'implemented',
    });
  }

  const traitDeclarations = loadTraitDeclarations();
  for (const declaration of traitDeclarations) {
    if (!entries.has(declaration.id)) {
      errors.push(
        `${declaration.declaration}: language "${declaration.id}" is not in SupportedLanguage.`
      );
      continue;
    }
    entries.set(declaration.id, declaration);
    // The typescript @language_adapter's extensions already cover
    // .js/.jsx/.mjs/.cjs, so JavaScript files ARE ingested. What used to happen
    // here was a second registry row projected under the id 'javascript' to
    // "keep reporting JS as implemented" — and that row was the lie: the
    // extension map points those files at the typescript adapter, so
    // detectLanguage() returns 'typescript' and 'javascript' was a runtime id
    // that did not exist. Callers who think in terms of JavaScript are served
    // by LANGUAGE_ID_ALIASES at the request boundary, which is the right place
    // for an alias; the registry now reports only ids the runtime can produce.
  }

  const languages = supportedLanguages.map((id) => entries.get(id));
  return {
    version: 2,
    generatedFrom: [
      'src/engine/types.ts#SupportedLanguage',
      'src/engine/adapters/index.ts',
      'src/engine/adapters/*Adapter.ts',
      'language-adapters/*.holo',
    ],
    description:
      'Generated language ingestion registry for Absorb. Edit SupportedLanguage, adapter registrations, or @language_adapter .holo declarations, then run scripts/check-language-registry.mjs --write.',
    statuses: STATUS_TEXT,
    languages,
  };
}

function installedDependencies() {
  const pkgJson = JSON.parse(read(pkgJsonPath));
  return {
    ...(pkgJson.dependencies || {}),
    ...(pkgJson.devDependencies || {}),
    ...(pkgJson.optionalDependencies || {}),
    ...(pkgJson.peerDependencies || {}),
  };
}

function validateRegistry(registry) {
  const langs = registry.languages || [];
  const byId = new Map(langs.map((l) => [l.id, l]));
  const implemented = langs.filter((l) => l.status === 'implemented' || l.status === 'native');
  const declared = langs.filter((l) => l.status === 'declared');
  const registeredAdapters = parseRegisteredAdapters(read(indexPath));
  const registryAdapters = new Set(implemented.map((l) => l.adapter).filter(Boolean));

  for (const adapter of registeredAdapters) {
    if (!registryAdapters.has(adapter)) {
      errors.push(`Adapter "${adapter}" is registered but absent from generated registry.`);
    }
  }
  for (const adapter of registryAdapters) {
    if (!registeredAdapters.has(adapter)) {
      errors.push(
        `Generated registry declares "${adapter}" but adapters/index.ts does not register it.`
      );
    }
  }

  const deps = installedDependencies();
  for (const lang of langs) {
    if (lang.status === 'implemented' && lang.grammarPackage && !(lang.grammarPackage in deps)) {
      errors.push(
        `Language "${lang.id}" is implemented with grammar "${lang.grammarPackage}", but that package is not in absorb-service deps.`
      );
    }
  }

  const supported = parseSupportedLanguages(read(typesPath));
  for (const id of supported) {
    if (!byId.has(id))
      errors.push(`SupportedLanguage includes "${id}" but registry is missing it.`);
  }
  for (const id of byId.keys()) {
    if (!supported.includes(id))
      errors.push(`Registry language "${id}" is not in SupportedLanguage.`);
  }

  return { langs, implemented, declared };
}

/**
 * Load what the runtime ACTUALLY registers.
 *
 * Everything above this point reasons about source text — the SupportedLanguage
 * union parsed out of types.ts, the `registerAdapter(new X(` calls parsed out of
 * index.ts. That is a check of one file against another, and it is exactly what
 * missed the defect this exists for: `javascript` was consistent everywhere in
 * the sources and still could not be returned by `detectLanguage()`, because the
 * typescript adapter had claimed its extensions. Only executing the registry
 * tells you which ids exist.
 */
async function loadRuntimeLanguages() {
  try {
    const module = await import('../src/engine/adapters/index.ts');
    const languages = module.getSupportedLanguages();
    if (!Array.isArray(languages) || languages.length === 0) {
      errors.push(
        'getSupportedLanguages() returned nothing. Either the adapter registry failed to '
          + 'populate or its shape changed; this check cannot be satisfied by an empty answer.'
      );
      return null;
    }
    return languages;
  } catch (error) {
    // Fail closed and loudly. A skipped check reads exactly like a passing one,
    // and this is the only check here that consults the runtime at all.
    errors.push(
      'Could not import the runtime adapter registry to compare against '
        + `getSupportedLanguages(): ${error?.message || error}`
    );
    return null;
  }
}

/**
 * Registry ids vs getSupportedLanguages() — the check task_1785432913972_o1nf
 * asked for. The comparison itself lives in
 * `src/engine/adapters/registry-truth.ts` so this gate and the vitest
 * regression suite beside it share ONE implementation; a check whose semantics
 * are re-typed into its own test proves only that the copy agrees with itself.
 */
function validateRuntimeTruth(langs, runtimeLanguages) {
  if (!runtimeLanguages) return null;
  for (const finding of findRegistryRuntimeDrift(langs, runtimeLanguages)) {
    errors.push(finding);
  }
  return {
    runtime: [...runtimeLanguages].sort(),
    adapterBacked: langs.filter(isAdapterBacked).map((l) => l.id).sort(),
  };
}

const registry = generateRegistry();
const expected = `${JSON.stringify(registry, null, 2)}\n`;

if (write) {
  writeFileSync(registryPath, expected, 'utf8');
}

if (!write) {
  const actual = existsSync(registryPath) ? read(registryPath) : '';
  if (actual !== expected) {
    errors.push(
      'language-registry.json is stale. Run `pnpm --filter @holoscript/absorb-service generate:language-registry`.'
    );
  }
}

const { langs, implemented, declared } = validateRegistry(registry);
const runtimeLanguages = await loadRuntimeLanguages();
const runtimeTruth = validateRuntimeTruth(langs, runtimeLanguages);
const traitBacked = langs.filter((l) => l.declaration);
const other = langs.length - implemented.length - declared.length;

console.log(
  `[language-registry] ${langs.length} languages: ${implemented.length} implemented/native, ${declared.length} declared, ${other} fallback/other.`
);
if (runtimeTruth) {
  console.log(
    `[language-registry] runtime truth: getSupportedLanguages() = `
      + `${runtimeTruth.runtime.join(', ')} | registry adapter-backed = `
      + `${runtimeTruth.adapterBacked.join(', ')} | fallback exemption = ${FALLBACK_LANGUAGE}.`
  );
}
if (declared.length) {
  console.log(`[language-registry] build targets: ${declared.map((l) => l.id).join(', ')}`);
}
if (traitBacked.length) {
  console.log(
    `[language-registry] @language_adapter declarations: ${traitBacked.map((l) => l.id).join(', ')}`
  );
}
for (const warning of warnings) console.warn(`  WARN ${warning}`);

if (errors.length) {
  console.error(`\n[language-registry] DRIFT DETECTED (${errors.length}):`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(
  write ? '[language-registry] wrote generated registry.' : '[language-registry] in sync.'
);
