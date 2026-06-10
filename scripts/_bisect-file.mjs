/**
 * Binary-search which line of a file triggers an infinite loop/timeout.
 * Usage: node scripts/_bisect-file.mjs <file.holo>
 */
import { spawnSync } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const RUNNER = join(ROOT, 'scripts/_parse-one.cjs');
const PARSER = join(ROOT, 'packages/core/dist/parser.cjs');

const targetFile = process.argv[2];
if (!targetFile) { console.error('Usage: node scripts/_bisect-file.mjs <file>'); process.exit(1); }

const lines = readFileSync(targetFile, 'utf8').split('\n');
console.log(`Total lines: ${lines.length}`);

function testLines(slice) {
  const src = slice.join('\n');
  const tmpFile = join(ROOT, '.bench-logs/dogfood/_bisect-tmp.holo');
  mkdirSync(join(ROOT, '.bench-logs/dogfood'), { recursive: true });
  writeFileSync(tmpFile, src);
  const res = spawnSync(process.execPath, [RUNNER, PARSER, tmpFile], { timeout: 5000, maxBuffer: 64*1024 });
  return res.status !== null; // true = completed (pass or fail), false = timeout/killed
}

// Binary search: find smallest prefix that triggers timeout
let lo = 1, hi = lines.length;
while (lo < hi) {
  const mid = Math.floor((lo + hi) / 2);
  const slice = lines.slice(0, mid);
  process.stdout.write(`Testing lines 1-${mid}... `);
  const completed = testLines(slice);
  if (completed) {
    console.log('ok (no timeout)');
    lo = mid + 1;
  } else {
    console.log('TIMEOUT — narrowing down');
    hi = mid;
  }
}
console.log(`\nInfinite loop triggered starting at/before line ${lo}`);
console.log('Context:', lines.slice(Math.max(0, lo-5), lo+5).join('\n'));
