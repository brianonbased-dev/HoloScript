#!/usr/bin/env node
/**
 * measure-holob-trait-coverage.mjs
 *
 * Measures the runtime-first sequencing gate from the 2026-07-12 native runtime
 * research: how much of the authored HoloScript trait/vocab surface has native
 * HoloB/HoloVM meaning today?
 *
 * The key distinction:
 * - HolobCompiler can attach any trait as generic metadata.
 * - Only stable HoloTraitId/native opcode/runtime-renderer lanes have executable
 *   native semantics.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const today = new Date().toISOString().slice(0, 10);

const constantsDir = resolve(repoRoot, 'packages/core/src/traits/constants');
const holobCompilerPath = resolve(repoRoot, 'packages/core/src/compiler/HolobCompiler.ts');
const opcodesPath = resolve(repoRoot, 'packages/holo-vm/src/opcodes.ts');
const nativeRendererPath = resolve(repoRoot, 'packages/holo-vm/src/render/native-renderer.ts');
const auditDir = resolve(repoRoot, 'docs/audit');

const EXCLUDED_DIRS = new Set([
  '.git',
  '.turbo',
  '.next',
  '.scratch',
  'coverage',
  'dist',
  'node_modules',
  'out',
]);

function normalizeTraitName(name) {
  return String(name).trim().replace(/^@/, '').replace(/-/g, '_').replace(/\//g, '_').toLowerCase();
}

function* walk(dir, predicate) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry.name)) yield* walk(full, predicate);
    } else if (predicate(entry.name, full)) {
      yield full;
    }
  }
}

function pct(part, whole) {
  return whole === 0 ? 0 : Number(((part / whole) * 100).toFixed(2));
}

function topEntries(map, limit = 20) {
  return [...map.entries()]
    .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([name, value]) => ({
      name,
      count: value.count,
      files: [...value.files].sort().slice(0, 8),
    }));
}

function addOccurrence(map, name, file) {
  const key = normalizeTraitName(name);
  if (!key) return;
  if (!map.has(key)) map.set(key, { count: 0, files: new Set() });
  const item = map.get(key);
  item.count += 1;
  item.files.add(file);
}

function loadTraitUniverse() {
  const traits = new Map();
  const categoryFiles = readdirSync(constantsDir)
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.d.ts') && file !== 'index.ts')
    .sort();

  for (const file of categoryFiles) {
    const content = readFileSync(join(constantsDir, file), 'utf8');
    const match = content.match(/export const \w+_TRAITS\s*=\s*\[([\s\S]*?)\]\s+as const;/);
    if (!match) continue;
    const category = file.replace(/\.ts$/, '');
    for (const nameMatch of match[1].matchAll(/'([^']+)'/g)) {
      const name = normalizeTraitName(nameMatch[1]);
      if (!traits.has(name)) traits.set(name, { category, source: file });
    }
  }
  return traits;
}

function loadStableTraitIds() {
  const content = readFileSync(opcodesPath, 'utf8');
  const stable = new Map();
  const enumBody = content.match(/export enum HoloTraitId\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
  const commentAndMember =
    /\/\*\*\s*@([a-zA-Z0-9_\-]+)[\s\S]*?\*\/\s*([A-Za-z0-9_]+)\s*=\s*(0x[0-9a-fA-F]+|\d+)/g;
  for (const match of enumBody.matchAll(commentAndMember)) {
    stable.set(normalizeTraitName(match[1]), {
      enumName: match[2],
      id: Number(match[3]),
    });
  }

  const aliases = {
    physics: 'rigid',
    gpu_physics: 'rigid',
    rigid_body: 'rigid',
    rigidbody: 'rigid',
    collider: 'collidable',
  };
  for (const [alias, canonical] of Object.entries(aliases)) {
    if (stable.has(canonical)) stable.set(alias, { ...stable.get(canonical), aliasOf: canonical });
  }
  return stable;
}

function loadHolobSpecialCases() {
  const content = readFileSync(holobCompilerPath, 'utf8');
  const compileTraitBody =
    content.match(/private compileTrait\([\s\S]*?\n  private applyStableOrGenericTrait/)?.[0] ?? '';
  return new Set(
    [...compileTraitBody.matchAll(/case '([^']+)'/g)].map((m) => normalizeTraitName(m[1]))
  );
}

function loadRendererSemanticTraits(stableTraitIds) {
  const content = readFileSync(nativeRendererPath, 'utf8');
  const enumNames = new Set(
    [...content.matchAll(/HoloTraitId\.([A-Za-z0-9_]+)/g)].map((m) => m[1])
  );
  const out = new Set();
  for (const [trait, meta] of stableTraitIds.entries()) {
    if (enumNames.has(meta.enumName) && !meta.aliasOf) out.add(trait);
  }
  return out;
}

function loadCorpusAnnotations() {
  const corpusFiles = [...walk(repoRoot, (name) => name.endsWith('.hsplus'))].sort();
  const allAnnotations = new Map();
  const registeredAnnotations = new Map();
  const traitUniverse = loadTraitUniverse();

  for (const file of corpusFiles) {
    const rel = relative(repoRoot, file).replace(/\\/g, '/');
    const content = readFileSync(file, 'utf8');
    for (const match of content.matchAll(/@([A-Za-z_][A-Za-z0-9_/-]*)/g)) {
      const name = normalizeTraitName(match[1]);
      addOccurrence(allAnnotations, name, rel);
      if (traitUniverse.has(name)) addOccurrence(registeredAnnotations, name, rel);
    }
  }

  return { corpusFiles, allAnnotations, registeredAnnotations, traitUniverse };
}

const { corpusFiles, allAnnotations, registeredAnnotations, traitUniverse } =
  loadCorpusAnnotations();
const stableTraitIds = loadStableTraitIds();
const holobSpecialCases = loadHolobSpecialCases();
const rendererSemanticTraits = loadRendererSemanticTraits(stableTraitIds);

const registeredNames = [...registeredAnnotations.keys()].sort();
const stableInCorpus = registeredNames.filter((name) => stableTraitIds.has(name));
const specialInCorpus = registeredNames.filter((name) => holobSpecialCases.has(name));
const rendererInCorpus = registeredNames.filter((name) => rendererSemanticTraits.has(name));
const genericOnlyInCorpus = registeredNames.filter(
  (name) =>
    !stableTraitIds.has(name) && !holobSpecialCases.has(name) && !rendererSemanticTraits.has(name)
);

const universeNames = [...traitUniverse.keys()].sort();
const stableInUniverse = universeNames.filter((name) => stableTraitIds.has(name));
const rendererInUniverse = universeNames.filter((name) => rendererSemanticTraits.has(name));

const topGenericOnlyCorpusGaps = topEntries(
  new Map(genericOnlyInCorpus.map((name) => [name, registeredAnnotations.get(name)])),
  25
);
const topUnregisteredVocab = topEntries(
  new Map([...allAnnotations].filter(([name]) => !traitUniverse.has(name))),
  25
);

const summary = {
  generatedAt: new Date().toISOString(),
  source: 'scripts/measure-holob-trait-coverage.mjs',
  corpus: {
    extension: '.hsplus',
    files: corpusFiles.length,
    annotationVocabUnique: allAnnotations.size,
    registeredTraitRefsUnique: registeredAnnotations.size,
  },
  traitUniverse: {
    totalRegisteredTraits: traitUniverse.size,
    stableHoloTraitIdTraits: stableInUniverse.length,
    rendererSemanticTraits: rendererInUniverse.length,
    stableHoloTraitIdPercent: pct(stableInUniverse.length, traitUniverse.size),
    rendererSemanticPercent: pct(rendererInUniverse.length, traitUniverse.size),
  },
  corpusCoverage: {
    metadataAttachmentPercent: 100,
    metadataAttachmentNote:
      'HolobCompiler default path attaches any trait as generic metadata; this is not executable runtime semantics.',
    registeredTraitsWithStableHoloTraitId: stableInCorpus.length,
    registeredTraitsWithHolobSpecialCase: specialInCorpus.length,
    registeredTraitsWithRendererSemantics: rendererInCorpus.length,
    registeredTraitsGenericOnly: genericOnlyInCorpus.length,
    stableHoloTraitIdPercent: pct(stableInCorpus.length, registeredAnnotations.size),
    holobSpecialCasePercent: pct(specialInCorpus.length, registeredAnnotations.size),
    rendererSemanticPercent: pct(rendererInCorpus.length, registeredAnnotations.size),
  },
  nativeRuntimeSets: {
    stableHoloTraitIdTraits: [...stableTraitIds.keys()].sort(),
    holobSpecialCases: [...holobSpecialCases].sort(),
    rendererSemanticTraits: [...rendererSemanticTraits].sort(),
  },
  topGenericOnlyCorpusGaps,
  topUnregisteredAnnotationVocab: topUnregisteredVocab,
};

mkdirSync(auditDir, { recursive: true });
const jsonPath = resolve(auditDir, `holob-trait-coverage-${today}.json`);
const mdPath = resolve(auditDir, `holob-trait-coverage-${today}.md`);
writeFileSync(jsonPath, JSON.stringify(summary, null, 2), 'utf8');

const md = [
  '# Holob Trait Coverage Receipt',
  `**Generated:** ${today}`,
  `**Command:** \`node scripts/measure-holob-trait-coverage.mjs\``,
  '',
  '## Summary',
  '',
  '| Metric | Value |',
  '|---|---:|',
  `| .hsplus corpus files scanned | ${summary.corpus.files} |`,
  `| Unique @ annotation vocab in corpus | ${summary.corpus.annotationVocabUnique} |`,
  `| Unique registered trait refs in corpus | ${summary.corpus.registeredTraitRefsUnique} |`,
  `| Registered corpus traits with stable HoloTraitId | ${summary.corpusCoverage.registeredTraitsWithStableHoloTraitId} (${summary.corpusCoverage.stableHoloTraitIdPercent}%) |`,
  `| Registered corpus traits with HolobCompiler special case | ${summary.corpusCoverage.registeredTraitsWithHolobSpecialCase} (${summary.corpusCoverage.holobSpecialCasePercent}%) |`,
  `| Registered corpus traits with NativeHoloRenderer semantics | ${summary.corpusCoverage.registeredTraitsWithRendererSemantics} (${summary.corpusCoverage.rendererSemanticPercent}%) |`,
  `| Registered corpus traits generic-only metadata | ${summary.corpusCoverage.registeredTraitsGenericOnly} |`,
  '',
  '> Generic metadata attachment is intentionally counted separately: it proves the trait name survives into bytecode, not that the HoloVM/runtime executes the trait.',
  '',
  '## Native Runtime Sets',
  '',
  `- Stable HoloTraitId traits: ${summary.nativeRuntimeSets.stableHoloTraitIdTraits.map((t) => `\`${t}\``).join(', ') || 'none'}`,
  `- HolobCompiler special cases: ${summary.nativeRuntimeSets.holobSpecialCases.map((t) => `\`${t}\``).join(', ') || 'none'}`,
  `- NativeHoloRenderer semantic traits: ${summary.nativeRuntimeSets.rendererSemanticTraits.map((t) => `\`${t}\``).join(', ') || 'none'}`,
  '',
  '## Top Generic-Only Registered Corpus Gaps',
  '',
  '| Trait | Occurrences | Example files |',
  '|---|---:|---|',
  ...topGenericOnlyCorpusGaps.map(
    (gap) => `| \`${gap.name}\` | ${gap.count} | ${gap.files.map((f) => `\`${f}\``).join('<br>')} |`
  ),
  '',
  '## Top Unregistered @ Annotation Vocab',
  '',
  '| Annotation | Occurrences | Example files |',
  '|---|---:|---|',
  ...topUnregisteredVocab.map(
    (gap) =>
      `| \`@${gap.name}\` | ${gap.count} | ${gap.files.map((f) => `\`${f}\``).join('<br>')} |`
  ),
  '',
  '## Verdict',
  '',
  'The native runtime path is real, but semantic trait coverage is still narrow. The next runtime-first increment should expand stable HoloTraitId/native-renderer semantics for the highest-frequency generic-only corpus traits before wiring broad production surfaces to HoloVM.',
  '',
].join('\n');

writeFileSync(mdPath, md, 'utf8');

console.log(`Wrote JSON: ${jsonPath}`);
console.log(`Wrote MD: ${mdPath}`);
console.log(
  `Holob semantic coverage: stable=${summary.corpusCoverage.stableHoloTraitIdPercent}% renderer=${summary.corpusCoverage.rendererSemanticPercent}% over ${summary.corpus.registeredTraitRefsUnique} registered .hsplus traits`
);
