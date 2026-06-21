#!/usr/bin/env node
/**
 * check-trait-test-tautologies.mjs
 *
 * HoloCI canary for trait-handler tests that would pass under an echo mutant:
 * a handler can simply mirror a field from the input event and the test still
 * "proves" the mirrored value. The NavmeshSolverTrait polygonCount regression
 * was this shape.
 *
 * This is intentionally high-confidence, not a broad lint. It only fails when
 * an emitted/result field assertion matches the same field and same value fed
 * into a typed trait event in the same test block. Lower-confidence matches are
 * printed as ranked candidates when present.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const DEFAULT_TRAIT_ROOTS = [
  'packages/core/src/traits',
  'packages/core/src/__tests__/traits',
  'packages/engine/src/traits',
  'packages/runtime/src/traits',
  'packages/marketplace-api/src/traits',
];

const OUTPUT_SUBJECT_HINTS = [
  'getLastEvent',
  'lastEmit',
  'emit.mock',
  'mock.calls',
  'emitted',
  'toHaveBeenCalledWith',
];

const METADATA_ECHO_FIELDS = new Set([
  'queryId',
  'requestId',
  'correlationId',
  'prompt',
  'status',
  'value',
  'id',
  'url',
  'provider',
  'model',
  'capability',
  'region',
  'password',
  'enabled',
]);

const VALUE_TOKEN =
  /(['"][^'"]*['"]|-?\d+(?:\.\d+)?|true|false|null|undefined|[A-Za-z_$][\w$]*)/;

function readArg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

const ROOT = resolve(readArg('--root', process.env.HOLO_ROOT ?? process.cwd()));
const FAIL_SCORE = Number.parseInt(readArg('--fail-score', '90'), 10);
const FIND_SCORE = Number.parseInt(readArg('--find-score', '75'), 10);
const MAX_FINDINGS = Number.parseInt(readArg('--max-findings', '40'), 10);
const JSON_MODE = hasFlag('--json');

const rootsArg = readArg('--roots', '');
const TRAIT_ROOTS = (rootsArg ? rootsArg.split(',') : DEFAULT_TRAIT_ROOTS)
  .map((entry) => entry.trim())
  .filter(Boolean);

const filesArg = readArg('--files', '');
const EXPLICIT_FILES = filesArg
  ? filesArg
      .split(/[,\n]/)
      .map((entry) => entry.trim())
      .filter(Boolean)
  : null;

function toPosix(path) {
  return path.split(sep).join('/');
}

function isTraitTestFile(path) {
  const posix = toPosix(path);
  return (
    /\.(test|spec)\.tsx?$/.test(posix) &&
    (posix.includes('/traits/') ||
      posix.includes('/src/traits/') ||
      posix.includes('/src/__tests__/traits/'))
  );
}

function walk(dir, output) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (
        entry.name === 'node_modules' ||
        entry.name === 'dist' ||
        entry.name === 'build' ||
        entry.name === '.next'
      ) {
        continue;
      }
      walk(full, output);
    } else if (entry.isFile() && isTraitTestFile(full)) {
      output.push(full);
    }
  }
}

function discoverFiles() {
  if (EXPLICIT_FILES) {
    return EXPLICIT_FILES.map((file) => resolve(ROOT, file)).filter((file) => existsSync(file));
  }

  const files = [];
  for (const root of TRAIT_ROOTS) {
    const abs = resolve(ROOT, root);
    if (existsSync(abs)) {
      walk(abs, files);
    }
  }
  return [...new Set(files)].sort();
}

function lineNumber(source, index) {
  return source.slice(0, index).split('\n').length;
}

function findClosing(source, openIndex, openChar, closeChar) {
  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '/' && next === '/') {
      const newline = source.indexOf('\n', index + 2);
      index = newline === -1 ? source.length : newline;
      continue;
    }
    if (char === '/' && next === '*') {
      const end = source.indexOf('*/', index + 2);
      index = end === -1 ? source.length : end + 1;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === openChar) {
      depth += 1;
    } else if (char === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function findTestBlocks(source) {
  const blocks = [];
  const testCall = /\b(?:it|test)\s*(?:\.\w+)?\s*\(\s*(['"`])/g;
  let match;

  while ((match = testCall.exec(source))) {
    const quote = match[1];
    const titleStart = testCall.lastIndex;
    let titleEnd = titleStart;
    let escaped = false;

    for (; titleEnd < source.length; titleEnd += 1) {
      const char = source[titleEnd];
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        break;
      }
    }

    const title = source.slice(titleStart, titleEnd).replace(/\s+/g, ' ').trim();
    const searchFrom = titleEnd + 1;
    const arrow = source.indexOf('=>', searchFrom);
    const func = source.indexOf('function', searchFrom);
    const bodyAnchor =
      arrow === -1 ? func : func === -1 ? arrow : Math.min(arrow, func);
    if (bodyAnchor === -1 || bodyAnchor - searchFrom > 2000) {
      continue;
    }

    const bodyStart = source.indexOf('{', bodyAnchor);
    if (bodyStart === -1) {
      continue;
    }
    const bodyEnd = findClosing(source, bodyStart, '{', '}');
    if (bodyEnd === -1) {
      continue;
    }

    blocks.push({
      title,
      body: source.slice(bodyStart + 1, bodyEnd),
      start: bodyStart + 1,
    });
    testCall.lastIndex = bodyEnd + 1;
  }

  return blocks;
}

function normalizeValue(raw) {
  const value = raw.trim();
  if (
    (value.startsWith("'") && value.endsWith("'")) ||
    (value.startsWith('"') && value.endsWith('"'))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function extractProps(objectText) {
  const props = [];
  const propPattern = new RegExp(
    String.raw`\b([A-Za-z_$][\w$]*)\s*:\s*${VALUE_TOKEN.source}`,
    'g'
  );
  let match;
  while ((match = propPattern.exec(objectText))) {
    const key = match[1];
    if (key === 'type' || key === 'op' || key === 'id' || key === 'name') {
      continue;
    }
    props.push({
      key,
      value: normalizeValue(match[2]),
      raw: match[2],
    });
  }
  return props;
}

function extractEventObjects(block) {
  const events = [];
  for (let index = 0; index < block.body.length; index += 1) {
    if (block.body[index] !== '{') {
      continue;
    }
    const before = block.body.slice(Math.max(0, index - 80), index);
    if (/objectContaining|toMatchObject|expect\s*\(/.test(before)) {
      continue;
    }

    const close = findClosing(block.body, index, '{', '}');
    if (close === -1) {
      continue;
    }
    const objectText = block.body.slice(index, close + 1);
    if (objectText.length > 1200 || !/\btype\s*:/.test(objectText)) {
      continue;
    }

    const props = extractProps(objectText);
    if (props.length > 0) {
      events.push({
        lineOffset: lineNumber(block.body, index),
        nonTypePropCount: props.length,
        props,
      });
    }
    index = close;
  }
  return events;
}

function firstMatcherArg(source, openParen) {
  const close = findClosing(source, openParen, '(', ')');
  if (close === -1) {
    return null;
  }
  return {
    text: source.slice(openParen + 1, close).trim(),
    end: close,
  };
}

function lastPropertyAccess(expression) {
  let field = null;
  for (const match of expression.matchAll(/(?:\?\.|\.)\s*([A-Za-z_$][\w$]*)/g)) {
    field = match[1];
  }
  return field;
}

function extractOutputAliases(block) {
  const aliases = new Set();
  const aliasPattern = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([^;\n]+)/g;
  let match;
  while ((match = aliasPattern.exec(block.body))) {
    if (OUTPUT_SUBJECT_HINTS.some((hint) => match[2].includes(hint))) {
      aliases.add(match[1]);
    }
  }
  return aliases;
}

function subjectLooksLikeOutput(expression, aliases = new Set()) {
  if (OUTPUT_SUBJECT_HINTS.some((hint) => expression.includes(hint))) {
    return true;
  }
  for (const alias of aliases) {
    if (new RegExp(String.raw`(^|[^A-Za-z_$\w])${alias}\s*(?:\.|\?\.)`).test(expression)) {
      return true;
    }
  }
  return false;
}

function extractExpectedProps(matcherText) {
  const props = [];
  const objectPattern = /\{[\s\S]*?\}/g;
  let objectMatch;
  while ((objectMatch = objectPattern.exec(matcherText))) {
    for (const prop of extractProps(objectMatch[0])) {
      props.push(prop);
    }
  }
  return props;
}

function extractAssertions(block) {
  const assertions = [];
  const outputAliases = extractOutputAliases(block);
  let index = 0;

  while (index < block.body.length) {
    const expectIndex = block.body.indexOf('expect', index);
    if (expectIndex === -1) {
      break;
    }
    const open = block.body.indexOf('(', expectIndex);
    if (open === -1) {
      break;
    }
    const subject = firstMatcherArg(block.body, open);
    if (!subject) {
      index = open + 1;
      continue;
    }

    const afterSubject = block.body.slice(subject.end + 1, subject.end + 80);
    const matcher = afterSubject.match(
      /^\s*\.\s*(toBe|toEqual|toStrictEqual|toMatchObject|toHaveBeenCalledWith)\s*\(/
    );
    if (!matcher) {
      index = subject.end + 1;
      continue;
    }

    const matcherName = matcher[1];
    const matcherOpen = subject.end + 1 + matcher[0].lastIndexOf('(');
    const matcherArg = firstMatcherArg(block.body, matcherOpen);
    if (!matcherArg) {
      index = subject.end + 1;
      continue;
    }

    const lineOffset = lineNumber(block.body, expectIndex);
    if (matcherName === 'toBe' || matcherName === 'toEqual' || matcherName === 'toStrictEqual') {
      const expected = matcherArg.text.match(new RegExp(`^${VALUE_TOKEN.source}$`));
      const field = lastPropertyAccess(subject.text);
      if (expected && field && subjectLooksLikeOutput(subject.text, outputAliases)) {
        assertions.push({
          field,
          value: normalizeValue(expected[1]),
          lineOffset,
          matcher: matcherName,
          subject: subject.text,
        });
      }
    } else {
      const subjectIsOutput =
        subjectLooksLikeOutput(subject.text, outputAliases) || matcherName === 'toHaveBeenCalledWith';
      if (subjectIsOutput) {
        for (const prop of extractExpectedProps(matcherArg.text)) {
          assertions.push({
            field: prop.key,
            value: prop.value,
            lineOffset,
            matcher: matcherName,
            subject: subject.text,
          });
        }
      }
    }

    index = matcherArg.end + 1;
  }

  return assertions;
}

function scoreFinding({ block, event, assertion }) {
  let score = 40;
  if (event.nonTypePropCount <= 1) {
    score += 20;
  } else if (event.nonTypePropCount <= 2) {
    score += 10;
  }

  const assertionCount = (block.body.match(/\bexpect\s*\(/g) ?? []).length;
  if (assertionCount <= 2) {
    score += 10;
  }

  if (/^polygonCount$/i.test(assertion.field)) {
    score += 20;
  } else if (/count$/i.test(assertion.field)) {
    score += 5;
  }

  if (/tautolog|echo|fed|mirror|same input|same value/i.test(`${block.title}\n${block.body}`)) {
    score += 25;
  }

  if (METADATA_ECHO_FIELDS.has(assertion.field)) {
    score -= 25;
  }

  if (/snapshot|query|response|status|info|stores input|updates prompt|sets /i.test(block.title)) {
    score -= 15;
  }

  return Math.max(0, Math.min(score, 100));
}

function analyzeFile(file) {
  const source = readFileSync(file, 'utf8');
  const blocks = findTestBlocks(source);
  const findings = [];

  for (const block of blocks) {
    const events = extractEventObjects(block);
    if (events.length === 0) {
      continue;
    }

    const assertions = extractAssertions(block);
    for (const assertion of assertions) {
      const event = events.find((candidate) =>
        candidate.props.some(
          (prop) => prop.key === assertion.field && prop.value === assertion.value
        )
      );
      if (!event) {
        continue;
      }

      const score = scoreFinding({ block, event, assertion });
      if (score >= FIND_SCORE) {
        findings.push({
          file: toPosix(relative(ROOT, file)),
          line: lineNumber(
            source,
            block.start + block.body.split('\n').slice(0, assertion.lineOffset - 1).join('\n').length
          ),
          assertionLine: lineNumber(
            source,
            block.start + block.body.split('\n').slice(0, assertion.lineOffset - 1).join('\n').length
          ),
          test: block.title,
          field: assertion.field,
          value: assertion.value,
          score,
          bucket: score >= FAIL_SCORE ? 'TAUTOLOGY' : 'CANDIDATE',
          reason:
            'output assertion matches the same field/value fed into a typed trait event; an echo mutant would satisfy it',
        });
      }
    }
  }

  return {
    tests: blocks.length,
    findings,
  };
}

const files = discoverFiles();
const allFindings = [];
let testsScanned = 0;

for (const file of files) {
  const result = analyzeFile(file);
  testsScanned += result.tests;
  allFindings.push(...result.findings);
}

allFindings.sort((a, b) => b.score - a.score || a.file.localeCompare(b.file) || a.line - b.line);
const tautologies = allFindings.filter((finding) => finding.bucket === 'TAUTOLOGY');

const report = {
  ok: tautologies.length === 0,
  root: ROOT,
  filesScanned: files.length,
  testsScanned,
  failScore: FAIL_SCORE,
  findScore: FIND_SCORE,
  tautologies: tautologies.length,
  candidates: allFindings.length,
  findings: allFindings.slice(0, MAX_FINDINGS),
};

if (JSON_MODE) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  console.log(
    `[trait-tautology] scanned ${files.length} trait test file(s), ${testsScanned} test block(s)`
  );
  console.log(
    `[trait-tautology] TAUTOLOGY bucket: ${tautologies.length}; ranked candidates: ${allFindings.length}`
  );

  for (const finding of allFindings.slice(0, MAX_FINDINGS)) {
    console.log(
      `[trait-tautology] ${finding.bucket} score=${finding.score} ` +
        `${finding.file}:${finding.assertionLine} field=${finding.field} value=${finding.value} ` +
        `test="${finding.test}"`
    );
  }

  if (tautologies.length > 0) {
    console.error(
      '[trait-tautology] FAIL: replace echo assertions with derived-output checks ' +
        '(for example: graph nodes, reachability, path length, emitted error shape, or state transition).'
    );
  } else {
    console.log('[trait-tautology] PASS: no high-confidence echo-survivor trait tests found');
  }
}

process.exit(tautologies.length > 0 ? 1 : 0);
