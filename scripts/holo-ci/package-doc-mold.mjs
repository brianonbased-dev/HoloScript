#!/usr/bin/env node
/**
 * Builds and checks the package documentation mold used by package-fostering
 * passes.
 *
 * The check is intentionally scoped to docs that have opted into the mold by
 * carrying a "Package Surface" section. Older package pages can migrate into
 * the mold incrementally without turning this report into a noisy legacy audit.
 */

import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const JSON_OUT = args.includes('--json');
const SELF_TEST = args.includes('--self-test');
const EMIT = args.includes('--emit');
const STRICT = args.includes('--strict');
const rootIdx = args.indexOf('--root');
const packageIdx = args.indexOf('--package');
const docIdx = args.indexOf('--doc');

const ROOT = rootIdx >= 0 ? resolve(args[rootIdx + 1]) : resolve(__dirname, '..', '..');
const PACKAGE_NAME = packageIdx >= 0 ? args[packageIdx + 1] : null;
const DOC_PATH = docIdx >= 0 ? normalizeRepoPath(args[docIdx + 1]) : null;

const REQUIRED_SECTIONS = ['Install', 'Use', 'Package Surface', 'Strategy Role', 'Validation'];
const SKIP_DOCS = new Set(['governance.md', 'index.md', 'support-directories.md']);

function normalizeRepoPath(value) {
  return String(value || '').replace(/\\/g, '/');
}

function readJson(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readText(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

function normalizePackageName(name) {
  return String(name || '').replace(/^@[^/]+\//, '');
}

function sortedSet(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function walkPackageJsons(root) {
  const packagesRoot = join(root, 'packages');
  const found = [];
  if (!existsSync(packagesRoot)) return found;

  for (const entry of readdirSync(packagesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const direct = join(packagesRoot, entry.name, 'package.json');
    if (existsSync(direct)) found.push(direct);

    const nestedRoot = join(packagesRoot, entry.name);
    for (const nested of readdirSync(nestedRoot, { withFileTypes: true })) {
      if (!nested.isDirectory()) continue;
      const nestedPackage = join(nestedRoot, nested.name, 'package.json');
      if (existsSync(nestedPackage)) found.push(nestedPackage);
    }
  }

  return sortedSet(found);
}

function readPackages(root) {
  return walkPackageJsons(root)
    .map((manifestPath) => {
      const manifest = readJson(manifestPath);
      const packageDir = normalizeRepoPath(relative(root, dirname(manifestPath)));
      return {
        name: manifest.name,
        dir: packageDir,
        dirBase: basename(packageDir),
        private: manifest.private === true,
        description: manifest.description || '',
        manifest,
        manifestPath: normalizeRepoPath(relative(root, manifestPath)),
      };
    })
    .filter((pkg) => pkg.name)
    .sort((a, b) => a.dir.localeCompare(b.dir));
}

function docCandidates(pkg) {
  const nameBase = normalizePackageName(pkg.name);
  return sortedSet([
    `${pkg.dirBase}.md`,
    `${nameBase}.md`,
    `${nameBase.replace(/^wasm$/, 'compiler-wasm')}.md`,
  ]).map((file) => `docs/packages/${file}`);
}

function packageDocPath(root, pkg) {
  return docCandidates(pkg).find((candidate) => existsSync(join(root, candidate))) || null;
}

function docFiles(root) {
  const docsDir = join(root, 'docs', 'packages');
  if (!existsSync(docsDir)) return [];
  return readdirSync(docsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md') && !SKIP_DOCS.has(entry.name))
    .map((entry) => normalizeRepoPath(join('docs/packages', entry.name)))
    .sort();
}

function extractHeadings(markdown) {
  const headings = [];
  for (const match of markdown.matchAll(/^##\s+(.+?)\s*$/gmu)) {
    headings.push(match[1].trim());
  }
  return headings;
}

function h1(markdown) {
  return markdown.match(/^#\s+(.+?)\s*$/mu)?.[1]?.trim() || null;
}

function isMoldDoc(markdown) {
  return /^##\s+Package Surface\s*$/mu.test(markdown);
}

function findPackageForDoc(root, packages, docPath, markdown) {
  const byCandidate = packages.find((pkg) => packageDocPath(root, pkg) === docPath);
  if (byCandidate) return byCandidate;

  const title = h1(markdown);
  return packages.find((pkg) => pkg.name === title) || null;
}

function validateDoc({ root, pkg, docPath, markdown, indexText, governanceText }) {
  const errors = [];
  const warnings = [];
  const fileName = basename(docPath);
  const headings = new Set(extractHeadings(markdown));
  const title = h1(markdown);

  if (title !== pkg.name) {
    errors.push(`H1 should be "# ${pkg.name}"`);
  }

  for (const section of REQUIRED_SECTIONS) {
    if (!headings.has(section)) {
      errors.push(`missing "## ${section}" section`);
    }
  }

  if (!markdown.includes(pkg.name)) {
    errors.push(`doc does not mention package name ${pkg.name}`);
  }
  if (!/```[a-zA-Z]*[\s\S]*?corepack pnpm[\s\S]*?```/u.test(markdown)) {
    errors.push('Validation section should include a corepack pnpm command block');
  }
  if (!indexText.includes(`./${fileName}`) || !indexText.includes(pkg.name)) {
    errors.push(`docs/packages/index.md does not link ${fileName} with ${pkg.name}`);
  }
  if (!governanceText.includes(`\`${pkg.name}\``)) {
    errors.push(`docs/packages/governance.md has no row for ${pkg.name}`);
  }

  const canonicalDoc = packageDocPath(root, pkg);
  if (canonicalDoc && canonicalDoc !== docPath) {
    warnings.push(`canonical doc candidate is ${canonicalDoc}`);
  }

  return {
    ok: errors.length === 0,
    package: pkg.name,
    docPath,
    errors,
    warnings,
  };
}

function exportRows(manifest) {
  const rows = [];
  const exportsValue = manifest.exports;
  if (typeof exportsValue === 'string') {
    rows.push(['root export', 'Primary package entrypoint']);
  } else if (exportsValue && typeof exportsValue === 'object') {
    for (const key of Object.keys(exportsValue).sort()) {
      rows.push([key === '.' ? 'root export' : key, 'Package subpath export']);
    }
  }

  const bins = manifest.bin && typeof manifest.bin === 'object' ? manifest.bin : {};
  for (const key of Object.keys(bins).sort()) {
    rows.push([key, 'Command-line entrypoint']);
  }

  if (rows.length === 0) {
    rows.push(['root import', 'Primary package entrypoint']);
  }
  return rows;
}

function validationCommands(pkg) {
  const scripts = pkg.manifest.scripts || {};
  const commands = [];
  for (const name of ['build', 'test', 'typecheck', 'lint']) {
    if (scripts[name]) {
      commands.push(`corepack pnpm --filter ${pkg.name} run ${name}`);
    }
  }
  commands.push('corepack pnpm run check:publish-surface');
  commands.push('corepack pnpm run check:package-architecture');
  commands.push('corepack pnpm run package:opportunity-map');
  commands.push('corepack pnpm run check:package-doc-mold');
  return commands;
}

function emitMold(pkg) {
  const description = pkg.description || `${pkg.name} package surface.`;
  const rows = exportRows(pkg.manifest)
    .map(([surface, purpose]) => `| \`${surface}\` | ${purpose} |`)
    .join('\n');
  const commands = validationCommands(pkg).join('\n');
  const importName = pkg.manifest.type === 'module' ? 'surface' : 'surface';

  return `# ${pkg.name}

\`${pkg.name}\` is ${description}

## Install

\`\`\`bash
npm install ${pkg.name}
\`\`\`

## Use

\`\`\`ts
import { ${importName} } from '${pkg.name}';
\`\`\`

## Package Surface

| Surface | Purpose |
| ------- | ------- |
${rows}

## Strategy Role

This package is a supported package surface. Define whether it is core runtime,
fleet utility, Studio/editor tooling, domain plugin inventory, or service glue
before promoting it into a wider consumption lane.

## Validation

\`\`\`bash
${commands}
\`\`\`
`;
}

function check(root = ROOT) {
  const packages = readPackages(root);
  const indexText = readText(join(root, 'docs', 'packages', 'index.md'));
  const governanceText = readText(join(root, 'docs', 'packages', 'governance.md'));
  const docs = DOC_PATH ? [DOC_PATH] : docFiles(root);
  const results = [];
  const skipped = [];

  for (const docPath of docs) {
    const fullPath = join(root, docPath);
    const markdown = readText(fullPath);
    if (!markdown) {
      results.push({
        ok: false,
        package: null,
        docPath,
        errors: ['doc file is missing or empty'],
        warnings: [],
      });
      continue;
    }

    if (!isMoldDoc(markdown)) {
      skipped.push(docPath);
      continue;
    }

    const pkg = findPackageForDoc(root, packages, docPath, markdown);
    if (!pkg) {
      results.push({
        ok: false,
        package: h1(markdown),
        docPath,
        errors: ['could not match package doc to a package.json manifest'],
        warnings: [],
      });
      continue;
    }

    results.push(validateDoc({ root, pkg, docPath, markdown, indexText, governanceText }));
  }

  if (STRICT) {
    const covered = new Set(results.filter((item) => item.ok).map((item) => item.package));
    for (const pkg of packages.filter((item) => item.private !== true)) {
      if (!covered.has(pkg.name)) {
        results.push({
          ok: false,
          package: pkg.name,
          docPath: packageDocPath(root, pkg),
          errors: ['public package has not migrated into the package doc mold'],
          warnings: [],
        });
      }
    }
  }

  return {
    ok: results.every((item) => item.ok),
    checked: results.length,
    skipped: skipped.length,
    results,
    skipped,
  };
}

function printHuman(report) {
  if (report.ok) {
    console.log(
      `[package-doc-mold] PASS: ${report.checked} mold doc(s) checked, ${report.skipped.length} legacy doc(s) skipped.`
    );
  } else {
    console.error(
      `[package-doc-mold] FAIL: ${report.results.filter((item) => !item.ok).length} issue group(s).`
    );
  }

  for (const result of report.results) {
    if (result.ok) continue;
    console.error(`  - ${result.docPath || result.package || '<unknown>'}`);
    for (const error of result.errors) console.error(`    * ${error}`);
  }
  for (const result of report.results.filter((item) => item.warnings.length)) {
    console.warn(`  - ${result.docPath}`);
    for (const warning of result.warnings) console.warn(`    * WARN ${warning}`);
  }
}

function runSelfTest() {
  const root = mkdtempSync(join(tmpdir(), 'package-doc-mold-'));
  try {
    mkdirSync(join(root, 'packages', 'widget'), { recursive: true });
    mkdirSync(join(root, 'docs', 'packages'), { recursive: true });
    writeFileSync(
      join(root, 'packages', 'widget', 'package.json'),
      JSON.stringify(
        {
          name: '@holoscript/widget',
          description: 'the widget helper.',
          scripts: {
            build: 'tsup',
            test: 'vitest run',
          },
          exports: {
            '.': './src/index.ts',
            './extras': './src/extras.ts',
          },
        },
        null,
        2
      )
    );
    const doc = emitMold(readPackages(root)[0]);
    writeFileSync(join(root, 'docs', 'packages', 'widget.md'), doc);
    writeFileSync(
      join(root, 'docs', 'packages', 'index.md'),
      '| Package | Purpose |\n| --- | --- |\n| [**@holoscript/widget**](./widget.md) | Widget helper |\n'
    );
    writeFileSync(
      join(root, 'docs', 'packages', 'governance.md'),
      '| Package | Level | Owning Team |\n| --- | --- | --- |\n| `@holoscript/widget` | beta | Test Team |\n'
    );

    const passing = check(root);
    assert.equal(passing.ok, true);
    assert.equal(passing.checked, 1);
    assert.match(doc, /## Package Surface/u);
    assert.match(doc, /corepack pnpm --filter @holoscript\/widget run build/u);

    writeFileSync(
      join(root, 'docs', 'packages', 'widget.md'),
      doc.replace('\n## Strategy Role\n', '\n## Removed Role\n')
    );
    const failing = check(root);
    assert.equal(failing.ok, false);
    assert.match(failing.results[0].errors.join('\n'), /Strategy Role/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }

  console.log('[package-doc-mold] self-test PASS');
}

if (SELF_TEST) {
  runSelfTest();
} else if (EMIT) {
  if (!PACKAGE_NAME) {
    console.error('[package-doc-mold] --emit requires --package <package-name>');
    process.exit(2);
  }
  const pkg = readPackages(ROOT).find((item) => item.name === PACKAGE_NAME);
  if (!pkg) {
    console.error(`[package-doc-mold] package not found: ${PACKAGE_NAME}`);
    process.exit(2);
  }
  process.stdout.write(emitMold(pkg));
} else {
  const report = check();
  if (JSON_OUT) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHuman(report);
  }
  process.exit(report.ok ? 0 : 1);
}
