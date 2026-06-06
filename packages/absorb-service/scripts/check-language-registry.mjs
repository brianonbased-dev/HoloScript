/**
 * check-language-registry.mjs — drift gate for the language ingestion registry.
 *
 * Makes language-registry.json LOAD-BEARING, not documentation. Asserts the
 * three sources that silently desync (the VR_TRAITS-vs-trait-registry.json
 * failure mode, F.030) stay in agreement:
 *
 *   registry(implemented|native)  ⊇/=  registered adapters (adapters/index.ts)
 *   registry(implemented).grammarPackage  ⊆  installed deps (package.json)
 *   registry languages  =  SupportedLanguage type members (types.ts)
 *
 * Exit 0 = in sync. Exit 1 = drift (with a precise diff). This is a check:*
 * script (CI / pre-push), NOT in the build chain — so a true drift fails CI
 * loudly without bricking the monorepo deploy.
 *
 * Run: pnpm --filter @holoscript/absorb-service check:language-registry
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const registryPath = resolve(pkgRoot, 'src', 'engine', 'adapters', 'language-registry.json');
const indexPath = resolve(pkgRoot, 'src', 'engine', 'adapters', 'index.ts');
const typesPath = resolve(pkgRoot, 'src', 'engine', 'types.ts');
const pkgJsonPath = resolve(pkgRoot, 'package.json');

const errors = [];
const warnings = [];

function read(p) {
  return readFileSync(p, 'utf8');
}

// ── Load registry ────────────────────────────────────────────────────────────
const registry = JSON.parse(read(registryPath));
const langs = registry.languages || [];
const byId = new Map(langs.map((l) => [l.id, l]));
const implemented = langs.filter((l) => l.status === 'implemented' || l.status === 'native');

// ── 1. registry(implemented|native) === adapters wired in index.ts ────────────
// Parse `registerAdapter(new XAdapter())` calls — the actual runtime registration.
const indexSrc = read(indexPath);
const registeredAdapters = new Set(
  [...indexSrc.matchAll(/registerAdapter\(\s*new\s+(\w+)\s*\(/g)].map((m) => m[1])
);
const registryAdapters = new Set(implemented.map((l) => l.adapter).filter(Boolean));

for (const a of registeredAdapters) {
  if (!registryAdapters.has(a)) {
    errors.push(
      `Adapter "${a}" is registered in adapters/index.ts but NOT declared implemented/native in language-registry.json. Add it to the registry.`
    );
  }
}
for (const a of registryAdapters) {
  if (!registeredAdapters.has(a)) {
    errors.push(
      `Registry declares adapter "${a}" as implemented/native but it is NOT registered in adapters/index.ts. Wire it or change its status to "declared".`
    );
  }
}

// ── 2. registry(implemented).grammarPackage ⊆ installed deps ──────────────────
const pkgJson = JSON.parse(read(pkgJsonPath));
const allDeps = {
  ...(pkgJson.dependencies || {}),
  ...(pkgJson.devDependencies || {}),
  ...(pkgJson.optionalDependencies || {}),
  ...(pkgJson.peerDependencies || {}),
};
for (const l of langs) {
  if ((l.status === 'implemented') && l.grammarPackage && !(l.grammarPackage in allDeps)) {
    errors.push(
      `Language "${l.id}" is "implemented" with grammar "${l.grammarPackage}", but that package is NOT in absorb-service deps. Install it or downgrade status to "declared".`
    );
  }
}

// ── 3. registry languages === SupportedLanguage type members ──────────────────
const typesSrc = read(typesPath);
const typeBlock = typesSrc.match(/export type SupportedLanguage\s*=([\s\S]*?);/);
if (typeBlock) {
  const typeMembers = new Set(
    [...typeBlock[1].matchAll(/'([a-z]+)'/g)].map((m) => m[1])
  );
  for (const m of typeMembers) {
    if (!byId.has(m)) {
      errors.push(
        `SupportedLanguage type includes "${m}" but it is missing from language-registry.json. Add it (status "declared" if no adapter yet).`
      );
    }
  }
  for (const id of byId.keys()) {
    if (!typeMembers.has(id)) {
      errors.push(
        `Registry language "${id}" is not a member of the SupportedLanguage type in types.ts. Add it to the union or remove it from the registry.`
      );
    }
  }
} else {
  warnings.push('Could not locate the SupportedLanguage type union in types.ts — skipped type-vs-registry check.');
}

// ── Report ────────────────────────────────────────────────────────────────────
const declared = langs.filter((l) => l.status === 'declared');
console.log(
  `[language-registry] ${langs.length} languages: ` +
    `${implemented.length} implemented/native, ${declared.length} declared (build targets), ` +
    `${langs.length - implemented.length - declared.length} other.`
);
if (declared.length) {
  console.log(`[language-registry] build targets (declared, no adapter): ${declared.map((l) => l.id).join(', ')}`);
}
for (const w of warnings) console.warn(`  ⚠ ${w}`);

if (errors.length) {
  console.error(`\n[language-registry] DRIFT DETECTED (${errors.length}):`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log('[language-registry] ✓ in sync (registry ⊇ adapters ⊆ grammars, type ↔ registry).');
