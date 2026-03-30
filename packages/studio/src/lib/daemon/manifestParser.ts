/**
 * Manifest Parser -- Enriches Project DNA beyond file extension detection.
 *
 * Parses common project manifest files from uploaded archives to extract:
 *   - package.json (npm/yarn/pnpm)
 *   - requirements.txt / pyproject.toml (Python)
 *   - Cargo.toml (Rust)
 *   - go.mod (Go)
 *   - Gemfile (Ruby)
 *   - pom.xml / build.gradle (Java/Kotlin)
 *
 * This data is used to:
 *   1. Improve Project DNA confidence and kind detection
 *   2. Better recommend daemon profiles
 *   3. Inform the daemon runner about available build/test commands
 *
 * @module daemon/manifestParser
 */

import type {
  DaemonProjectDNA,
  DaemonProjectKind,
  DaemonProfile,
  ManifestData,
} from '@/lib/daemon/types';

// ---------------------------------------------------------------------------
// Known framework/stack detectors
// ---------------------------------------------------------------------------

interface FrameworkSignal {
  dependency: string;
  stack: string[];
  kind: DaemonProjectKind;
  /** Boost to confidence when detected */
  confidenceBoost: number;
  /** Profile recommendation hint */
  profileHint?: DaemonProfile;
}

const FRAMEWORK_SIGNALS: FrameworkSignal[] = [
  // Frontend frameworks
  { dependency: 'react', stack: ['react'], kind: 'frontend', confidenceBoost: 0.15 },
  { dependency: 'next', stack: ['react', 'next.js'], kind: 'frontend', confidenceBoost: 0.15 },
  { dependency: 'vue', stack: ['vue'], kind: 'frontend', confidenceBoost: 0.15 },
  { dependency: 'nuxt', stack: ['vue', 'nuxt'], kind: 'frontend', confidenceBoost: 0.15 },
  { dependency: 'svelte', stack: ['svelte'], kind: 'frontend', confidenceBoost: 0.15 },
  { dependency: '@angular/core', stack: ['angular'], kind: 'frontend', confidenceBoost: 0.15 },

  // Spatial/XR
  { dependency: 'three', stack: ['three.js'], kind: 'spatial', confidenceBoost: 0.2 },
  {
    dependency: '@react-three/fiber',
    stack: ['react', 'r3f'],
    kind: 'spatial',
    confidenceBoost: 0.2,
  },
  { dependency: '@babylonjs/core', stack: ['babylon.js'], kind: 'spatial', confidenceBoost: 0.2 },
  { dependency: 'aframe', stack: ['a-frame'], kind: 'spatial', confidenceBoost: 0.2 },
  {
    dependency: '@holoscript/core',
    stack: ['holoscript'],
    kind: 'spatial',
    confidenceBoost: 0.25,
    profileHint: 'balanced',
  },

  // Service/Backend
  { dependency: 'express', stack: ['express', 'node'], kind: 'service', confidenceBoost: 0.15 },
  { dependency: 'fastify', stack: ['fastify', 'node'], kind: 'service', confidenceBoost: 0.15 },
  { dependency: 'koa', stack: ['koa', 'node'], kind: 'service', confidenceBoost: 0.15 },
  { dependency: '@nestjs/core', stack: ['nestjs', 'node'], kind: 'service', confidenceBoost: 0.15 },
  { dependency: 'hono', stack: ['hono'], kind: 'service', confidenceBoost: 0.15 },

  // Data/ML
  {
    dependency: 'tensorflow',
    stack: ['tensorflow'],
    kind: 'data',
    confidenceBoost: 0.2,
    profileHint: 'deep',
  },
  {
    dependency: 'torch',
    stack: ['pytorch'],
    kind: 'data',
    confidenceBoost: 0.2,
    profileHint: 'deep',
  },
  { dependency: 'pandas', stack: ['pandas', 'python'], kind: 'data', confidenceBoost: 0.18 },
  { dependency: 'numpy', stack: ['numpy', 'python'], kind: 'data', confidenceBoost: 0.15 },
  { dependency: 'scikit-learn', stack: ['scikit-learn'], kind: 'data', confidenceBoost: 0.18 },

  // Automation
  { dependency: 'puppeteer', stack: ['puppeteer'], kind: 'automation', confidenceBoost: 0.15 },
  { dependency: 'playwright', stack: ['playwright'], kind: 'automation', confidenceBoost: 0.15 },
  { dependency: 'selenium', stack: ['selenium'], kind: 'automation', confidenceBoost: 0.15 },
];

// ---------------------------------------------------------------------------
// Parsers for different manifest formats
// ---------------------------------------------------------------------------

/**
 * Parse a package.json content string into ManifestData.
 */
export function parsePackageJson(content: string): ManifestData | null {
  try {
    const pkg = JSON.parse(content);
    const deps = Object.keys(pkg.dependencies ?? {});
    const devDeps = Object.keys(pkg.devDependencies ?? {});
    const scripts = Object.keys(pkg.scripts ?? {});

    // Detect key dependencies based on framework signals
    const keyDeps: string[] = [];
    for (const signal of FRAMEWORK_SIGNALS) {
      if (deps.includes(signal.dependency) || devDeps.includes(signal.dependency)) {
        keyDeps.push(signal.dependency);
      }
    }

    return {
      fileName: 'package.json',
      buildSystem: detectPackageManager(pkg),
      dependencyCount: deps.length,
      devDependencyCount: devDeps.length,
      keyDependencies: keyDeps,
      scripts,
    };
  } catch {
    return null;
  }
}

function detectPackageManager(pkg: Record<string, unknown>): string {
  if (pkg.packageManager) {
    const pm = String(pkg.packageManager);
    if (pm.startsWith('pnpm')) return 'pnpm';
    if (pm.startsWith('yarn')) return 'yarn';
    if (pm.startsWith('bun')) return 'bun';
  }
  return 'npm';
}

/**
 * Parse a requirements.txt content string into ManifestData.
 */
export function parseRequirementsTxt(content: string): ManifestData | null {
  const lines = content.split('\n').filter((l) => l.trim() && !l.startsWith('#'));
  const deps = lines.map((l) =>
    l
      .split(/[=<>!~]/)[0]
      .trim()
      .toLowerCase()
  );

  const keyDeps: string[] = [];
  for (const signal of FRAMEWORK_SIGNALS) {
    if (deps.includes(signal.dependency.toLowerCase())) {
      keyDeps.push(signal.dependency);
    }
  }

  return {
    fileName: 'requirements.txt',
    buildSystem: 'pip',
    dependencyCount: deps.length,
    devDependencyCount: 0,
    keyDependencies: keyDeps,
    scripts: [],
  };
}

/**
 * Parse a pyproject.toml content string into ManifestData.
 * (Simplified -- extracts key fields without a full TOML parser.)
 */
export function parsePyprojectToml(content: string): ManifestData | null {
  const deps: string[] = [];
  const devDeps: string[] = [];

  // Extract dependencies array
  const depMatch = content.match(/\[project\][\s\S]*?dependencies\s*=\s*\[([\s\S]*?)\]/);
  if (depMatch) {
    const items = depMatch[1].match(/"([^"]+)"/g) ?? [];
    for (const item of items) {
      deps.push(
        item
          .replace(/"/g, '')
          .split(/[=<>!~]/)[0]
          .trim()
          .toLowerCase()
      );
    }
  }

  // Extract optional/dev dependencies
  const devMatch = content.match(
    /\[project\.optional-dependencies\][\s\S]*?dev\s*=\s*\[([\s\S]*?)\]/
  );
  if (devMatch) {
    const items = devMatch[1].match(/"([^"]+)"/g) ?? [];
    for (const item of items) {
      devDeps.push(
        item
          .replace(/"/g, '')
          .split(/[=<>!~]/)[0]
          .trim()
          .toLowerCase()
      );
    }
  }

  const keyDeps: string[] = [];
  for (const signal of FRAMEWORK_SIGNALS) {
    const lower = signal.dependency.toLowerCase();
    if (deps.includes(lower) || devDeps.includes(lower)) {
      keyDeps.push(signal.dependency);
    }
  }

  // Detect build system
  let buildSystem = 'pip';
  if (content.includes('[tool.poetry]')) buildSystem = 'poetry';
  else if (content.includes('[tool.pdm]')) buildSystem = 'pdm';
  else if (content.includes('[tool.hatch]')) buildSystem = 'hatch';

  return {
    fileName: 'pyproject.toml',
    buildSystem,
    dependencyCount: deps.length,
    devDependencyCount: devDeps.length,
    keyDependencies: keyDeps,
    scripts: [],
  };
}

/**
 * Parse a Cargo.toml content string into ManifestData.
 */
export function parseCargoToml(content: string): ManifestData | null {
  const deps: string[] = [];
  const depMatch = content.match(/\[dependencies\]([\s\S]*?)(?:\[|\z)/);
  if (depMatch) {
    const lines = depMatch[1].split('\n').filter((l) => l.includes('='));
    for (const line of lines) {
      const name = line.split('=')[0].trim();
      if (name) deps.push(name);
    }
  }

  return {
    fileName: 'Cargo.toml',
    buildSystem: 'cargo',
    dependencyCount: deps.length,
    devDependencyCount: 0,
    keyDependencies: deps.filter((d) =>
      ['tokio', 'serde', 'wgpu', 'bevy', 'actix-web', 'axum'].includes(d)
    ),
    scripts: [],
  };
}

/**
 * Parse a go.mod content string into ManifestData.
 */
export function parseGoMod(content: string): ManifestData | null {
  const deps: string[] = [];
  const reqMatch = content.match(/require\s*\(([\s\S]*?)\)/);
  if (reqMatch) {
    const lines = reqMatch[1].split('\n').filter((l) => l.trim() && !l.includes('//'));
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts[0]) deps.push(parts[0]);
    }
  }

  return {
    fileName: 'go.mod',
    buildSystem: 'go',
    dependencyCount: deps.length,
    devDependencyCount: 0,
    keyDependencies: deps.filter(
      (d) => d.includes('gin-gonic') || d.includes('echo') || d.includes('fiber')
    ),
    scripts: [],
  };
}

// ---------------------------------------------------------------------------
// Combined Manifest Analysis
// ---------------------------------------------------------------------------

/**
 * Given a map of file names to content strings (from an extracted archive),
 * parse all recognized manifests and return enriched Project DNA.
 */
export function analyzeManifests(
  files: Map<string, string>,
  baseDna: DaemonProjectDNA
): DaemonProjectDNA {
  const manifests: ManifestData[] = [];
  const additionalStack: string[] = [];
  let kindVotes: Record<DaemonProjectKind, number> = {
    service: 0,
    data: 0,
    frontend: 0,
    spatial: 0,
    automation: 0,
    unknown: 0,
  };
  let confidenceBoost = 0;
  let profileHint: DaemonProfile | null = null;

  // Parse each recognized manifest
  const parsers: Array<{ pattern: string; parser: (content: string) => ManifestData | null }> = [
    { pattern: 'package.json', parser: parsePackageJson },
    { pattern: 'requirements.txt', parser: parseRequirementsTxt },
    { pattern: 'pyproject.toml', parser: parsePyprojectToml },
    { pattern: 'Cargo.toml', parser: parseCargoToml },
    { pattern: 'go.mod', parser: parseGoMod },
  ];

  for (const { pattern, parser } of parsers) {
    // Check for the manifest at root or one level deep
    for (const [fileName, content] of files) {
      const baseName = fileName.split('/').pop() ?? fileName;
      if (baseName === pattern) {
        const manifest = parser(content);
        if (manifest) {
          manifests.push(manifest);

          // Apply framework signals
          for (const keyDep of manifest.keyDependencies) {
            const signal = FRAMEWORK_SIGNALS.find((s) => s.dependency === keyDep);
            if (signal) {
              additionalStack.push(...signal.stack);
              kindVotes[signal.kind] += signal.confidenceBoost;
              confidenceBoost += signal.confidenceBoost;
              if (signal.profileHint) profileHint = signal.profileHint;
            }
          }
        }
      }
    }
  }

  if (manifests.length === 0) return baseDna;

  // Determine best kind from votes
  const allStacks = [...new Set([...baseDna.detectedStack, ...additionalStack])];
  const maxVoteKind = Object.entries(kindVotes)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)[0];

  const enrichedKind = maxVoteKind ? (maxVoteKind[0] as DaemonProjectKind) : baseDna.kind;
  const enrichedConfidence = Math.min(0.99, baseDna.confidence + confidenceBoost * 0.5);

  const notes = [...baseDna.notes];
  for (const m of manifests) {
    notes.push(
      `Parsed ${m.fileName}: ${m.dependencyCount} deps, ${m.devDependencyCount} devDeps (${m.buildSystem})`
    );
    if (m.keyDependencies.length > 0) {
      notes.push(`Key deps: ${m.keyDependencies.join(', ')}`);
    }
  }

  return {
    kind: enrichedKind,
    confidence: enrichedConfidence,
    detectedStack: allStacks,
    recommendedProfile: profileHint ?? baseDna.recommendedProfile,
    notes,
    manifests,
  };
}

/**
 * Client-side helper: reads a File as text and attempts to parse it
 * as a manifest. For single-file uploads (not archives).
 */
export async function parseFileAsManifest(file: File): Promise<ManifestData | null> {
  const name = file.name.toLowerCase();
  const content = await file.text();

  if (name === 'package.json') return parsePackageJson(content);
  if (name === 'requirements.txt') return parseRequirementsTxt(content);
  if (name === 'pyproject.toml') return parsePyprojectToml(content);
  if (name === 'cargo.toml') return parseCargoToml(content);
  if (name === 'go.mod') return parseGoMod(content);

  return null;
}
