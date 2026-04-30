/**
 * scanner.ts — Local repo scanner that builds ProjectDNA without Absorb.
 *
 * This is the FREE tier scanner. It detects languages, frameworks, build tools,
 * test setup, and directory structure by reading the filesystem. No network calls.
 *
 * For deep analysis (dependency graphs, semantic search, code health scoring),
 * users upgrade to Absorb via Studio.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

export interface ProjectDNA {
  name: string;
  repoUrl: string;
  techStack: string[];
  frameworks: string[];
  languages: string[];
  packageCount: number;
  testCoverage: number;
  codeHealthScore: number;
  compilationTargets: string[];
  traits: string[];
}

// ─── Package.json detection ────────────────────────────────────────────────

interface PkgJson {
  name?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  workspaces?: string[] | { packages: string[] };
}

function readPkgJson(dir: string): PkgJson | null {
  const p = path.join(dir, 'package.json');
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    return null;
  }
}

// ─── Language detection ────────────────────────────────────────────────────

function detectLanguages(dir: string): string[] {
  const langs: string[] = [];
  const entries = listFilesShallow(dir, 3);

  if (entries.some(e => e.endsWith('.ts') || e.endsWith('.tsx'))) langs.push('ts');
  if (entries.some(e => e.endsWith('.js') || e.endsWith('.jsx'))) langs.push('js');
  if (entries.some(e => e.endsWith('.py'))) langs.push('py');
  if (entries.some(e => e.endsWith('.go'))) langs.push('go');
  if (entries.some(e => e.endsWith('.rs'))) langs.push('rs');
  if (entries.some(e => e.endsWith('.java'))) langs.push('java');
  if (entries.some(e => e.endsWith('.rb'))) langs.push('rb');
  if (entries.some(e => e.endsWith('.php'))) langs.push('php');
  if (entries.some(e => e.endsWith('.cs'))) langs.push('cs');
  if (entries.some(e => e.endsWith('.swift'))) langs.push('swift');
  if (entries.some(e => e.endsWith('.kt') || e.endsWith('.kts'))) langs.push('kotlin');

  return langs;
}

function listFilesShallow(dir: string, maxDepth: number, current: number = 0): string[] {
  if (current >= maxDepth) return [];
  const results: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build' || entry.name === '__pycache__' || entry.name === 'vendor') continue;
      const full = path.join(dir, entry.name);
      if (entry.isFile()) {
        results.push(full);
      } else if (entry.isDirectory()) {
        results.push(...listFilesShallow(full, maxDepth, current + 1));
      }
      if (results.length > 500) break; // cap for performance
    }
  } catch { /* permission errors, etc */ }
  return results;
}

// ─── Framework detection ───────────────────────────────────────────────────

function detectFrameworks(dir: string, pkg: PkgJson | null): string[] {
  const fws: string[] = [];
  const allDeps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };

  // JS/TS frameworks
  if (allDeps['next']) fws.push('next.js');
  else if (allDeps['react']) fws.push('react');
  if (allDeps['vue']) fws.push('vue');
  if (allDeps['svelte'] || allDeps['@sveltejs/kit']) fws.push('svelte');
  if (allDeps['express']) fws.push('express');
  if (allDeps['@nestjs/core']) fws.push('nest');
  if (allDeps['fastify']) fws.push('fastify');
  if (allDeps['hono']) fws.push('hono');

  // Python
  if (fs.existsSync(path.join(dir, 'manage.py'))) fws.push('django');
  if (fs.existsSync(path.join(dir, 'requirements.txt'))) {
    try {
      const reqs = fs.readFileSync(path.join(dir, 'requirements.txt'), 'utf-8');
      if (reqs.includes('fastapi')) fws.push('fastapi');
      if (reqs.includes('flask')) fws.push('flask');
      if (reqs.includes('django') && !fws.includes('django')) fws.push('django');
    } catch { /* */ }
  }
  if (fs.existsSync(path.join(dir, 'pyproject.toml'))) {
    try {
      const pyproj = fs.readFileSync(path.join(dir, 'pyproject.toml'), 'utf-8');
      if (pyproj.includes('fastapi')) fws.push('fastapi');
      if (pyproj.includes('flask')) fws.push('flask');
      if (pyproj.includes('django') && !fws.includes('django')) fws.push('django');
    } catch { /* */ }
  }

  // Go
  if (fs.existsSync(path.join(dir, 'go.mod'))) {
    try {
      const gomod = fs.readFileSync(path.join(dir, 'go.mod'), 'utf-8');
      if (gomod.includes('gin-gonic')) fws.push('gin');
      if (gomod.includes('labstack/echo')) fws.push('echo');
      if (gomod.includes('gofiber')) fws.push('fiber');
    } catch { /* */ }
  }

  // Rust
  if (fs.existsSync(path.join(dir, 'Cargo.toml'))) {
    try {
      const cargo = fs.readFileSync(path.join(dir, 'Cargo.toml'), 'utf-8');
      if (cargo.includes('actix-web')) fws.push('actix');
      if (cargo.includes('axum')) fws.push('axum');
      if (cargo.includes('rocket')) fws.push('rocket');
    } catch { /* */ }
  }

  return [...new Set(fws)];
}

// ─── Tech stack detection ──────────────────────────────────────────────────

function detectTechStack(dir: string, pkg: PkgJson | null, langs: string[]): string[] {
  const stack: string[] = [];
  const allDeps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };

  // Package manager
  if (fs.existsSync(path.join(dir, 'pnpm-lock.yaml')) || fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
    stack.push('pnpm');
  } else if (fs.existsSync(path.join(dir, 'yarn.lock'))) {
    stack.push('yarn');
  } else if (fs.existsSync(path.join(dir, 'package-lock.json'))) {
    stack.push('npm');
  }

  // Languages as stack items
  if (langs.includes('ts')) stack.push('typescript');
  if (langs.includes('js') && !langs.includes('ts')) stack.push('javascript');

  // Testing
  if (allDeps['vitest']) stack.push('vitest');
  else if (allDeps['jest']) stack.push('jest');

  // Linting
  if (allDeps['eslint']) stack.push('eslint');
  if (allDeps['prettier']) stack.push('prettier');

  // Build tools
  if (allDeps['vite']) stack.push('vite');
  if (allDeps['webpack']) stack.push('webpack');
  if (allDeps['esbuild']) stack.push('esbuild');
  if (allDeps['turbo'] || fs.existsSync(path.join(dir, 'turbo.json'))) stack.push('turborepo');

  // Databases / ORMs
  if (allDeps['prisma'] || allDeps['@prisma/client']) stack.push('prisma');
  if (allDeps['drizzle-orm']) stack.push('drizzle');
  if (allDeps['typeorm']) stack.push('typeorm');

  // CI
  if (fs.existsSync(path.join(dir, '.github', 'workflows'))) stack.push('ci');

  return stack;
}

// ─── Package count ─────────────────────────────────────────────────────────

function countPackages(dir: string, pkg: PkgJson | null): number {
  // pnpm workspace
  if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
    try {
      const content = fs.readFileSync(path.join(dir, 'pnpm-workspace.yaml'), 'utf-8');
      const patterns = content.match(/- ['"]?([^'":\n]+)/g);
      if (patterns && patterns.length > 0) {
        // Count actual dirs matching the first pattern
        const packagesDir = path.join(dir, 'packages');
        if (fs.existsSync(packagesDir)) {
          return fs.readdirSync(packagesDir, { withFileTypes: true })
            .filter(d => d.isDirectory() && !d.name.startsWith('.')).length;
        }
      }
    } catch { /* */ }
  }

  // npm/yarn workspaces
  if (pkg?.workspaces) {
    const ws = Array.isArray(pkg.workspaces) ? pkg.workspaces : pkg.workspaces.packages;
    if (ws && ws.length > 0) {
      const packagesDir = path.join(dir, 'packages');
      if (fs.existsSync(packagesDir)) {
        return fs.readdirSync(packagesDir, { withFileTypes: true })
          .filter(d => d.isDirectory() && !d.name.startsWith('.')).length;
      }
      return ws.length;
    }
  }

  return 1;
}

// ─── Git remote detection ──────────────────────────────────────────────────

function detectRepoUrl(dir: string): string {
  try {
    const remote = execSync('git remote get-url origin', {
      cwd: dir,
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return remote;
  } catch {
    return '';
  }
}

// ─── Main scanner ──────────────────────────────────────────────────────────

export function scanProject(dir: string): ProjectDNA {
  const absDir = path.resolve(dir);
  const pkg = readPkgJson(absDir);
  const langs = detectLanguages(absDir);
  const frameworks = detectFrameworks(absDir, pkg);
  const techStack = detectTechStack(absDir, pkg, langs);
  const packageCount = countPackages(absDir, pkg);
  const repoUrl = detectRepoUrl(absDir);
  const name = pkg?.name ?? path.basename(absDir);

  return {
    name,
    repoUrl: repoUrl || `https://github.com/user/${name}`,
    techStack,
    frameworks,
    languages: langs,
    packageCount,
    testCoverage: 0, // Free tier doesn't measure coverage — Absorb does
    codeHealthScore: 5, // Neutral default — Absorb provides real scoring
    compilationTargets: [],
    traits: [],
  };
}
