/**
 * projectDNA — Infer repo classification from absorb results.
 *
 * Takes absorb scan stats (filesByLanguage, symbolsByType, file paths) and
 * produces a ProjectDNA object describing what kind of project this is.
 */

import type { ProjectDNA, ProjectKind } from '../stores/workspaceStore';

// ─── Types from absorb stats ─────────────────────────────────────────────────

interface AbsorbStats {
  totalFiles: number;
  totalSymbols: number;
  totalImports: number;
  totalLoc: number;
  filesByLanguage: Record<string, number>;
  symbolsByType: Record<string, number>;
  totalCalls: number;
  errors: string[];
}

interface HubFile {
  path: string;
  inDegree: number;
  symbols: number;
}

interface DetectDNAInput {
  stats: AbsorbStats;
  hubFiles: HubFile[];
  leafFirstOrder: string[];
}

// ─── Framework + runtime detection ───────────────────────────────────────────

const FRAMEWORK_SIGNALS: Record<string, string[]> = {
  react: ['react', 'jsx', 'tsx', 'next.config', 'app/layout', 'pages/'],
  vue: ['vue', '.vue', 'nuxt.config', 'vite.config'],
  angular: ['angular.json', '@angular', '.component.ts'],
  express: ['express', 'app.listen', 'router.get', 'router.post'],
  fastapi: ['fastapi', 'uvicorn', '@app.get', '@app.post'],
  django: ['django', 'manage.py', 'urls.py', 'views.py'],
  nest: ['@nestjs', '.module.ts', '.controller.ts', '.service.ts'],
  holoscript: ['.holo', '.hsplus', 'composition', '@trait'],
  ros2: ['rclpy', 'rclcpp', 'ament_cmake', 'launch.py'],
  unity: ['.unity', '.cs', 'Assets/', 'ProjectSettings/'],
  godot: ['.gd', '.tscn', 'project.godot'],
};

const PACKAGE_MANAGER_FILES: Record<string, string> = {
  'package-lock.json': 'npm',
  'yarn.lock': 'yarn',
  'pnpm-lock.yaml': 'pnpm',
  'bun.lockb': 'bun',
  'Pipfile.lock': 'pipenv',
  'poetry.lock': 'poetry',
  'Cargo.lock': 'cargo',
  'go.sum': 'go-modules',
};

// ─── Kind scoring ────────────────────────────────────────────────────────────

function scoreKind(stats: AbsorbStats, paths: string[]): Record<ProjectKind, number> {
  const scores: Record<ProjectKind, number> = {
    service: 0,
    frontend: 0,
    data: 0,
    automation: 0,
    'agent-backend': 0,
    library: 0,
    spatial: 0,
    unknown: 0.1,
  };

  const pathStr = paths.join('\n').toLowerCase();
  const langs = stats.filesByLanguage;

  // Frontend signals
  if (langs['tsx'] || langs['jsx'] || langs['vue']) scores.frontend += 3;
  if (pathStr.includes('components/')) scores.frontend += 2;
  if (pathStr.includes('pages/') || pathStr.includes('app/')) scores.frontend += 1;
  if (pathStr.includes('.css') || pathStr.includes('.scss')) scores.frontend += 1;

  // Service signals
  if (pathStr.includes('routes/') || pathStr.includes('controllers/')) scores.service += 3;
  if (pathStr.includes('middleware/')) scores.service += 2;
  if (pathStr.includes('prisma/') || pathStr.includes('drizzle/')) scores.service += 1;
  if (pathStr.includes('api/')) scores.service += 1;

  // Data signals
  if (langs['py'] && pathStr.includes('notebook')) scores.data += 3;
  if (pathStr.includes('.ipynb')) scores.data += 3;
  if (pathStr.includes('pipeline') || pathStr.includes('etl')) scores.data += 2;
  if (pathStr.includes('schema') || pathStr.includes('migration')) scores.data += 1;

  // Library signals
  if (pathStr.includes('src/index.ts') || pathStr.includes('src/lib/')) scores.library += 2;
  if (pathStr.includes('dist/') || pathStr.includes('tsup.config')) scores.library += 2;
  if (pathStr.includes('exports') || pathStr.includes('main')) scores.library += 1;

  // Automation signals
  if (pathStr.includes('cron') || pathStr.includes('scheduler')) scores.automation += 3;
  if (pathStr.includes('.github/workflows')) scores.automation += 2;
  if (pathStr.includes('bot') || pathStr.includes('webhook')) scores.automation += 2;

  // Agent / MCP backend
  if (pathStr.includes('mcp') || pathStr.includes('agent')) scores['agent-backend'] += 3;
  if (pathStr.includes('tools/') || pathStr.includes('skills/')) scores['agent-backend'] += 2;

  // Spatial signals
  if (langs['holo'] || langs['hsplus']) scores.spatial += 4;
  if (pathStr.includes('.gltf') || pathStr.includes('.glb')) scores.spatial += 2;
  if (pathStr.includes('shader') || pathStr.includes('.wgsl')) scores.spatial += 2;
  if (pathStr.includes('unity') || pathStr.includes('godot')) scores.spatial += 3;

  return scores;
}

// ─── Repo shape detection ────────────────────────────────────────────────────

function detectRepoShape(paths: string[]): ProjectDNA['repoShape'] {
  const hasPackagesDir = paths.some((p) => p.includes('/packages/') || p.includes('\\packages\\'));
  const hasWorkspaces = paths.some((p) =>
    p.endsWith('pnpm-workspace.yaml') || p.endsWith('lerna.json'),
  );
  if (hasPackagesDir || hasWorkspaces) return 'monorepo';

  const languages = new Set<string>();
  for (const p of paths) {
    const ext = p.split('.').pop()?.toLowerCase();
    if (ext) languages.add(ext);
  }
  if (languages.size > 4) return 'polyglot';

  return 'single-package';
}

// ─── Risk signals ────────────────────────────────────────────────────────────

function detectRisks(stats: AbsorbStats, hubFiles: HubFile[]): string[] {
  const risks: string[] = [];
  if (stats.totalLoc > 100_000) risks.push('large-codebase');
  if (stats.errors.length > 10) risks.push('scan-errors');
  if (hubFiles.length > 0 && hubFiles[0].inDegree > 20) risks.push('god-file');
  if (Object.keys(stats.filesByLanguage).length > 5) risks.push('polyglot-complexity');
  return risks;
}

function detectStrengths(stats: AbsorbStats, paths: string[]): string[] {
  const strengths: string[] = [];
  const pathStr = paths.join('\n').toLowerCase();
  if (pathStr.includes('test') || pathStr.includes('spec')) strengths.push('has-tests');
  if (pathStr.includes('readme') || pathStr.includes('docs/')) strengths.push('documented');
  if (pathStr.includes('.github/workflows') || pathStr.includes('.gitlab-ci')) strengths.push('has-ci');
  if (pathStr.includes('tsconfig')) strengths.push('typed');
  if (pathStr.includes('.eslint') || pathStr.includes('.prettier')) strengths.push('linted');
  return strengths;
}

// ─── Recommended profile ─────────────────────────────────────────────────────

const KIND_TO_PROFILE: Record<ProjectKind, string> = {
  service: 'service',
  frontend: 'frontend',
  data: 'data',
  automation: 'automation',
  'agent-backend': 'agent-backend',
  library: 'library',
  spatial: 'spatial',
  unknown: 'service',
};

function recommendMode(stats: AbsorbStats): ProjectDNA['recommendedMode'] {
  if (stats.totalFiles < 50) return 'quick';
  if (stats.totalFiles < 500) return 'balanced';
  return 'deep';
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function detectProjectDNA(input: DetectDNAInput): ProjectDNA {
  const { stats, hubFiles, leafFirstOrder } = input;
  const paths = leafFirstOrder;

  // Score each kind
  const scores = scoreKind(stats, paths);
  const sorted = (Object.entries(scores) as [ProjectKind, number][])
    .sort(([, a], [, b]) => b - a);
  const [topKind, topScore] = sorted[0];
  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);

  // Detect frameworks
  const frameworks: string[] = [];
  const pathStr = paths.join('\n').toLowerCase();
  for (const [fw, signals] of Object.entries(FRAMEWORK_SIGNALS)) {
    if (signals.some((s) => pathStr.includes(s.toLowerCase()))) {
      frameworks.push(fw);
    }
  }

  // Detect package managers
  const packageManagers: string[] = [];
  for (const [file, manager] of Object.entries(PACKAGE_MANAGER_FILES)) {
    if (paths.some((p) => p.endsWith(file))) {
      packageManagers.push(manager);
    }
  }

  // Languages
  const languages = Object.entries(stats.filesByLanguage)
    .sort(([, a], [, b]) => b - a)
    .map(([lang]) => lang);

  // Runtimes
  const runtimes: string[] = [];
  if (languages.includes('ts') || languages.includes('js') || languages.includes('tsx')) runtimes.push('node');
  if (languages.includes('py')) runtimes.push('python');
  if (languages.includes('rs')) runtimes.push('rust');
  if (languages.includes('go')) runtimes.push('go');

  return {
    kind: topKind,
    confidence: totalScore > 0 ? topScore / totalScore : 0,
    languages,
    frameworks,
    packageManagers,
    runtimes,
    repoShape: detectRepoShape(paths),
    riskSignals: detectRisks(stats, hubFiles),
    strengths: detectStrengths(stats, paths),
    recommendedProfile: KIND_TO_PROFILE[topKind],
    recommendedMode: recommendMode(stats),
  };
}
