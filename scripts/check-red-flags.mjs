import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const maxPerCategory = Number.parseInt(readArg('--max') ?? '8', 10);
const json = process.argv.includes('--json');
const failOn = readArg('--fail-on');

const severityRank = {
  critical: 0,
  serious: 1,
  warning: 2,
  info: 3,
};

const excludedDirNames = new Set([
  '.git',
  '.next',
  '.turbo',
  'archive',
  'coverage',
  'dist',
  'node_modules',
  'out',
]);
const excludedPaths = new Set(['docs/archive', 'docs/.vitepress/cache']);
const sourceCodeExtensions = new Set(['.cjs', '.js', '.jsx', '.mjs', '.ts', '.tsx']);

const textExtensions = new Set([
  '.cjs',
  '.css',
  '.holo',
  '.hs',
  '.hsplus',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mdx',
  '.mjs',
  '.rs',
  '.sql',
  '.toml',
  '.ts',
  '.tsx',
  '.yaml',
  '.yml',
]);

const sourceRoots = ['docs', 'packages', 'scripts', 'services'];
const findings = [];

for (const sourceRoot of sourceRoots) {
  walk(path.join(root, sourceRoot), scanFile);
}

scanDirectoryEntrypoints();
scanUppercaseGuideNames();

findings.sort((a, b) => {
  const severityDelta = severityRank[a.severity] - severityRank[b.severity];
  if (severityDelta !== 0) return severityDelta;
  const categoryDelta = a.category.localeCompare(b.category);
  if (categoryDelta !== 0) return categoryDelta;
  const fileDelta = a.file.localeCompare(b.file);
  if (fileDelta !== 0) return fileDelta;
  return a.line - b.line;
});

const summary = summarize(findings);

if (json) {
  console.log(JSON.stringify({ summary, findings }, null, 2));
} else {
  printReport(summary, findings);
}

if (failOn && shouldFail(summary, failOn)) {
  process.exit(1);
}

function readArg(name) {
  const prefix = `${name}=`;
  const arg = process.argv.find((item) => item.startsWith(prefix));
  return arg?.slice(prefix.length);
}

function toRelative(filePath) {
  return path.relative(root, filePath).replaceAll(path.sep, '/');
}

function isExcludedDir(relativePath) {
  const normalized = relativePath.replaceAll(path.sep, '/');
  if ([...excludedPaths].some((dir) => normalized === dir || normalized.startsWith(`${dir}/`))) {
    return true;
  }
  return normalized.split('/').some((segment) => excludedDirNames.has(segment));
}

function walk(dir, onFile) {
  if (!fs.existsSync(dir)) return;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = toRelative(fullPath);

    if (entry.isDirectory()) {
      if (!isExcludedDir(relativePath)) walk(fullPath, onFile);
      continue;
    }

    if (entry.isFile()) onFile(fullPath);
  }
}

function scanFile(filePath) {
  const extension = path.extname(filePath);
  if (!textExtensions.has(extension)) return;

  const stat = fs.statSync(filePath);
  if (stat.size > 1_000_000) return;

  const relativePath = toRelative(filePath);
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const sourceCodeFile = sourceCodeExtensions.has(extension);
  const archivedDocInActivePath = isActiveDoc(relativePath) && /\bARCHIVED\b|historical archive/i.test(content.slice(0, 600));

  if (archivedDocInActivePath) {
    add(
      'warning',
      'archived-doc-active-path',
      relativePath,
      1,
      'Document says it is archived but still lives under an active docs path.',
      lines[0] ?? '',
    );
  }

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const testFile = /(?:^|\/)(?:__tests__|test|tests)\//.test(relativePath) || /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(relativePath);

    if (sourceCodeFile && /@ts-ignore\s*-\s*Automatic remediation/i.test(line)) {
      add('critical', 'automatic-remediation', relativePath, lineNumber, 'TypeScript error was suppressed by an automatic remediation comment.', line);
      return;
    }

    if (sourceCodeFile && /\b(?:it|test|describe)\.only\s*\(/.test(line)) {
      add('critical', 'focused-test', relativePath, lineNumber, 'Focused test would hide the rest of the suite.', line);
    }

    if (sourceCodeFile && /\b(?:it|test|describe)\.skip\s*\(/.test(line)) {
      add('serious', 'skipped-test', relativePath, lineNumber, 'Skipped test can mask a broken behavior contract.', line);
    }

    if (sourceCodeFile && /(?:@ts-ignore|@ts-expect-error|eslint-disable|as\s+unknown\s+as|as\s+any\b)/.test(line)) {
      add(testFile ? 'warning' : 'serious', 'type-suppression', relativePath, lineNumber, 'Type or lint suppression weakens the source contract.', line);
    }

    const marker = line.match(/\b(FIXME|TODO|HACK|XXX)\b(?::|\s|-)?\s*(.*)/);
    if (marker) {
      const severity = marker[1] === 'FIXME' ? 'serious' : 'warning';
      add(severity, 'work-marker', relativePath, lineNumber, `${marker[1]} marker: ${marker[2].trim() || 'no detail provided'}`, line);
    }

    if (isActiveDoc(relativePath) && !archivedDocInActivePath && !isMetricsPatternDoc(relativePath) && /(?:\b(?:1,800|2,000|3,300)\+\s*(?:named\s*)?traits?|\b(?:25|30|45)\+\s*(?:compiler\s*|compile\s*)?targets?|\b(?:60|103)\+\s*(?:packages|tools?)|\b\d{1,3},\d{3}\+\s*tests?)/i.test(line)) {
      add('serious', 'hardcoded-live-count', relativePath, lineNumber, 'Active docs should cite docs/NUMBERS.md instead of hardcoding mutable counts.', line);
    }
  });
}

function scanDirectoryEntrypoints() {
  const directories = [
    ...listChildren('docs', 'doc-directory'),
    ...listChildren('packages', 'package-directory'),
    ...listChildren('services', 'service-directory'),
  ];

  for (const item of directories) {
    const candidates =
      item.kind === 'doc-directory'
        ? ['README.md', 'index.md']
        : ['README.md', 'package.json'];
    const hasEntrypoint = candidates.some((candidate) => fs.existsSync(path.join(root, item.path, candidate)));
    if (!hasEntrypoint) {
      add(
        'warning',
        'missing-entrypoint',
        item.path,
        1,
        `Directory lacks an AI-readable entrypoint (${candidates.join(' or ')}).`,
        item.path,
      );
    }
  }
}

function scanUppercaseGuideNames() {
  const guidesDir = path.join(root, 'docs', 'guides');
  if (!fs.existsSync(guidesDir)) return;

  for (const entry of fs.readdirSync(guidesDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    if (/[A-Z]/.test(entry.name)) {
      add(
        'warning',
        'uppercase-active-guide',
        `docs/guides/${entry.name}`,
        1,
        'Active guide filename is uppercase; AI-first docs prefer lowercase stable routes unless explicitly legacy.',
        entry.name,
      );
    }
  }
}

function listChildren(relativeRoot, kind) {
  const fullRoot = path.join(root, relativeRoot);
  if (!fs.existsSync(fullRoot)) return [];

  return fs
    .readdirSync(fullRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `${relativeRoot}/${entry.name}`)
    .filter((relativePath) => !path.basename(relativePath).startsWith('.'))
    .filter((relativePath) => !isExcludedDir(relativePath))
    .map((relativePath) => ({ path: relativePath, kind }));
}

function isActiveDoc(relativePath) {
  return relativePath.startsWith('docs/') && !relativePath.startsWith('docs/archive/');
}

function isMetricsPatternDoc(relativePath) {
  return relativePath === 'docs/NUMBERS.md' || relativePath === 'docs/guides/metrics-ssot.md';
}

function add(severity, category, file, line, message, evidence) {
  findings.push({
    severity,
    category,
    file,
    line,
    message,
    evidence: evidence.trim().slice(0, 220),
  });
}

function summarize(items) {
  const bySeverity = { critical: 0, serious: 0, warning: 0, info: 0 };
  const byCategory = {};

  for (const item of items) {
    bySeverity[item.severity] += 1;
    byCategory[item.category] = (byCategory[item.category] ?? 0) + 1;
  }

  return {
    total: items.length,
    bySeverity,
    byCategory,
  };
}

function printReport(report, items) {
  console.log('Red Flag Audit');
  console.log('==============');
  console.log(
    `Total: ${report.total} | critical: ${report.bySeverity.critical} | serious: ${report.bySeverity.serious} | warning: ${report.bySeverity.warning}`,
  );
  console.log('');

  const categories = Object.keys(report.byCategory).sort((a, b) => report.byCategory[b] - report.byCategory[a]);
  for (const category of categories) {
    const categoryItems = items.filter((item) => item.category === category);
    console.log(`${category.toUpperCase()} (${categoryItems.length})`);
    for (const item of categoryItems.slice(0, maxPerCategory)) {
      console.log(`  [${item.severity}] ${item.file}:${item.line} - ${item.message}`);
    }
    if (categoryItems.length > maxPerCategory) {
      console.log(`  ... ${categoryItems.length - maxPerCategory} more`);
    }
    console.log('');
  }

  console.log('Use --json for machine-readable output. Use --fail-on=critical or --fail-on=serious to gate.');
}

function shouldFail(report, level) {
  if (level === 'critical') return report.bySeverity.critical > 0;
  if (level === 'serious') return report.bySeverity.critical + report.bySeverity.serious > 0;
  if (level === 'warning') return report.bySeverity.critical + report.bySeverity.serious + report.bySeverity.warning > 0;
  throw new Error(`Unknown --fail-on level: ${level}`);
}
