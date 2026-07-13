import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname.replace(/^\//u, ''));
const ignoredDirs = new Set(['node_modules', 'dist', 'coverage', '.next', '.turbo']);
const sourceExtensions = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts']);
const builtins = new Set(['assert', 'buffer', 'child_process', 'crypto', 'events', 'fs', 'http', 'https', 'module', 'net', 'node:test', 'os', 'path', 'perf_hooks', 'process', 'stream', 'string_decoder', 'timers', 'url', 'util', 'worker_threads', 'zlib']);
function walk(dir, visitor) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, visitor); else visitor(path);
  }
}
function packageName(specifier) { return specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0]; }
const packages = [];
walk(join(root, 'packages'), (path) => {
  if (!path.endsWith('package.json')) return;
  try { const manifest = JSON.parse(readFileSync(path, 'utf8')); if (manifest.name) packages.push({ root: resolve(path, '..'), manifest }); } catch { /* ignore invalid manifests */ }
});
const workspaceNames = new Set(packages.map(({ manifest }) => manifest.name));
const findings = [];
for (const pkg of packages) {
  const declared = new Set([...Object.keys(pkg.manifest.dependencies || {}), ...Object.keys(pkg.manifest.optionalDependencies || {}), ...Object.keys(pkg.manifest.peerDependencies || {}), ...Object.keys(pkg.manifest.devDependencies || {})]);
  const files = [];
  for (const sourceRoot of ['src', 'bin']) { const path = join(pkg.root, sourceRoot); if (existsSync(path)) walk(path, (file) => { if (sourceExtensions.has(extname(file))) files.push(file); }); }
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/^\s*(?:import\s+(?:type\s+)?[^;\n]*?from\s+|import\s*\(|(?:const|let|var)\s+[^=]+?=\s*require\s*\()\s*['"]([^'"]+)['"]/gmu)) {
      const specifier = match[1];
      const name = packageName(specifier);
      if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('node:') || specifier.includes('${') || builtins.has(name) || declared.has(name)) continue;
      findings.push({ package: pkg.manifest.name, importer: relative(root, file).replace(/\\/gu, '/'), specifier, dependency: name, kind: workspaceNames.has(name) ? 'undeclared-workspace-import' : 'undeclared-external-import', action: 'file-or-declare-before-publishing' });
    }
  }
}
const result = { schema: 'holoscript.workspace.package-dependency-audit.v1', generatedAt: new Date().toISOString(), workspaceRoot: root.replace(/\\/gu, '/'), packageCount: packages.length, findingCount: findings.length, findings, policy: 'Every imported package must be declared by the importing package or explicitly filed as an external peer boundary before public release.' };
mkdirSync(join(root, 'reports'), { recursive: true });
writeFileSync(join(root, 'reports', 'package-dependency-audit.json'), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ ok: true, packageCount: result.packageCount, findingCount: result.findingCount, report: 'reports/package-dependency-audit.json' }, null, 2));
