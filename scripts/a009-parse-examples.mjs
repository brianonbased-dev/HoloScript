/**
 * A-009 Phase 1: Parse all .hs/.hsplus/.holo examples via @holoscript/core ./parser entry
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');
const require = createRequire(import.meta.url);

const core = require(join(ROOT, 'packages/core/dist/parser.cjs'));
const { parseHolo, parse, HoloScriptPlusParser } = core;

function parseHsPlus(code) {
  const p = new HoloScriptPlusParser();
  return p.parse(code);
}

function collectExamples(dirs) {
  const files = [];
  for (const dir of dirs) {
    try {
      const walk = (d) => {
        for (const entry of readdirSync(d)) {
          const full = join(d, entry);
          try {
            const st = statSync(full);
            if (st.isDirectory()) walk(full);
            else if (/\.(hs|hsplus|holo)$/.test(entry)) files.push(full);
          } catch {}
        }
      };
      walk(dir);
    } catch {}
  }
  return files;
}

function tryParse(filepath) {
  const ext = filepath.split('.').pop();
  const code = readFileSync(filepath, 'utf8');
  try {
    if (ext === 'holo') { parseHolo(code); return { ok: true }; }
    if (ext === 'hsplus') { parseHsPlus(code); return { ok: true }; }
    // .hs
    parse(code);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message.split('\n')[0].slice(0, 240) };
  }
}

const searchDirs = [
  join(ROOT, 'examples'),
  join(ROOT, 'docs/examples'),
  join(ROOT, 'samples'),
].concat(
  readdirSync(join(ROOT, 'packages')).map(p => join(ROOT, 'packages', p, 'examples')).filter(d => {
    try { statSync(d); return true; } catch { return false; }
  })
);

const files = collectExamples(searchDirs);
const results = { pass: [], fail: [] };

for (const f of files) {
  const rel = relative(ROOT, f);
  const r = tryParse(f);
  if (r.ok) results.pass.push(rel);
  else results.fail.push({ file: rel, error: r.error });
}

console.log(`Parsed ${files.length} examples: ${results.pass.length} pass, ${results.fail.length} fail`);
if (results.fail.length) {
  console.log('\nFAILURES:');
  for (const f of results.fail) console.log(`  FAIL  ${f.file}\n        ${f.error}`);
}

process.stdout.write('\n__PARSE_RESULTS__\n' + JSON.stringify(results) + '\n');
process.exit(results.fail.length > 0 ? 1 : 0);
