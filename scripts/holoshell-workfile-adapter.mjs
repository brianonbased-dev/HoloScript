#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const VERSION = '0.1.0';
const DEFAULT_DATE = new Date().toISOString().slice(0, 10);

function parseArgs(argv) {
  const args = {
    file: undefined,
    out: undefined,
    date: DEFAULT_DATE,
    selfTest: false,
    privacyClass: 'local-private',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--self-test') {
      args.selfTest = true;
    } else if (arg === '--file') {
      args.file = argv[++i];
    } else if (arg === '--out') {
      args.out = argv[++i];
    } else if (arg === '--date') {
      args.date = argv[++i];
    } else if (arg === '--privacy-class') {
      args.privacyClass = argv[++i];
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function printHelp() {
  process.stdout.write(`HoloShell work-file custody adapter ${VERSION}

Usage:
  node scripts/holoshell-workfile-adapter.mjs --file <path> [--out <receipt.json>]
  node scripts/holoshell-workfile-adapter.mjs --self-test

Options:
  --file <path>             Local docx/xlsx/xlsm/csv/pdf file to inspect.
  --out <receipt.json>      Output receipt path.
  --date <yyyy-mm-dd>       Bench-log date folder when --out is omitted.
  --privacy-class <class>   public | local-private | credential-adjacent | secret | unknown.
`);
}

function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function sha256Text(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function classifyKind(extension) {
  switch (extension.toLowerCase()) {
    case '.docx':
      return 'docx';
    case '.xlsx':
      return 'xlsx';
    case '.xlsm':
      return 'xlsm';
    case '.csv':
      return 'csv';
    case '.pdf':
      return 'pdf';
    default:
      return 'unknown';
  }
}

function listZipCentralDirectoryEntries(bytes) {
  const entries = [];
  let offset = 0;

  while (offset + 46 <= bytes.length) {
    const signature = bytes.readUInt32LE(offset);
    if (signature === 0x02014b50) {
      const nameLength = bytes.readUInt16LE(offset + 28);
      const extraLength = bytes.readUInt16LE(offset + 30);
      const commentLength = bytes.readUInt16LE(offset + 32);
      const nameStart = offset + 46;
      const nameEnd = nameStart + nameLength;
      if (nameEnd > bytes.length) break;
      entries.push(bytes.subarray(nameStart, nameEnd).toString('utf8'));
      offset = nameEnd + extraLength + commentLength;
      continue;
    }
    offset += 1;
  }

  return entries;
}

function summarizeCsv(bytes) {
  const sample = bytes.subarray(0, Math.min(bytes.length, 128 * 1024)).toString('utf8');
  const lines = sample.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const delimiter = [',', '\t', ';'].sort((a, b) => count(sample, b) - count(sample, a))[0] ?? ',';
  const firstRow = lines[0] ?? '';
  const columnCount = firstRow.length > 0 ? firstRow.split(delimiter).length : 0;
  const formulaLikeCells = lines
    .slice(0, 250)
    .flatMap((line) => line.split(delimiter))
    .filter((cell) => /^[=+\-@]/.test(cell.trim())).length;

  return {
    delimiter: delimiter === '\t' ? 'tab' : delimiter,
    sampledRows: lines.length,
    sampledColumns: columnCount,
    formulaLikeCells,
  };
}

function count(text, needle) {
  return text.split(needle).length - 1;
}

function inspectFeatures(kind, bytes) {
  const warnings = [];
  const detectedFeatures = [];
  const metadata = {};
  let supported = kind !== 'unknown';
  let parseStatus = supported ? 'pass' : 'skipped';

  if (kind === 'docx' || kind === 'xlsx' || kind === 'xlsm') {
    const entries = listZipCentralDirectoryEntries(bytes);
    metadata.zipEntries = entries.slice(0, 200);
    metadata.zipEntryCount = entries.length;

    if (entries.length === 0) {
      supported = false;
      parseStatus = 'fail';
      warnings.push({
        kind: 'parser-unavailable',
        severity: 'fail',
        message: 'Office file did not expose readable ZIP central-directory entries.',
      });
      return { supported, parseStatus, detectedFeatures, warnings, metadata };
    }

    detectedFeatures.push(`${kind}-zip-container`);
    if (entries.some((entry) => entry.startsWith('xl/worksheets/'))) {
      detectedFeatures.push('worksheets');
    }
    if (entries.includes('xl/calcChain.xml')) {
      detectedFeatures.push('formula-metadata');
      warnings.push({
        kind: 'formula-present',
        severity: 'info',
        message:
          'Workbook contains calculation metadata; HoloShell should preview cell-level diffs before export.',
        evidence: 'xl/calcChain.xml',
      });
    }
    if (entries.some((entry) => entry.includes('externalLinks/'))) {
      detectedFeatures.push('external-links');
      warnings.push({
        kind: 'external-link',
        severity: 'warn',
        message:
          'Workbook references external links; replay must preserve or explicitly sever link behavior.',
      });
    }
    if (entries.some((entry) => entry.endsWith('vbaProject.bin')) || kind === 'xlsm') {
      detectedFeatures.push('macros-or-vba-container');
      warnings.push({
        kind: 'macro-present',
        severity: 'warn',
        message: 'File may contain macros; policy should block macro execution during inspection.',
      });
    }
    if (kind === 'docx' && entries.includes('word/document.xml')) {
      detectedFeatures.push('document-body');
    }
    parseStatus = warnings.some((warning) => warning.severity !== 'info') ? 'warn' : 'pass';
  } else if (kind === 'csv') {
    const summary = summarizeCsv(bytes);
    metadata.csv = summary;
    detectedFeatures.push('delimited-text');
    if (summary.formulaLikeCells > 0) {
      warnings.push({
        kind: 'formula-present',
        severity: 'warn',
        message:
          'CSV contains formula-like cells; spreadsheet import should neutralize injection unless approved.',
      });
    }
    parseStatus = warnings.length > 0 ? 'warn' : 'pass';
  } else if (kind === 'pdf') {
    metadata.pdfMagic = bytes.subarray(0, 5).toString('utf8');
    detectedFeatures.push(metadata.pdfMagic === '%PDF-' ? 'pdf-header' : 'pdf-like-file');
    if (metadata.pdfMagic !== '%PDF-') {
      supported = false;
      parseStatus = 'fail';
      warnings.push({
        kind: 'unsupported-format',
        severity: 'fail',
        message: 'File extension is PDF but header does not match %PDF-.',
      });
    }
  } else {
    warnings.push({
      kind: 'unsupported-format',
      severity: 'fail',
      message: 'Unsupported work-file extension for deterministic native inspection.',
    });
  }

  return { supported, parseStatus, detectedFeatures, warnings, metadata };
}

function makeReceipt(filePath, options = {}) {
  const absolutePath = isAbsolute(filePath) ? filePath : resolve(filePath);
  if (!existsSync(absolutePath)) {
    throw new Error(`File does not exist: ${absolutePath}`);
  }

  const startedAt = new Date().toISOString();
  const bytes = readFileSync(absolutePath);
  const endedAt = new Date().toISOString();
  const stats = statSync(absolutePath);
  const extension = extname(absolutePath).toLowerCase();
  const kind = classifyKind(extension);
  const sourceHash = sha256Bytes(bytes);
  const pathHash = sha256Text(absolutePath);
  const redactedPath = basename(absolutePath);
  const inspection = inspectFeatures(kind, bytes);
  const previewHash = sha256Text(
    JSON.stringify({
      sourceHash,
      kind,
      detectedFeatures: inspection.detectedFeatures,
      warnings: inspection.warnings,
      metadata: inspection.metadata,
    })
  );

  const receiptWithoutHash = {
    id: `workfile_custody_${sourceHash.slice(0, 12)}`,
    workflow: options.workflow ?? 'holoshell-workfile-custody',
    startedAt,
    endedAt,
    snapshot: {
      redactedPath,
      pathHash,
      basename: redactedPath,
      extension,
      kind,
      sizeBytes: stats.size,
      sourceHash,
      sourceHashAlgorithm: 'sha256',
      capturedAt: startedAt,
      privacyClass: options.privacyClass ?? 'local-private',
      sourceMutated: false,
    },
    parser: {
      adapter: 'native-parser',
      parserName: 'holoshell-workfile-adapter',
      parserVersion: VERSION,
      parseStatus: inspection.parseStatus,
      supported: inspection.supported,
      detectedFeatures: inspection.detectedFeatures,
      warnings: inspection.warnings,
    },
    preview: {
      previewId: `preview_${previewHash.slice(0, 12)}`,
      previewKind: kind === 'xlsx' || kind === 'xlsm' ? 'cell-diff' : 'summary',
      sourceHash,
      previewHash,
      outputKind: 'json',
      requiresApproval: true,
    },
    sourceMutated: false,
    approvalRequired: true,
    replayKey: `sha256:${sourceHash}:preview:${previewHash}`,
    outcome:
      inspection.parseStatus === 'fail'
        ? 'fail'
        : inspection.parseStatus === 'warn'
          ? 'warn'
          : 'pass',
    hashAlgorithm: 'sha256',
    provenance: ['scripts/holoshell-workfile-adapter.mjs'],
    verificationCommands: ['node scripts/holoshell-workfile-adapter.mjs --self-test'],
    metadata: {
      adapterVersion: VERSION,
      sourceStatMtimeMs: stats.mtimeMs,
      sourceStatSizeBytes: stats.size,
      sourceReadOnlyMutationPolicy: 'never-write-input',
      ...inspection.metadata,
    },
  };

  return {
    ...receiptWithoutHash,
    hash: sha256Text(JSON.stringify(receiptWithoutHash)),
  };
}

function defaultOutputPath(date) {
  return join(
    '.bench-logs',
    'holoshell-human-os-frontier',
    date,
    'workfile-custody-adapter-receipt.json'
  );
}

function writeReceipt(receipt, outPath) {
  const absoluteOutPath = resolve(outPath);
  mkdirSync(dirname(absoluteOutPath), { recursive: true });
  writeFileSync(absoluteOutPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  return absoluteOutPath;
}

function runSelfTest() {
  const fixtureDir = join(tmpdir(), 'holoshell-workfile-adapter-self-test');
  mkdirSync(fixtureDir, { recursive: true });
  const fixture = join(fixtureDir, 'sample.csv');
  writeFileSync(fixture, 'name,total\nalpha,10\nbeta,=SUM(1,2)\n', 'utf8');
  const receipt = makeReceipt(fixture, { privacyClass: 'local-private' });
  const errors = [];
  if (receipt.snapshot.sourceMutated !== false || receipt.sourceMutated !== false) {
    errors.push('self-test expected sourceMutated=false');
  }
  if (receipt.snapshot.kind !== 'csv') {
    errors.push(`self-test expected csv kind, got ${receipt.snapshot.kind}`);
  }
  if (receipt.parser.parseStatus !== 'warn') {
    errors.push(
      `self-test expected warning for formula-like CSV cell, got ${receipt.parser.parseStatus}`
    );
  }
  if (errors.length > 0) {
    throw new Error(errors.join('; '));
  }
  process.stdout.write(`${JSON.stringify({ ok: true, receipt }, null, 2)}\n`);
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.selfTest) {
    runSelfTest();
  } else {
    if (!args.file) {
      throw new Error('--file is required unless --self-test is used.');
    }
    const receipt = makeReceipt(args.file, { privacyClass: args.privacyClass });
    const outPath = args.out ?? defaultOutputPath(args.date);
    const written = writeReceipt(receipt, outPath);
    process.stdout.write(
      `${JSON.stringify({ ok: true, out: written, receiptId: receipt.id }, null, 2)}\n`
    );
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ ok: false, error: message }, null, 2)}\n`);
  process.exit(1);
}
