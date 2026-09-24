import { describe, it, expect, afterEach } from 'vitest';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import {
  emitGeneratedSet,
  formatGenerated,
  GeneratedOutputUnformattableError,
} from '../../../scripts/lib/format-generated';

// The generators' shared formatting and writing step. Everything here runs real
// prettier: claude3-x402's review of #316 showed a stand-in formatter let a helper
// that drops the repo config, formats as the wrong file type, or swallows one file
// type's errors pass every test.
const SCRIPTS = resolve(dirname(fileURLToPath(import.meta.url)), '../../../scripts');
const HELPER = resolve(SCRIPTS, 'lib', 'format-generated.ts');
const GENERATORS = [
  'compile-view-registry.ts',
  'compile-holo-pages.ts',
  'compile-vector-pages.mts',
];
// A path inside the studio, so prettier resolves the repo's config for it. Never written.
const IN_STUDIO = (ext: string) => resolve(SCRIPTS, `__format_probe__${ext}`);

const tempDirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'format-generated-'));
  tempDirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('formatGenerated: real prettier, the repo config, the right parser', () => {
  it("applies the repo's prettier config for the target's path", async () => {
    // Prettier's default is double quotes; the repo's .prettierrc says singleQuote.
    expect(await formatGenerated(IN_STUDIO('.ts'), 'const a = "x"')).toBe("const a = 'x';\n");
  });

  it('parses by the target file type: an angle-bracket cast only as .ts, JSX only as .tsx', async () => {
    expect(await formatGenerated(IN_STUDIO('.ts'), 'const a = <string>b;')).toBe(
      'const a = <string>b;\n'
    );
    expect(await formatGenerated(IN_STUDIO('.tsx'), 'export const A = () => <div   />;')).toBe(
      'export const A = () => <div />;\n'
    );
    await expect(formatGenerated(IN_STUDIO('.tsx'), 'const a = <string>b;')).rejects.toBeInstanceOf(
      GeneratedOutputUnformattableError
    );
    await expect(
      formatGenerated(IN_STUDIO('.ts'), 'export const A = () => <div   />;')
    ).rejects.toBeInstanceOf(GeneratedOutputUnformattableError);
  });

  it.each([
    ['.ts', 'export const = ;'],
    ['.tsx', 'export default () => <div>;'],
  ])(
    "refuses %s output prettier cannot parse, naming the file and prettier's reason",
    async (ext, code) => {
      const target = IN_STUDIO(ext);
      const error = await formatGenerated(target, code).then(
        () => null,
        (caught: unknown) => caught
      );
      expect(error).toBeInstanceOf(GeneratedOutputUnformattableError);
      const refusal = error as GeneratedOutputUnformattableError;
      expect(refusal.target).toBe(target);
      // The cause is prettier's own SyntaxError, and its reason is in the message.
      expect(refusal.cause).toBeInstanceOf(SyntaxError);
      const reason = (refusal.cause as Error).message.split('\n')[0];
      expect(refusal.message).toContain(`generated output for ${target} could not be formatted`);
      expect(refusal.message).toContain(reason);
    }
  );
});

describe('emitGeneratedSet: every member formatted before any file is written', () => {
  it('writes nothing when one member cannot be formatted, and says so', async () => {
    const dir = tempDir();
    const existing = join(dir, 'a.ts');
    writeFileSync(existing, 'the committed bytes\n', 'utf-8');
    const bad = join(dir, 'b.ts');
    const fresh = join(dir, 'nested', 'c.ts');

    const attempt = emitGeneratedSet(
      [
        { target: existing, code: 'export const a=1' },
        { target: bad, code: 'export const = ;' },
        { target: fresh, code: 'export const c=3' },
      ],
      { check: false }
    );

    await expect(attempt).rejects.toBeInstanceOf(GeneratedOutputUnformattableError);
    await expect(attempt).rejects.toMatchObject({ target: bad });
    await expect(attempt).rejects.toThrow(/Nothing was written: all 3 file\(s\)/u);
    expect(readFileSync(existing, 'utf-8')).toBe('the committed bytes\n');
    expect(existsSync(bad)).toBe(false);
    expect(existsSync(dirname(fresh))).toBe(false);
  });

  it('writes every member formatted, creating directories, when all of them format', async () => {
    const dir = tempDir();
    const a = join(dir, 'a.ts');
    const c = join(dir, 'nested', 'c.tsx');
    const drift = await emitGeneratedSet(
      [
        { target: a, code: 'export const a=1' },
        { target: c, code: 'export const C = () => <div   />' },
      ],
      { check: false }
    );
    expect(drift).toEqual([]);
    expect(readFileSync(a, 'utf-8')).toBe(await formatGenerated(a, 'export const a=1'));
    expect(readFileSync(c, 'utf-8')).toBe(
      await formatGenerated(c, 'export const C = () => <div   />')
    );
  });

  it('in check mode reports the members that differ or are missing, and writes nothing', async () => {
    const dir = tempDir();
    const same = join(dir, 'same.ts');
    const stale = join(dir, 'stale.ts');
    const missing = join(dir, 'missing.ts');
    writeFileSync(same, await formatGenerated(same, 'export const s=1'), 'utf-8');
    writeFileSync(stale, 'export const t = 0;\n', 'utf-8');

    const drift = await emitGeneratedSet(
      [
        { target: same, code: 'export const s=1' },
        { target: stale, code: 'export const t=2' },
        { target: missing, code: 'export const m=3' },
      ],
      { check: true }
    );

    expect(drift).toEqual([stale, missing]);
    expect(readFileSync(stale, 'utf-8')).toBe('export const t = 0;\n');
    expect(existsSync(missing)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// What the generators do with the refusal. These read the generators' syntax
// tree, not their text: the first version of this census matched four literal
// spellings, and 13 of claude3-x402's 23 mutations (a .catch(() => content), an
// empty catch, a renamed variable, a `??` fallback, a dynamic or double-quoted
// prettier import...) stayed green. It is still a reading of the source, not a
// run of the generators; running them with a planted fault takes a private copy
// of the tree, which is what that review did.
// ---------------------------------------------------------------------------

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
}

function visit(node: ts.Node, fn: (node: ts.Node) => void): void {
  fn(node);
  node.forEachChild((child) => visit(child, fn));
}

/** Every module a file loads: imports, re-exports, import() and require(). */
function loadedModules(source: ts.SourceFile): string[] {
  const found: string[] = [];
  visit(source, (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      found.push(node.moduleSpecifier.text);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      ts.isStringLiteralLike(node.moduleReference.expression)
    ) {
      found.push(node.moduleReference.expression.text);
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    ) {
      const [specifier] = node.arguments;
      // A computed specifier cannot be audited, so it counts against the file.
      found.push(specifier && ts.isStringLiteralLike(specifier) ? specifier.text : '<computed>');
    }
  });
  return found;
}

function scriptFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== 'node_modules') files.push(...scriptFiles(full));
    } else if (/\.[cm]?[jt]s$/u.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

function callsTo(source: ts.SourceFile, name: string): ts.CallExpression[] {
  const calls: ts.CallExpression[] = [];
  visit(source, (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === name
    ) {
      calls.push(node);
    }
  });
  return calls;
}

/** Inside a try block of the same function (a try around a callback does not catch its await). */
function insideTryBlock(node: ts.Node): boolean {
  for (
    let current = node;
    current.parent && !ts.isFunctionLike(current);
    current = current.parent
  ) {
    if (ts.isTryStatement(current.parent) && current.parent.tryBlock === current) return true;
  }
  return false;
}

/** The outermost node of `node` wrapped in parentheses, so `(x)` reads as `x`. */
function outward(node: ts.Node): ts.Node {
  let current = node;
  while (ts.isParenthesizedExpression(current.parent)) current = current.parent;
  return current;
}

/** The name of the function declaration a call sits in; null at the top level or in a callback. */
function enclosingFunction(node: ts.Node): string | null {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isFunctionDeclaration(current)) return current.name?.text ?? null;
    if (ts.isFunctionLike(current)) return null;
  }
  return null;
}

function failsTheProcess(handler: ts.Node | undefined): boolean {
  const text = handler?.getText() ?? '';
  return /process\.exitCode\s*=\s*1\b/u.test(text) || /process\.exit\(\s*1\s*\)/u.test(text);
}

const FALLBACK_OPERATORS = new Set([
  ts.SyntaxKind.QuestionQuestionToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.AmpersandAmpersandToken,
]);

/**
 * Why a rejection of this call might not reach the exit code, or null when it
 * does by construction: awaited outside any try, discarded with `void` (an
 * unhandled rejection ends the process), or run through a promise chain whose
 * .catch fails the process.
 */
function lostRejection(call: ts.CallExpression): string | null {
  const self = outward(call);
  const parent = self.parent;
  if (ts.isAwaitExpression(parent)) {
    const holder = outward(parent).parent;
    if (ts.isBinaryExpression(holder) && FALLBACK_OPERATORS.has(holder.operatorToken.kind)) {
      return `a fallback operand (${holder.operatorToken.getText()})`;
    }
    return insideTryBlock(parent) ? 'awaited inside a try block' : null;
  }
  if (ts.isVoidExpression(parent)) return null;
  let link: ts.Node = self;
  while (
    ts.isPropertyAccessExpression(link.parent) &&
    ts.isCallExpression(link.parent.parent) &&
    link.parent.parent.expression === link.parent
  ) {
    const method = link.parent.name.text;
    const chained = link.parent.parent;
    // .then(onFulfilled) and .finally() pass a rejection through; a second .then argument does not.
    if ((method === 'then' && chained.arguments.length < 2) || method === 'finally') {
      link = outward(chained);
      continue;
    }
    if (method === 'catch') {
      return failsTheProcess(chained.arguments[0])
        ? null
        : 'a .catch that does not fail the process';
    }
    return `a .${method}(...) that can absorb the rejection`;
  }
  return 'neither awaited nor chained to a .catch that fails the process';
}

const WRITE_APIS = new Set([
  'writeFileSync',
  'writeFile',
  'appendFileSync',
  'appendFile',
  'createWriteStream',
  'copyFileSync',
  'copyFile',
  'cpSync',
  'renameSync',
  'rename',
]);

describe('the generators emit only through emitGeneratedSet, and its refusal reaches the exit code', () => {
  it('no script under scripts/ loads prettier except the helper', () => {
    const files = scriptFiles(SCRIPTS);
    for (const name of GENERATORS) expect(files).toContain(resolve(SCRIPTS, name));
    // Positive control: the reader sees the helper's own prettier import.
    expect(loadedModules(parse(HELPER))).toContain('prettier');
    const offenders = files
      .filter((file) => file !== HELPER)
      .flatMap((file) =>
        loadedModules(parse(file))
          .filter((m) => m === 'prettier' || m.startsWith('prettier/') || m === '<computed>')
          .map((m) => `${relative(SCRIPTS, file)} loads ${m}`)
      );
    expect(offenders).toEqual([]);
  });

  it.each(GENERATORS)('%s: every path to emitGeneratedSet lets a refusal fail the run', (name) => {
    const source = parse(resolve(SCRIPTS, name));
    expect(loadedModules(source)).toContain('./lib/format-generated');
    const emits = callsTo(source, 'emitGeneratedSet');
    expect(emits.length).toBeGreaterThan(0);

    // From each emit, up through the functions that contain it, to the entry point.
    const problems: string[] = [];
    const queue = [...emits];
    const followed = new Set<string>();
    while (queue.length > 0) {
      const call = queue.shift()!;
      const why = lostRejection(call);
      if (why) {
        const { line } = source.getLineAndCharacterOfPosition(call.getStart());
        problems.push(`${name}:${line + 1} ${call.expression.getText()}(): ${why}`);
      }
      const container = enclosingFunction(call);
      if (container && !followed.has(container)) {
        followed.add(container);
        queue.push(...callsTo(source, container));
      }
    }
    expect(problems).toEqual([]);
  });

  it.each(GENERATORS)(
    '%s: writes no file except through the helper (the manifest aside)',
    (name) => {
      const source = parse(resolve(SCRIPTS, name));
      const writes: string[] = [];
      visit(source, (node) => {
        if (!ts.isCallExpression(node)) return;
        const callee = ts.isPropertyAccessExpression(node.expression)
          ? node.expression.name.text
          : ts.isIdentifier(node.expression)
            ? node.expression.text
            : '';
        if (!WRITE_APIS.has(callee)) return;
        const [first] = node.arguments;
        // compile-holo-pages.ts writes its manifest directly: JSON, not formatted source.
        if (
          callee === 'writeFileSync' &&
          first &&
          ts.isIdentifier(first) &&
          first.text === 'MANIFEST_PATH'
        ) {
          return;
        }
        writes.push(node.getText().split('\n')[0]);
      });
      expect(writes).toEqual([]);
    }
  );
});
