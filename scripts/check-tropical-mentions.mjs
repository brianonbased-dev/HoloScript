#!/usr/bin/env node
import { execSync } from 'node:child_process';

const ROOT = process.cwd();

const PATTERN = 'tropical-min-plus|tropical-max-plus|min-plus|max-plus|semiring';

const allowList = [
  /^packages\/core\/src\/compiler\/traits\/Semiring\.ts$/,
  /^packages\/core\/src\/compiler\/traits\/ProvenanceSemiring\.ts$/,
  /^packages\/core\/src\/compiler\/__tests__\/ProvenanceSemiring\.test\.ts$/,
  /^packages\/core\/src\/compiler\/(BabylonCompiler|R3FCompiler|TraitComposer|TraitCompositionCompiler)\.ts$/,
  /^packages\/core\/src\/__tests__\/compiler\/TraitComposition\.test\.ts$/,
  /^packages\/core\/src\/compiler\/__tests__\/TraitCompositionIntegration\.test\.ts$/,
  /^packages\/core\/src\/legacy-exports\.ts$/,
  /^packages\/snn-webgpu\/src\//,
  /^packages\/snn-webgpu\/README\.md$/,
  /^packages\/absorb-service\/src\/engine\/CodebaseGraph\.ts$/,
  /^packages\/absorb-service\/src\/engine\/GraphRAGEngine\.ts$/,
  /^packages\/absorb-service\/src\/mcp\/codebase-tools\.ts$/,
  /^packages\/absorb-service\/src\/engine\/__tests__\/CodebaseGraph\.patch\.test\.ts$/,
  /^packages\/absorb-service\/README\.md$/,
  /^docs\/architecture\/TROPICAL_ALGEBRA_COVERAGE\.md$/,
  /^scripts\/check-tropical-mentions\.mjs$/,
];

function isAllowed(filePath) {
  return allowList.some((rx) => rx.test(filePath));
}

function runGrep() {
  const cmd = `git grep -n -I -E "${PATTERN}" -- packages docs scripts ":(exclude)**/dist/**" ":(exclude)**/node_modules/**"`;
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    if (err && typeof err === 'object' && 'stdout' in err) {
      return String(err.stdout || '');
    }
    throw err;
  }
}

const output = runGrep().trim();
if (!output) {
  console.log('[tropical-mentions] OK: no tropical algebra mentions found.');
  process.exit(0);
}

const violations = [];
for (const line of output.split(/\r?\n/)) {
  const [file] = line.split(':');
  if (!isAllowed(file)) {
    violations.push(line);
  }
}

if (violations.length > 0) {
  console.error('\n[tropical-mentions] Found algebraic tropical mentions outside approved coverage surfaces:');
  for (const v of violations) {
    console.error(`- ${v}`);
  }
  console.error(
    '\nIf intentional, add the path to scripts/check-tropical-mentions.mjs allowList and update docs/architecture/TROPICAL_ALGEBRA_COVERAGE.md.'
  );
  process.exit(1);
}

console.log('[tropical-mentions] OK: all algebraic tropical mentions are in approved coverage surfaces.');
