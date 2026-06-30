#!/usr/bin/env node
/**
 * Source-level canary for the compiler-poison retirement track.
 *
 * Retirement has three lanes:
 *   1. public package subpaths stay retired (no build entry, no handwritten d.ts),
 *   2. removed compiler modules must not be imported from source,
 *   3. live native emitters may remain internal compiler machinery.
 *
 * This is the guard that would have caught stale service imports of the retired
 * R3FCompiler module while still allowing HoloScript-native UI generation through
 * Native2DCompiler / NextJSCompiler.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, posix, resolve, relative, sep } from 'node:path';

const args = process.argv.slice(2);
const rootIdx = args.indexOf('--root');
const root = resolve(rootIdx >= 0 ? args[rootIdx + 1] : process.cwd());
const filesIdx = args.indexOf('--files');
const EXPLICIT_FILES =
  filesIdx >= 0
    ? (args[filesIdx + 1] || '')
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean)
    : null;

const SOURCE_ROOTS = ['packages', 'services', 'apps', 'scripts'];
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  '.next',
  'build',
  'coverage',
  '.scratch',
  '.turbo',
]);
const SELF_REL = 'scripts/holo-ci/check-apex-poison-retired.mjs';
const SELF_TEST_REL = 'scripts/__tests__/check-apex-poison-retired.test.mjs';

const retiredImportModules = [
  {
    name: 'R3FCompiler',
    symbols: ['R3FCompiler'],
    sourceFiles: ['R3FCompiler'],
    subpaths: ['r3f'],
    replacement: 'SceneIRCompiler plus scene-ir-types',
  },
  {
    name: 'ThreeJSCompiler',
    symbols: ['ThreeJSCompiler'],
    sourceFiles: ['ThreeJSCompiler'],
    subpaths: ['threejs'],
    replacement: 'SceneIRCompiler or a native target compiler',
  },
  {
    name: 'BabylonCompiler',
    symbols: ['BabylonCompiler'],
    sourceFiles: ['BabylonCompiler'],
    subpaths: ['babylon'],
    replacement: 'SceneIRCompiler or a native target compiler',
  },
  {
    name: 'PlayCanvasCompiler',
    symbols: ['PlayCanvasCompiler'],
    sourceFiles: ['PlayCanvasCompiler'],
    subpaths: ['playcanvas'],
    replacement: 'SceneIRCompiler or a native target compiler',
  },
  {
    name: 'PhoneSleeveVRCompiler',
    symbols: ['PhoneSleeveVRCompiler'],
    sourceFiles: ['PhoneSleeveVRCompiler'],
    subpaths: ['phone-sleeve-vr'],
    replacement: 'Quest/OpenXR/native XR compilers',
  },
  {
    name: 'FlatSemanticCompiler',
    symbols: ['FlatSemanticCompiler'],
    sourceFiles: ['FlatSemanticCompiler'],
    subpaths: ['flat-semantic'],
    replacement: 'semantic IR / native renderer contracts',
  },
  {
    name: 'VRRCompiler',
    symbols: ['VRRCompiler'],
    sourceFiles: ['VRRCompiler'],
    subpaths: ['vrr'],
    replacement: 'native rhythm/game targets',
  },
  {
    name: 'ARCompiler',
    symbols: ['ARCompiler'],
    sourceFiles: ['ARCompiler'],
    subpaths: ['ar'],
    replacement: 'AndroidXR/OpenXR/Quest native targets',
  },
  // These public subpaths are retired, but the source files are still valid
  // internal machinery/stubs. Do not ban local source imports for them here.
  {
    name: 'Native2DCompiler public subpath',
    sourceFiles: [],
    subpaths: ['native-2d'],
    replacement: 'NextJSCompiler / generated HoloScript-native UI output',
  },
  {
    name: 'MultiLayerCompiler public subpath',
    sourceFiles: [],
    subpaths: ['multi-layer'],
    replacement: 'target-specific native compiler orchestration',
  },
];

const checks = [
  {
    file: 'packages/core/tsup.config.ts',
    patterns: [
      /['"]compiler\/r3f['"]\s*:/,
      /['"]compiler\/threejs['"]\s*:/,
      /['"]compiler\/babylon['"]\s*:/,
      /['"]compiler\/playcanvas['"]\s*:/,
      /['"]compiler\/native-2d['"]\s*:/,
      /['"]compiler\/phone-sleeve-vr['"]\s*:/,
      /['"]compiler\/flat-semantic['"]\s*:/,
      /['"]compiler\/vrr['"]\s*:/,
      /['"]compiler\/ar['"]\s*:/,
      /['"]compiler\/multi-layer['"]\s*:/,
      /src\/compiler\/R3FCompiler\.ts/,
      /src\/compiler\/ThreeJSCompiler\.ts/,
      /src\/compiler\/BabylonCompiler\.ts/,
      /src\/compiler\/PlayCanvasCompiler\.ts/,
      /src\/compiler\/Native2DCompiler\.ts/,
      /src\/compiler\/PhoneSleeveVRCompiler\.ts/,
      /src\/compiler\/FlatSemanticCompiler\.ts/,
      /src\/compiler\/VRRCompiler\.ts/,
      /src\/compiler\/ARCompiler\.ts/,
      /src\/compiler\/MultiLayerCompiler\.ts/,
    ],
  },
  {
    file: 'packages/core/scripts/generate-types.mjs',
    patterns: [
      /compiler\/r3f\.d\.ts/,
      /['"]r3f\.d\.ts['"]/,
      /Created compiler\/r3f\.d\.ts/,
    ],
  },
];

const errors = [];

function toPosix(path) {
  return path.split(sep).join('/');
}

function stripKnownExtension(path) {
  return path.replace(/\.(tsx?|jsx?|mjs|cjs|mts|cts)$/i, '');
}

function shouldScan(rel) {
  const posixRel = toPosix(rel);
  if (posixRel === SELF_REL || posixRel === SELF_TEST_REL) return false;
  if (!SOURCE_EXTENSIONS.has(extname(posixRel))) return false;
  return !posixRel.split('/').some((part) => SKIP_DIRS.has(part));
}

function walk(dirAbs, acc) {
  let entries;
  try {
    entries = readdirSync(dirAbs, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const abs = resolve(dirAbs, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(abs, acc);
    } else if (entry.isFile()) {
      const rel = toPosix(relative(root, abs));
      if (shouldScan(rel)) acc.push(rel);
    }
  }
}

function gatherSourceFiles() {
  if (EXPLICIT_FILES) {
    return EXPLICIT_FILES.map(toPosix)
      .filter(shouldScan)
      .filter((rel) => existsSync(resolve(root, rel)) && statSync(resolve(root, rel)).isFile());
  }
  const files = [];
  for (const sourceRoot of SOURCE_ROOTS) {
    const abs = resolve(root, sourceRoot);
    if (existsSync(abs) && statSync(abs).isDirectory()) walk(abs, files);
  }
  return files.sort();
}

function shouldRunStaticCheck(file) {
  return !EXPLICIT_FILES || EXPLICIT_FILES.map(toPosix).includes(file);
}

function lineForOffset(source, index) {
  return source.slice(0, index).split('\n').length;
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '))
    .replace(/\/\/.*$/gm, (match) => ' '.repeat(match.length));
}

function normalizeSpecifier(specifier) {
  return toPosix(specifier).replace(/\/$/, '');
}

function resolvedSpecifier(relFile, specifier) {
  const normalized = normalizeSpecifier(specifier);
  if (normalized.startsWith('.')) {
    return stripKnownExtension(posix.normalize(posix.join(toPosix(dirname(relFile)), normalized)));
  }
  if (normalized.startsWith('@holoscript/core/')) {
    return stripKnownExtension(normalized.replace('@holoscript/core/', 'packages/core/src/'));
  }
  return stripKnownExtension(normalized);
}

function importedName(rawPart) {
  const clean = rawPart
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .trim()
    .replace(/^type\s+/, '')
    .trim();
  if (!clean) return null;
  return clean.split(/\s+as\s+/i)[0].trim();
}

function parseNamedImports(importsBlock) {
  return importsBlock
    .split(',')
    .map(importedName)
    .filter(Boolean);
}

function matchesRetiredImport(specifier, resolved) {
  const normalizedSpecifier = normalizeSpecifier(specifier);
  for (const retired of retiredImportModules) {
    for (const sourceFile of retired.sourceFiles) {
      if (resolved === `packages/core/src/compiler/${sourceFile}`) return retired;
      if (resolved.endsWith(`/compiler/${sourceFile}`)) return retired;
    }
    for (const subpath of retired.subpaths) {
      if (normalizedSpecifier === `@holoscript/core/compiler/${subpath}`) return retired;
      if (normalizedSpecifier === `@holoscript/core/dist/compiler/${subpath}`) return retired;
      if (resolved === `packages/core/src/compiler/${subpath}`) return retired;
      if (resolved.endsWith(`/compiler/${subpath}`)) return retired;
    }
  }
  return null;
}

function matchesRetiredSymbol(specifier, symbol) {
  const normalizedSpecifier = normalizeSpecifier(specifier);
  if (!['@holoscript/core', '@holoscript/core/compiler'].includes(normalizedSpecifier)) {
    return null;
  }
  for (const retired of retiredImportModules) {
    if (retired.symbols?.includes(symbol)) return retired;
  }
  return null;
}

function reportRetiredSymbol(relFile, source, index, symbol, retired) {
  errors.push(
    `${relFile}:${lineForOffset(source, index)} RETIRED-COMPILER-SYMBOL ${symbol} -> ` +
      `${retired.name} is retired; use ${retired.replacement}`
  );
}

function scanNamedCompilerImports(relFile, source) {
  const moduleVars = new Map();
  const staticNamespace = /\bimport\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s*['"](@holoscript\/core(?:\/compiler)?)['"]/g;
  const moduleImport =
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\(?\s*await\s+import\(\s*['"](@holoscript\/core(?:\/compiler)?)['"]\s*\)/g;
  const namedStatic =
    /\bimport\s+(?:type\s+)?\{([\s\S]*?)\}\s+from\s*['"](@holoscript\/core(?:\/compiler)?)['"]/g;
  const namedDynamic =
    /\b(?:const|let|var)\s+\{([\s\S]*?)\}\s*=\s*\(?\s*await\s+import\(\s*['"](@holoscript\/core(?:\/compiler)?)['"]\s*\)/g;

  for (const pattern of [staticNamespace, moduleImport]) {
    let match;
    while ((match = pattern.exec(source))) {
      moduleVars.set(match[1], normalizeSpecifier(match[2]));
    }
  }

  for (const pattern of [namedStatic, namedDynamic]) {
    let match;
    while ((match = pattern.exec(source))) {
      for (const symbol of parseNamedImports(match[1])) {
        const retired = matchesRetiredSymbol(match[2], symbol);
        if (retired) reportRetiredSymbol(relFile, source, match.index, symbol, retired);
      }
    }
  }

  for (const [varName, specifier] of moduleVars) {
    const destructuring = new RegExp(
      `\\b(?:const|let|var)\\s+\\{([\\s\\S]*?)\\}\\s*=\\s*${varName}\\b`,
      'g'
    );
    let destructureMatch;
    while ((destructureMatch = destructuring.exec(source))) {
      for (const symbol of parseNamedImports(destructureMatch[1])) {
        const retired = matchesRetiredSymbol(specifier, symbol);
        if (retired) reportRetiredSymbol(relFile, source, destructureMatch.index, symbol, retired);
      }
    }

    const memberAccess = new RegExp(`\\b${varName}\\.([A-Za-z_$][\\w$]*)\\b`, 'g');
    let memberMatch;
    while ((memberMatch = memberAccess.exec(source))) {
      const retired = matchesRetiredSymbol(specifier, memberMatch[1]);
      if (retired) reportRetiredSymbol(relFile, source, memberMatch.index, memberMatch[1], retired);
    }
  }
}

function scanImports(relFile) {
  const abs = resolve(root, relFile);
  const source = readFileSync(abs, 'utf8');
  const scanSource = stripComments(source);
  const patterns = [
    /\bfrom\s*['"]([^'"]+)['"]/g,
    /\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(scanSource))) {
      const specifier = match[1];
      const resolved = resolvedSpecifier(relFile, specifier);
      const retired = matchesRetiredImport(specifier, resolved);
      if (!retired) continue;
      errors.push(
        `${relFile}:${lineForOffset(source, match.index)} RETIRED-COMPILER-IMPORT ${specifier} -> ` +
        `${retired.name} is retired; use ${retired.replacement}`
      );
    }
  }
  scanNamedCompilerImports(relFile, scanSource);
}

for (const check of checks) {
  if (!shouldRunStaticCheck(check.file)) continue;
  const abs = resolve(root, check.file);
  if (!existsSync(abs)) continue;
  const source = readFileSync(abs, 'utf8');
  for (const pattern of check.patterns) {
    if (pattern.test(source)) {
      errors.push(`${relative(root, abs)} still matches ${pattern}`);
    }
  }
}

for (const relFile of gatherSourceFiles()) {
  scanImports(relFile);
}

if (errors.length) {
  console.error('[apex-poison-retired] retired compiler surface is still exposed:');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(
  '[apex-poison-retired] OK - retired compiler package subpaths are not built/declared/imported'
);
