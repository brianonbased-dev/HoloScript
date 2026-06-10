/**
 * Parse sweep: spawns one child process per .holo file with a 10s timeout.
 * Reports PASS/FAIL/TIMEOUT per file without accumulating AST state.
 */
import { spawnSync } from 'child_process';
import { readdirSync, statSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

function walk(dir, acc = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (f.endsWith('.holo')) acc.push(p);
  }
  return acc;
}

const RUNNER_SCRIPT = join(ROOT, 'scripts/_parse-one.cjs');
const PARSER_CJS = join(ROOT, 'packages/core/dist/parser.cjs');
const files = walk(join(ROOT, 'examples')).sort();

let pass = 0, fail = 0, timeout = 0;
const results = [];

for (let i = 0; i < files.length; i++) {
  const f = files[i];
  const rel = relative(ROOT, f);
  process.stdout.write(`[${i+1}/${files.length}] ${rel}... `);

  const res = spawnSync(process.execPath, [RUNNER_SCRIPT, PARSER_CJS, f], {
    timeout: 10000,
    maxBuffer: 1024 * 1024,
  });

  if (res.status === null) {
    console.log('TIMEOUT');
    timeout++;
    results.push({ file: rel, result: 'TIMEOUT' });
  } else if (res.stdout?.toString().startsWith('PASS')) {
    console.log('ok');
    pass++;
    results.push({ file: rel, result: 'PASS' });
  } else {
    const msg = res.stdout?.toString().replace('FAIL:', '').trim() ||
                res.stderr?.toString().substring(0, 80).trim() || 'unknown';
    console.log(`FAIL: ${msg.substring(0, 80)}`);
    fail++;
    results.push({ file: rel, result: 'FAIL', error: msg });
  }
}

console.log(`\nSUMMARY: PASS=${pass} FAIL=${fail} TIMEOUT=${timeout} TOTAL=${files.length}`);

// Write results to file for analysis
const outPath = join(ROOT, '.bench-logs/dogfood/parse-sweep-results.json');
mkdirSync(join(ROOT, '.bench-logs/dogfood'), { recursive: true });
writeFileSync(outPath, JSON.stringify({ pass, fail, timeout, total: files.length, results }, null, 2));
console.log(`Results written to ${outPath}`);
