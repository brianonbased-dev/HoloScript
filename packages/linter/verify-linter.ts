import { HoloScriptLinter } from './src/index';

const linter = new HoloScriptLinter({
  rules: {
    'no-duplicate-ids': 'error',
    'deprecated-trait': 'warn',
    'valid-trait-syntax': 'warn',
  },
});

const source = `
orb#myOrb {
  position: [0, 0, 0]
}

orb#myOrb {
  position: [1, 1, 1]
  @talkable
  @collision
  @unknown_trait
}
`;

console.log('--- Linting Test Source ---');
const result = linter.lint(source, 'test.hsplus');

// Debug AST
if (linter.lastAST) {
  console.log('--- AST Structure (First Child) ---');
  console.dir(linter.lastAST.children?.[1], { depth: 4 });
}

console.log(`File: ${result.filePath}`);
console.log(`Errors: ${result.errorCount}`);
console.log(`Warnings: ${result.warningCount}`);
console.log('\nDiagnostics:');

result.diagnostics.forEach((d) => {
  const sev = d.severity.toUpperCase();
  console.log(`[${sev}] ${d.ruleId} at ${d.line}:${d.column}: ${d.message}`);
});

if (result.errorCount === 1 && result.diagnostics.some((d) => d.ruleId === 'no-duplicate-ids')) {
  console.log('\n✅ no-duplicate-ids detected successfully.');
} else {
  console.log('\n❌ no-duplicate-ids detection failed.');
}

if (
  result.diagnostics.some((d) => d.ruleId === 'deprecated-trait' && d.message.includes('talkable'))
) {
  console.log('✅ deprecated @talkable detected successfully.');
} else {
  console.log('❌ deprecated @talkable detection failed.');
}

if (
  result.diagnostics.some(
    (d) => d.ruleId === 'valid-trait-syntax' && d.message.includes('unknown_trait')
  )
) {
  console.log('✅ unknown_trait detected successfully.');
} else {
  console.log('❌ unknown_trait detection failed.');
}
