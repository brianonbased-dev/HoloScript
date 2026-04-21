/**
 * Strip erroneous leading "_" from named imports/exports in brace lists.
 * One-shot repair for corrupted specifiers (_Search -> Search).
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(process.cwd(), 'src');
const exts = new Set(['.ts', '.tsx']);

function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p);
    else if (exts.has(path.extname(ent.name))) transform(p);
  }
}

function transform(file) {
  let s = fs.readFileSync(file, 'utf8');
  const orig = s;

  const re =
    /\b(import|export)\s+(type\s+)?\{([^}]*)\}\s+from\s+['"]([^'"]+)['"]/gs;
  s = s.replace(re, (full, _kw, _typeKw, inner, _mod) => {
    const fixed = inner.replace(/\b_([A-Za-z][a-zA-Z0-9]*)\b/g, (_, name) => name);
    return full.replace(inner, fixed);
  });

  if (s !== orig) fs.writeFileSync(file, s);
}

walk(root);
console.log('fix-import-underscores: done');
