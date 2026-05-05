import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const checks = [
  {
    id: 'A1',
    description: 'Hardcoded trait counts removed from active strategy roadmap',
    file: 'docs/strategy/ROADMAP.md',
    forbidden: [/(?:1,800|2,000|3,300)\+\s*(named\s*)?traits?/i],
  },
  {
    id: 'A2',
    description: 'Legacy compiler target count removed from active Studio audit',
    file: 'packages/studio/STUDIO_AUDIT.md',
    forbidden: [/30\+\s*compiler\s*targets?/i],
  },
  {
    id: 'A3',
    description: 'Legacy implementation-status/version language removed from active research roadmap',
    file: 'docs/research/ECOSYSTEM_EXPANSION_ROADMAP.md',
    forbidden: [
      /implementation\s*status\s*\(\s*as\s*of\s*v(?:3\.42\.0|5\.0\.0)\s*\)/i,
      /\b2,000\+\s*traits\b/i,
      /\bQ1-Q2\s+2026\b/i,
    ],
  },
  {
    id: 'A4',
    description: 'Start-from-zero status labels removed from active physics roadmap',
    file: 'docs/physics/PHYSICS_ENHANCEMENTS_ROADMAP.md',
    forbidden: [/\bplanning\s+phase\b/i, /\bready\s+to\s+begin\b/i],
  },
  {
    id: 'A5',
    description: 'Archived Grok/X endpoints and guide links removed from active integration guide',
    file: 'docs/integrations/grok.md',
    forbidden: [
      /https:\/\/api\.holoscript\.net/i,
      /MCP_SERVER_GUIDE\.md/i,
      /pypi\.org\/project\/holoscript\/5\.3\.0/i,
      /\b103\+\s*tools\b/i,
      /sprint\s*1\s*:\s*.*complete/i,
    ],
  },
  {
    id: 'A6',
    description: 'AI-first docs/filesystem contract stays active and enforceable',
    file: 'docs/guides/ai-first-docs-filesystems.md',
    required: [
      /docs and filesystems are agent interfaces first/i,
      /Source of truth:/i,
      /Verify:/i,
      /What Remains After This Plan/i,
    ],
    forbidden: [],
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

  const forbidden = check.forbidden ?? [];
  const required = check.required ?? [];
  const hasForbiddenPhrase = forbidden.some((pattern) => pattern.test(content));
  const missingRequiredPhrase = required.some((pattern) => !pattern.test(content));
  if (hasForbiddenPhrase || missingRequiredPhrase) {
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
