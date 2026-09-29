/**
 * Compiles and RUNS the Kotlin that `compile_to_kotlin` emits, on a real JVM.
 *
 * `packages/core/src/compiler/__tests__/RoutingLogic.parity.test.ts` says: "There is no JVM in CI, so
 * we cannot run the emitted Kotlin directly" and instead checks a JS transliteration of the routing
 * decision. That is a real gap: a JS transliteration can agree with itself forever while the actual
 * Kotlin the bridge emits fails to compile. This file closes the gap FOR MACHINES THAT HAVE A JVM (this
 * laptop does: a HoloScript-managed JDK 17, and Gradle's dependency cache already holds
 * kotlin-compiler-embeddable). CI has neither, so every test here is skipped cleanly - with a reason
 * printed once - when the toolchain is missing. See `describe.skipIf` below.
 *
 * ── Two classpaths, not one ─────────────────────────────────────────────────────────────────────
 * K2JVMCompiler is invoked directly here (`java -cp <X> org.jetbrains.kotlin.cli.jvm.K2JVMCompiler`),
 * bypassing the `kotlinc` launcher script that normally sets `-kotlin-home` and quietly supplies a
 * bundled kotlin-stdlib/kotlin-reflect from there. Without that script two DIFFERENT classpaths matter
 * and both need kotlin-stdlib present, for unrelated reasons:
 *   1. The classpath `java -cp` itself uses to find K2JVMCompiler's own implementation classes. This
 *      needs kotlin-stdlib too, because kotlin-compiler-embeddable is itself compiled Kotlin and its
 *      bytecode calls `kotlin.jvm.internal.Intrinsics` etc. at class-init time (confirmed by running it
 *      without stdlib here: `NoClassDefFoundError: kotlin/jvm/internal/Intrinsics`).
 *   2. The classpath passed as K2JVMCompiler's OWN `-cp` argument, which is what lets the CODE BEING
 *      COMPILED resolve `kotlin.Int`, `println`, etc. (confirmed by running it without this: "cannot
 *      access built-in declaration 'kotlin.Int'").
 * `buildKotlincClasspath()` below returns one jar list and this file passes it for both roles - simpler
 * than tracking two lists, and harmless since extra jars on the compiled-code classpath don't collide.
 *
 * ── Jars needed beyond the "obvious" ones ───────────────────────────────────────────────────────
 * Running K2JVMCompiler bare (no `-kotlin-home`) also needs jars the `kotlinc` script would normally
 * hide inside its own `lib/` directory. Found empirically on this machine by running it and reading
 * each `NoClassDefFoundError` in turn (see `buildKotlincClasspath` doc comment for the full list and
 * exactly when each one bites - notably `org.jetbrains:annotations`, needed only once the emitted
 * Kotlin declares a generic data class such as `Uncertain<T>`'s `Known<T>`).
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { delimiter, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

const TEST_DIR = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = resolve(TEST_DIR, '../../../..');
const ROUTING_HS_PATH = resolve(
  REPO_ROOT,
  'packages/core/src/compiler/quest-mr-logic/Routing.logic.hs'
);
const TYPED_EXIT_FIVE_HS_PATH = resolve(REPO_ROOT, 'examples/native/typed-exit-five.hs');
const WASM_NODE_MODULE_PATH = resolve(TEST_DIR, '../../pkg-node/holoscript_wasm.js');

// Long compiler stdout/stderr goes here in full; only a tail comes back into assertions/console so a
// failure printout stays readable. See `logAndTail`.
const LOG_DIR = resolve(tmpdir(), 'linguist');

// ── compile_to_kotlin bridge (pkg-node build, loaded the way a CommonJS artifact is loaded from an
//    ESM test file: createRequire, same pattern wasm-api.ts uses for its own dynamic require) ──────
interface HoloScriptKotlinBridge {
  compile_to_kotlin(source: string, indent: string): string;
}

let wasmBridge: HoloScriptKotlinBridge | undefined;
let wasmLoadError: string | undefined;
try {
  wasmBridge = require(WASM_NODE_MODULE_PATH) as HoloScriptKotlinBridge;
} catch (err) {
  wasmLoadError = err instanceof Error ? err.message : String(err);
}

// ── JVM discovery ────────────────────────────────────────────────────────────────────────────────

/**
 * Locates a JVM. Mirrors `resolveCargoCommand()`'s candidate-list-then-`existsSync` shape from
 * `wasm-api.test.ts` (same folder), but returns `undefined` on a miss instead of a bare command name -
 * this file needs a definite yes/no to drive `describe.skipIf`, whereas that helper is happy to hand a
 * bare `cargo` to the OS and let the spawn itself fail if it's truly missing.
 *
 * Order: `HOLOSCRIPT_JAVA` env, `JAVA_HOME/bin/java(.exe)`, `java` on PATH, then the HoloScript-managed
 * JDK this laptop's own Kotlin toolchain is installed against.
 *
 * `HOLOSCRIPT_KOTLIN_JVM=off` is an escape hatch that forces a miss regardless of what is actually
 * installed, so the skip path itself is provable on a machine that DOES have a JVM (see the bottom of
 * this file's header for how that was verified for this change).
 */
function findJava(): string | undefined {
  if (process.env.HOLOSCRIPT_KOTLIN_JVM === 'off') return undefined;

  const exeName = process.platform === 'win32' ? 'java.exe' : 'java';
  const fromPath = (process.env.PATH ?? '')
    .split(delimiter)
    .filter(Boolean)
    .map((entry) => resolve(entry, exeName));
  const fromJavaHome = process.env.JAVA_HOME
    ? [resolve(process.env.JAVA_HOME, 'bin', exeName)]
    : [];
  const managed = [
    resolve(
      process.env.LOCALAPPDATA ?? resolve(homedir(), 'AppData', 'Local'),
      'HoloScript/tools/jdk-17/bin',
      exeName
    ),
  ];

  const candidates = [process.env.HOLOSCRIPT_JAVA, ...fromJavaHome, ...fromPath, ...managed].filter(
    (candidate): candidate is string => Boolean(candidate)
  );
  return candidates.find((candidate) => existsSync(candidate));
}

// ── kotlinc classpath discovery ──────────────────────────────────────────────────────────────────

const GRADLE_MODULES_ROOT = resolve(homedir(), '.gradle/caches/modules-2/files-2.1');

interface GradleJar {
  version: string;
  jarPath: string;
}

/**
 * Every `<version>/<hash>/<artifactId>-<version>.jar` Gradle has cached for one `groupId:artifactId`,
 * newest version first. Versions in these caches are plain `X.Y.Z`, so a numeric-segment compare is
 * enough - no need for full semver/pre-release handling.
 */
function findGradleJars(groupId: string, artifactId: string): GradleJar[] {
  const artifactDir = resolve(GRADLE_MODULES_ROOT, groupId, artifactId);
  if (!existsSync(artifactDir)) return [];

  const versions = readdirSync(artifactDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => {
      const partsA = a.split('.').map((n) => Number.parseInt(n, 10) || 0);
      const partsB = b.split('.').map((n) => Number.parseInt(n, 10) || 0);
      for (let i = 0; i < Math.max(partsA.length, partsB.length); i += 1) {
        const diff = (partsB[i] ?? 0) - (partsA[i] ?? 0);
        if (diff !== 0) return diff;
      }
      return 0;
    });

  const jars: GradleJar[] = [];
  for (const version of versions) {
    const versionDir = resolve(artifactDir, version);
    const hashDirs = readdirSync(versionDir, { withFileTypes: true }).filter((entry) =>
      entry.isDirectory()
    );
    for (const hashDir of hashDirs) {
      const jarPath = resolve(versionDir, hashDir.name, `${artifactId}-${version}.jar`);
      if (existsSync(jarPath)) {
        jars.push({ version, jarPath });
        break;
      }
    }
  }
  return jars;
}

interface KotlincClasspath {
  /** Every jar needed to both launch K2JVMCompiler and (passed again as ITS OWN `-cp`) resolve the
   *  code it compiles. See the file header for why kotlin-stdlib has to be on both. */
  entries: string[];
  /** One `name: path` line per jar, for a compile-failure message. */
  describe(): string;
}

/**
 * Builds the kotlinc classpath. `HOLOSCRIPT_KOTLINC_CLASSPATH` - a `delimiter`-joined jar list, the
 * usual classpath convention - wins outright and is trusted as-is. Otherwise: the newest
 * kotlin-compiler-embeddable in the Gradle module cache, plus matching-version kotlin-stdlib /
 * kotlin-script-runtime / kotlin-daemon-embeddable / kotlin-reflect where the cache has them (falling
 * back to the newest cached version of each when there is no exact match), plus four more jars
 * K2JVMCompiler needs to run AT ALL when invoked directly instead of through the `kotlinc` launcher
 * script (which would normally supply these from its own `lib/` via `-kotlin-home`). Each was found
 * empirically on this laptop, one `NoClassDefFoundError` at a time:
 *
 *   - org.jetbrains.intellij.deps:trove4j                 - CoreApplicationEnvironment needs it just
 *     to construct itself (`NoClassDefFoundError: kotlinx/coroutines/CoroutineScope` came first and
 *     pointed here indirectly; trove4j is the IntelliJ-platform collections library the compiler's
 *     core environment is built on).
 *   - org.jetbrains.kotlinx:kotlinx-coroutines-core-jvm    - same startup path,
 *     `NoClassDefFoundError: kotlinx/coroutines/CoroutineScope` directly.
 *   - org.jetbrains:annotations                            - NOT needed to compile a plain function
 *     (`fun add(a: Int, b: Int): Int`), only surfaces once the emitted Kotlin declares a GENERIC data
 *     class - e.g. the `Uncertain<T>` prelude's `data class Known<T>`. The JVM IR backend needs
 *     `org.jetbrains.annotations.NotNull` on the classpath to emit that class's synthesized `copy()`;
 *     without it: `NoClassDefFoundError: org/jetbrains/annotations/NotNull` deep inside
 *     `FunctionCodegen`, while compiling `Routing.logic.hs`'s emission.
 *   - org.jetbrains.kotlin:kotlin-reflect                  - the newest kotlin-compiler-embeddable
 *     cached on this laptop (2.3.21) parses ITS OWN command-line arguments via Kotlin reflection: the
 *     `K2JVMCompilerArguments` `@Argument`-annotated properties are read through
 *     `kotlin.reflect.jvm.ReflectJvmMapping`, in a static initializer that runs before a single source
 *     file is touched. Without kotlin-reflect on the classpath: `NoClassDefFoundError:
 *     kotlin/reflect/jvm/ReflectJvmMapping` at `ArgumentsKt.<clinit>`, for EVERY invocation regardless
 *     of what is being compiled. The older 2.1.0 compiler this file was first prototyped against does
 *     not hit this path, which is how this jar was missed until `findGradleJars` picked 2.3.21 instead.
 *
 * `kotlinc`'s own docs do not mention these four, because its launcher script normally hides them
 * inside its own lib/ directory; K2JVMCompiler run bare needs them named explicitly.
 */
function buildKotlincClasspath(): KotlincClasspath | undefined {
  const override = process.env.HOLOSCRIPT_KOTLINC_CLASSPATH?.trim();
  if (override) {
    const entries = override.split(delimiter).filter(Boolean);
    if (entries.length > 0) {
      return {
        entries,
        describe: () => `HOLOSCRIPT_KOTLINC_CLASSPATH override:\n${entries.join('\n')}`,
      };
    }
  }

  const compilerJars = findGradleJars('org.jetbrains.kotlin', 'kotlin-compiler-embeddable');
  if (compilerJars.length === 0) return undefined;
  const { version, jarPath: compilerJar } = compilerJars[0];

  const pickJar = (groupId: string, artifactId: string): string | undefined => {
    const candidates = findGradleJars(groupId, artifactId);
    return candidates.find((jar) => jar.version === version)?.jarPath ?? candidates[0]?.jarPath;
  };

  const named: Record<string, string | undefined> = {
    'kotlin-compiler-embeddable': compilerJar,
    'kotlin-stdlib': pickJar('org.jetbrains.kotlin', 'kotlin-stdlib'),
    'kotlin-script-runtime': pickJar('org.jetbrains.kotlin', 'kotlin-script-runtime'),
    'kotlin-daemon-embeddable': pickJar('org.jetbrains.kotlin', 'kotlin-daemon-embeddable'),
    'kotlin-reflect': pickJar('org.jetbrains.kotlin', 'kotlin-reflect'),
    trove4j: pickJar('org.jetbrains.intellij.deps', 'trove4j'),
    'kotlinx-coroutines-core-jvm': pickJar('org.jetbrains.kotlinx', 'kotlinx-coroutines-core-jvm'),
    'org.jetbrains:annotations': pickJar('org.jetbrains', 'annotations'),
  };

  const missing = Object.entries(named)
    .filter(([, jarPath]) => !jarPath)
    .map(([name]) => name);
  if (missing.length > 0) {
    console.warn(
      `[kotlin-jvm.test.ts] kotlin-compiler-embeddable ${version} found in the Gradle cache, but ` +
        `missing: ${missing.join(', ')}. No network downloads are attempted; add the jar(s) to the ` +
        `Gradle cache or set HOLOSCRIPT_KOTLINC_CLASSPATH.`
    );
    return undefined;
  }

  const entries = Object.values(named) as string[];
  return {
    entries,
    describe: () =>
      Object.entries(named)
        .map(([name, jarPath]) => `${name}: ${jarPath as string}`)
        .join('\n'),
  };
}

// ── Toolchain gate ───────────────────────────────────────────────────────────────────────────────

interface Toolchain {
  java: string;
  kotlinc: KotlincClasspath;
}

const javaPath = findJava();
const kotlincClasspath = buildKotlincClasspath();
const toolchain: Toolchain | undefined =
  javaPath && kotlincClasspath && wasmBridge
    ? { java: javaPath, kotlinc: kotlincClasspath }
    : undefined;

if (!toolchain) {
  const reasons: string[] = [];
  if (process.env.HOLOSCRIPT_KOTLIN_JVM === 'off') {
    reasons.push('HOLOSCRIPT_KOTLIN_JVM=off (explicit escape hatch)');
  } else if (!javaPath) {
    reasons.push(
      'no JVM found (checked HOLOSCRIPT_JAVA, JAVA_HOME/bin/java, java on PATH, and the ' +
        'HoloScript-managed tools/jdk-17)'
    );
  }
  if (!kotlincClasspath) {
    reasons.push(
      'no usable kotlinc classpath (checked HOLOSCRIPT_KOTLINC_CLASSPATH and the ' +
        'kotlin-compiler-embeddable Gradle cache under ~/.gradle/caches/modules-2/files-2.1)'
    );
  }
  if (!wasmBridge) {
    reasons.push(`could not load the compile_to_kotlin WASM bridge: ${wasmLoadError}`);
  }
  console.warn(
    `[kotlin-jvm.test.ts] SKIPPING all tests: JVM/Kotlin-compiler toolchain unavailable on this ` +
      `machine. ${reasons.join('; ')}. This is expected in CI, which has no JVM - see the file header.`
  );
}

// ── compile + run helpers ────────────────────────────────────────────────────────────────────────

const COMPILE_TIMEOUT_MS = 60000; // first compile on this laptop measured ~5s warm; generous headroom
const RUN_TIMEOUT_MS = 30000;
const TEST_TIMEOUT_MS = 90000;

function tailLines(text: string, maxLines: number): string {
  const lines = text.split(/\r?\n/);
  if (lines.length <= maxLines) return text;
  return [
    `... (${lines.length - maxLines} earlier line(s) truncated; full output logged under ${LOG_DIR}) ...`,
    ...lines.slice(-maxLines),
  ].join('\n');
}

let invocationCounter = 0;

/** Writes full stdout/stderr to a file under LOG_DIR and returns a tail-truncated pair, so a failing
 *  assertion's own printout (and this file's console output) stays small per the no-huge-output rule,
 *  while the complete log survives on disk for later inspection beyond the tail. */
function logAndTail(
  label: string,
  stdout: string,
  stderr: string
): { stdout: string; stderr: string } {
  invocationCounter += 1;
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    const file = resolve(LOG_DIR, `${label}-${process.pid}-${invocationCounter}.log`);
    writeFileSync(file, `=== stdout ===\n${stdout}\n=== stderr ===\n${stderr}\n`, 'utf8');
  } catch {
    // Best-effort logging only; never fail a test because the log directory couldn't be written.
  }
  return { stdout: tailLines(stdout, 200), stderr: tailLines(stderr, 200) };
}

interface CompileRunResult {
  compiled: boolean;
  stdout: string;
  stderr: string;
}

/** Compiles one complete `.kt` file (already containing its own `fun main()`) and, on success, runs
 *  the resulting `HarnessKt` class. Always cleans up its scratch directory. */
function compileAndRunKotlinSource(fullSource: string, toolchain_: Toolchain): CompileRunResult {
  const cp = toolchain_.kotlinc.entries.join(delimiter);
  const scratchDir = mkdtempSync(resolve(tmpdir(), 'holoscript-kotlin-jvm-'));
  try {
    const srcFile = resolve(scratchDir, 'Harness.kt');
    const outDir = resolve(scratchDir, 'out');
    mkdirSync(outDir);
    writeFileSync(srcFile, fullSource, 'utf8');

    const compile = spawnSync(
      toolchain_.java,
      [
        '-cp',
        cp,
        'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler',
        srcFile,
        '-d',
        outDir,
        '-cp',
        cp,
        '-no-reflect',
        '-no-stdlib',
      ],
      { encoding: 'utf8', timeout: COMPILE_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 }
    );
    const compileLogged = logAndTail('compile', compile.stdout ?? '', compile.stderr ?? '');

    if (compile.error) {
      return {
        compiled: false,
        stdout: compileLogged.stdout,
        stderr: `${compileLogged.stderr}\n${String(compile.error)}`,
      };
    }
    if (compile.status !== 0) {
      return { compiled: false, stdout: compileLogged.stdout, stderr: compileLogged.stderr };
    }

    const run = spawnSync(toolchain_.java, ['-cp', [outDir, cp].join(delimiter), 'HarnessKt'], {
      encoding: 'utf8',
      timeout: RUN_TIMEOUT_MS,
      maxBuffer: 16 * 1024 * 1024,
    });
    const runLogged = logAndTail('run', run.stdout ?? '', run.stderr ?? '');
    return { compiled: true, stdout: runLogged.stdout, stderr: runLogged.stderr };
  } finally {
    rmSync(scratchDir, { recursive: true, force: true });
  }
}

/**
 * Writes `source` plus a harness `fun main() { println(<mainCall>) }` into one temp Kotlin file,
 * compiles it, and (on success) runs it.
 *
 * `wrapInObjectNamed` wraps `source` in `object <name> { ... }` BEFORE appending the harness `main`,
 * and evaluates `mainCall` as `<name>.<mainCall>` instead of bare `<mainCall>`. Use this when `source`
 * itself declares a zero-arg top-level `fun main()` - as HoloScript's own emitted `.hs` `main` does.
 * Without it, the harness's own top-level `fun main()` (the JVM entry point this helper always adds)
 * and the emitted one collide as a duplicate zero-arg `main` declaration, and the file fails to compile
 * for a reason that has nothing to do with what the test is actually trying to prove. Wrapping in an
 * object (rather than the alternative of a second file with `@file:JvmName`) keeps everything in one
 * compilation unit, which is all this helper needs.
 */
function compileAndRunKotlin(
  source: string,
  mainCall: string,
  toolchain_: Toolchain,
  options: { wrapInObjectNamed?: string } = {}
): CompileRunResult {
  const body = options.wrapInObjectNamed
    ? `object ${options.wrapInObjectNamed} {\n${source}\n}`
    : source;
  const call = options.wrapInObjectNamed ? `${options.wrapInObjectNamed}.${mainCall}` : mainCall;
  const fullSource = `${body}\n\nfun main() {\n  println(${call})\n}\n`;
  return compileAndRunKotlinSource(fullSource, toolchain_);
}

// ── Tests ────────────────────────────────────────────────────────────────────────────────────────

describe.skipIf(!toolchain)('.hs -> Kotlin bridge, compiled and run on a real JVM', () => {
  // Safe: `it` bodies below never execute when the describe itself is skipped (vitest still calls this
  // callback to REGISTER the (skipped) tests, but skipped `it` callbacks are never invoked).
  const tc = toolchain as Toolchain;
  const wasm = wasmBridge as HoloScriptKotlinBridge;

  it(
    'the harness itself: a hand-written Kotlin function compiles and runs',
    () => {
      const result = compileAndRunKotlin('fun add(a: Int, b: Int): Int = a + b', 'add(2, 3)', tc);
      expect(result.compiled, result.stderr).toBe(true);
      expect(result.stdout.trim()).toBe('5');
    },
    TEST_TIMEOUT_MS
  );

  it(
    'the harness can go red: a genuine type error is reported as a compile failure',
    () => {
      const result = compileAndRunKotlin('fun f(): Int { return 1f }', 'f()', tc);
      expect(result.compiled).toBe(false);
      expect(result.stderr).toMatch(/type mismatch/i);
    },
    TEST_TIMEOUT_MS
  );

  it(
    'compiles the CURRENT Quest routing logic standalone (Routing.logic.hs -> compile_to_kotlin)',
    () => {
      const hsSource = readFileSync(ROUTING_HS_PATH, 'utf8');
      const emitted = wasm.compile_to_kotlin(hsSource, '');

      // compile_to_kotlin's JSON-error boundary (see wasm-api.ts docs on `compile_to_kotlin`): a
      // refusal comes back as `{"error": "..."}` text instead of Kotlin. Fail loudly with the refusal
      // reason rather than let it fall through to a confusing Kotlin-compiler parse error.
      if (emitted.trim().startsWith('{')) {
        throw new Error(`compile_to_kotlin refused Routing.logic.hs: ${emitted}`);
      }

      // Uncertain<T> prelude (ClassifiedIntent's @unknown field) should be inlined automatically.
      expect(emitted).toContain('sealed interface Uncertain<out T>');
      // decideRoute(intent: String, autoImmerse: Boolean): Route - read straight from the emission, so
      // the mainCall below exercises the actual decision function with a real, typed call.
      expect(emitted).toContain('fun decideRoute(intent: String, autoImmerse: Boolean): Route');

      // No `wrapInObjectNamed` needed: Routing.logic.hs has no `function main`, so nothing in the
      // emission can collide with the harness's own top-level `fun main()`.
      const result = compileAndRunKotlin(emitted, 'decideRoute("world", true)', tc);

      expect(
        result.compiled,
        `compile_to_kotlin(Routing.logic.hs) should compile standalone; compiler stderr:\n${result.stderr}`
      ).toBe(true);
      expect(result.stdout.trim()).toBe('EnterWorld');
    },
    TEST_TIMEOUT_MS
  );

  it(
    'typed-exit-five.hs compiles and its main returns 5 (task_1790642739557_5kf8, fixed)',
    () => {
      const hsSource = readFileSync(TYPED_EXIT_FIVE_HS_PATH, 'utf8');
      const emitted = wasm.compile_to_kotlin(hsSource, '  ');
      if (emitted.trim().startsWith('{')) {
        throw new Error(`compile_to_kotlin refused typed-exit-five.hs: ${emitted}`);
      }
      // Until 2026-09-29 the bridge guessed `fun add(left: Int, right: Int): Float` and
      // `fun main(): String` for this all-i32 program, and kotlinc rejected it with three type
      // mismatches. A function that states its types is now lowered by them.
      expect(emitted).toContain('fun add(left: Int, right: Int): Int');
      expect(emitted).toContain('fun main(): Int');
      const result = compileAndRunKotlin(emitted, 'main()', tc, { wrapInObjectNamed: 'Emitted' });
      expect(result.compiled, result.stderr).toBe(true);
      expect(result.stdout.trim()).toBe('5');
    },
    TEST_TIMEOUT_MS
  );

  it(
    'every tracked .hs program the bridge lowers compiles on the JVM',
    () => {
      const listing = spawnSync('git', ['ls-files', '*.hs'], { cwd: REPO_ROOT, encoding: 'utf8' });
      const files = String(listing.stdout).trim().split(/\r?\n/).filter(Boolean);
      const lowered: Array<{ file: string; kotlin: string }> = [];
      for (const file of files) {
        const kotlin = wasm.compile_to_kotlin(readFileSync(resolve(REPO_ROOT, file), 'utf8'), '  ');
        if (!kotlin.trim().startsWith('{')) lowered.push({ file, kotlin });
      }
      // 17 of 137 on 2026-09-29; the rest are refused by name (borrows, fixed arrays, typed structs).
      expect(lowered.length).toBeGreaterThanOrEqual(17);
      // Each program on its own, so a failure names the program.
      const verdicts = lowered.map((entry) => {
        const result = compileAndRunKotlinSource(
          `object Program {\n${entry.kotlin}\n}\n\nfun main() {\n  println("ok")\n}\n`,
          tc
        );
        return { file: entry.file, compiled: result.compiled, stderr: result.stderr };
      });
      // Known on 2026-09-29, each with its reason. Every typed program compiles. Any other failure,
      // or one of these starting to compile, fails this test, so the list stays true.
      const KNOWN_NOT_STANDALONE: Record<string, string> = {
        // The untyped lowering guesses a String parameter, then compares it with a Float
        // (board task_1790647694183_kkq2).
        'examples/scientific/energy-discovery-lab/energy-ledger.hs': 'untyped String guess',
        'examples/scientific/experiment-quest/experiment-quest.hs': 'untyped String guess',
        // Calls matchedPattern, stripPrefixCI, trimSlashes and titleCaseWords, which its
        // hand-written Quest shell (WorldPortal.kt) supplies: it compiles inside the app.
        'packages/core/src/compiler/quest-mr-logic/WorldPortal.logic.hs': 'needs its Quest shell',
      };
      const failing = verdicts.filter((verdict) => !verdict.compiled);
      expect(
        failing.map((verdict) => verdict.file).sort(),
        failing.map((verdict) => `${verdict.file}\n${verdict.stderr}`).join('\n\n')
      ).toEqual(Object.keys(KNOWN_NOT_STANDALONE).sort());
    },
    TEST_TIMEOUT_MS * 20
  );

  it(
    'typed programs compute what they declare on the JVM',
    () => {
      // [program, call, what its own source says the call returns]
      const cases: Array<[string, string, string]> = [
        ['examples/native/typed-exit-five.hs', 'main()', '5'],
        ['distributions/systems/conformance/typed-exit-five.hs', 'main()', '5'],
        ['examples/three-surface-agent/policy.hs', 'main()', '1'],
        ['examples/native/multi-file-modules/math.hs', 'add(2, 3)', '5'],
        ['examples/native-tests/arithmetic.test.hs', 'test_adds_positive_integers()', 'true'],
        ['examples/native-tests/arithmetic.test.hs', 'test_adds_negative_integers()', 'true'],
        ['packages/std/src/abi/scalar-v1.hs', 'std_math_clamp_i32(5, 0, 3)', '3'],
        ['packages/std/src/abi/scalar-v1.hs', 'std_math_sign_i32(-4)', '-1'],
        ['packages/std/src/abi/scalar-f32-v1.hs', 'std_math_lerp_f32(0f, 10f, 0.5f)', '5.0'],
        [
          'packages/std/src/abi/scalar-f64-v1.hs',
          'std_math_remap_f64(5.0, 0.0, 10.0, 0.0, 100.0)',
          '50.0',
        ],
      ];
      const programs = [...new Set(cases.map(([file]) => file))];
      const objects = programs
        .map((file, index) => {
          const kotlin = wasm.compile_to_kotlin(
            readFileSync(resolve(REPO_ROOT, file), 'utf8'),
            '  '
          );
          if (kotlin.trim().startsWith('{')) {
            throw new Error(`compile_to_kotlin refused ${file}: ${kotlin}`);
          }
          return `object Program${index} {\n${kotlin}\n}`;
        })
        .join('\n\n');
      const prints = cases
        .map(([file, call]) => `  println(Program${programs.indexOf(file)}.${call})`)
        .join('\n');
      const result = compileAndRunKotlinSource(`${objects}\n\nfun main() {\n${prints}\n}\n`, tc);
      expect(result.compiled, result.stderr).toBe(true);
      expect(result.stdout.trim().split(/\r?\n/)).toEqual(cases.map(([, , expected]) => expected));
    },
    TEST_TIMEOUT_MS
  );
});
