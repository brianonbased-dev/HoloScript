/**
 * Template generator for hook definitions.
 *
 * Every scaffolded project gets 3 hooks:
 * - validate-edit: validates files using their linter config
 * - operation-counter: triggers scan periodically
 * - session-report: end-of-session summary
 */

import type { ScaffoldDNA } from '../scaffolder';

export interface HookDefinition {
  /** Hook name (used as filename) */
  name: string;
  /** Hook type: when it fires */
  type: 'PostToolUse' | 'PreToolUse' | 'Stop';
  /** File match pattern (glob) */
  matchPattern: string;
  /** The hook script content (JavaScript/mjs) */
  content: string;
}

// ─── Lint command detection ─────────────────────────────────────────────────

function lintCommandForFile(dna: ScaffoldDNA): string {
  if (dna.techStack.includes('eslint')) {
    return 'npx eslint --fix';
  }
  if (dna.languages.includes('py')) {
    return 'ruff check --fix';
  }
  if (dna.languages.includes('go')) {
    return 'gofmt -w';
  }
  if (dna.languages.includes('rs')) {
    return 'rustfmt';
  }
  return 'echo "No linter configured for"';
}

function fileExtensions(dna: ScaffoldDNA): string[] {
  const exts: string[] = [];
  if (dna.techStack.includes('typescript') || dna.languages.includes('ts')) {
    exts.push('.ts', '.tsx');
  }
  if (dna.languages.includes('js') || dna.techStack.includes('javascript')) {
    exts.push('.js', '.jsx');
  }
  if (dna.languages.includes('py')) {
    exts.push('.py');
  }
  if (dna.languages.includes('go')) {
    exts.push('.go');
  }
  if (dna.languages.includes('rs')) {
    exts.push('.rs');
  }
  if (exts.length === 0) {
    exts.push('.ts', '.js');
  }
  return exts;
}

// ─── validate-edit hook ─────────────────────────────────────────────────────

function validateEditHook(dna: ScaffoldDNA): HookDefinition {
  const lintCmd = lintCommandForFile(dna);
  const exts = fileExtensions(dna);
  const extCheck = exts.map(e => `filePath.endsWith('${e}')`).join(' || ');

  return {
    name: 'validate-edit',
    type: 'PostToolUse',
    matchPattern: '(Edit|Write)',
    content: `#!/usr/bin/env node
/**
 * validate-edit — PostToolUse hook
 * Runs the project linter on files after they are edited or written.
 * Configured for: ${dna.name}
 */

import { execSync } from 'child_process';

const event = JSON.parse(process.argv[2] || '{}');
const filePath = event?.tool_input?.file_path || event?.tool_input?.path || '';

if (!filePath) process.exit(0);

// Only lint known file types
if (!(${extCheck})) {
  process.exit(0);
}

try {
  execSync(\`${lintCmd} "\${filePath}"\`, {
    stdio: 'pipe',
    timeout: 10000,
  });
} catch (err) {
  const msg = err instanceof Error && 'stderr' in err
    ? String((err as NodeJS.ErrnoException & { stderr?: Buffer }).stderr)
    : 'Lint check failed';
  console.error(\`[validate-edit] Lint issues in \${filePath}: \${msg.slice(0, 200)}\`);
  // Don't block — just warn
}
`,
  };
}

// ─── operation-counter hook ─────────────────────────────────────────────────

function operationCounterHook(dna: ScaffoldDNA): HookDefinition {
  return {
    name: 'operation-counter',
    type: 'PostToolUse',
    matchPattern: '.*',
    content: `#!/usr/bin/env node
/**
 * operation-counter — PostToolUse hook
 * Counts tool operations and nudges the agent to run /scan every N operations.
 * Configured for: ${dna.name}
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const SCAN_INTERVAL = 15;
const STATE_FILE = path.join(os.tmpdir(), '${dna.name.replace(/[^a-zA-Z0-9]/g, '-')}-op-counter.json');

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  } catch {
    return { count: 0 };
  }
}

function writeState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state), 'utf-8');
}

const state = readState();
state.count = (state.count || 0) + 1;
writeState(state);

if (state.count % SCAN_INTERVAL === 0) {
  console.log(\`[operation-counter] \${state.count} operations completed. Consider running /scan.\`);
}
`,
  };
}

// ─── session-report hook ────────────────────────────────────────────────────

function sessionReportHook(dna: ScaffoldDNA): HookDefinition {
  return {
    name: 'session-report',
    type: 'Stop',
    matchPattern: '.*',
    content: `#!/usr/bin/env node
/**
 * session-report — Stop hook
 * Generates an end-of-session summary: files changed, commits made, TODOs added.
 * Configured for: ${dna.name}
 */

import { execSync } from 'child_process';

try {
  // Git status summary
  const status = execSync('git status --short', {
    encoding: 'utf-8',
    timeout: 5000,
  }).trim();

  const lines = status.split('\\n').filter(Boolean);
  const modified = lines.filter(l => l.startsWith(' M') || l.startsWith('M ')).length;
  const added = lines.filter(l => l.startsWith('A ') || l.startsWith('??')).length;

  // Recent commits in this session (last hour)
  const commits = execSync('git log --oneline --since="1 hour ago"', {
    encoding: 'utf-8',
    timeout: 5000,
  }).trim();

  const commitCount = commits ? commits.split('\\n').length : 0;

  console.log('');
  console.log('SESSION SUMMARY');
  console.log('===============');
  console.log(\`Commits:  \${commitCount}\`);
  console.log(\`Modified: \${modified} files\`);
  console.log(\`New:      \${added} files\`);

  if (lines.length > 0) {
    console.log('');
    console.log('Uncommitted changes:');
    for (const line of lines.slice(0, 10)) {
      console.log(\`  \${line}\`);
    }
    if (lines.length > 10) {
      console.log(\`  ... and \${lines.length - 10} more\`);
    }
  }
} catch {
  // Graceful failure — don't block session end
  console.log('[session-report] Could not generate summary.');
}
`,
  };
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function generateHooks(dna: ScaffoldDNA): HookDefinition[] {
  return [
    validateEditHook(dna),
    operationCounterHook(dna),
    sessionReportHook(dna),
  ];
}
