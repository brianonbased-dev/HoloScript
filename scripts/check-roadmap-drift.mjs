import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const checks = [
  {
    id: 'A1',
    description: 'Legacy trait baseline phrase removed from active strategy roadmap',
    file: 'docs/strategy/ROADMAP.md',
    forbidden: [/1,800\+\s*(named\s*)?traits?/i],
  },
  {
    id: 'A2',
    description: 'Legacy compiler target count removed from active studio audit roadmap',
    file: 'docs/ROADMAP_STUDIO_AUDIT.md',
    forbidden: [/30\+\s*compiler\s*targets?/i],
  },
  {
    id: 'A3',
    description: 'Legacy implementation-status version removed from active research roadmap',
    file: 'docs/research/ECOSYSTEM_EXPANSION_ROADMAP.md',
    forbidden: [/implementation\s*status\s*\(\s*as\s*of\s*v5\.0\.0\s*\)/i],
  },
  {
    id: 'A4',
    description: 'Planning Phase label removed from active physics roadmap',
    file: 'docs/physics/PHYSICS_ENHANCEMENTS_ROADMAP.md',
    forbidden: [/\bplanning\s+phase\b/i],
  },
  {
    id: 'A5',
    description: 'Legacy Sprint 1 status phrase removed from active Grok roadmap',
    file: 'docs/GROK_X_INTEGRATION_ROADMAP.md',
    forbidden: [/sprint\s*1\s*:\s*.*complete/i],
  },
];

let failed = false;

function read(relativePath) {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) {
    return null;
  }
  return fs.readFileSync(fullPath, 'utf8');
}

console.log('Roadmap Drift Checklist');
console.log('=======================');

for (const check of checks) {
  const content = read(check.file);
  if (content === null) {
    failed = true;
    console.log(`[ ] ${check.id} ${check.description} (missing file: ${check.file})`);
    continue;
  }

  const hasForbiddenPhrase = check.forbidden.some((pattern) => pattern.test(content));
  if (hasForbiddenPhrase) {
    failed = true;
    console.log(`[ ] ${check.id} ${check.description}`);
  } else {
    console.log(`[x] ${check.id} ${check.description}`);
  }
}

if (failed) {
  console.log('\nRoadmap drift check failed.');
  process.exit(1);
}

console.log('\nRoadmap drift check passed.');
