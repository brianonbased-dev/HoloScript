/**
 * PostToolUse quality gate for Edit|Write.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS WAS REWRITTEN (2026-08-19) — it had never validated a single file.
 * ---------------------------------------------------------------------------
 * The previous version read `process.argv[2]`, and .claude/settings.json invoked
 * it as `node .claude/hooks/validate-edit.mjs "$FILE_PATH"`. Claude Code expands
 * only $CLAUDE_PROJECT_DIR in hook command strings, so the literal seven
 * characters `$FILE_PATH` arrived as argv[2]. Measured, both invocation shapes:
 *
 *   $ node .claude/hooks/validate-edit.mjs '$FILE_PATH'
 *   MCP/Validation Network Error on $FILE_PATH: ENOENT: no such file or
 *   directory, open 'C:\holo-dev\HoloRepo\HoloScript\$FILE_PATH'
 *   EXIT=0
 *
 * ...and when a shell did expand the empty variable, argv[2] was undefined and
 * it hit `if (!file) process.exit(0)` — no output at all, exit 0.
 *
 * Three further defects meant it could not have validated anything even with a
 * correct path. All three were measured against mcp.holoscript.net:
 *
 *   1. It authenticated with process.env.HOLOSCRIPT_API_KEY. That key returns
 *      HTTP 401 {"error":"Unauthorized"}. The key that authenticates lives only
 *      in the repo .env, which this hook never loaded (it is invoked directly,
 *      not through ai-ecosystem/hooks/run-hook.mjs, which is what loads .env).
 *   2. It called tools named `holoscript_validate` and `holoscript_review`.
 *      Neither is registered on the server (tools/list, 430 tools: the real
 *      names are `validate_holoscript` and `hs_ai_review`). With a valid key the
 *      server answered: `Security gate 2 denied: Tool "holoscript_validate" is
 *      not a registered tool (fail-closed on unregistered)`.
 *   3. It never inspected the response for a verdict. A validation result of
 *      "invalid" was console.log'd under `[Validation Response]` and the process
 *      exited 0 exactly as if it had passed. There was no red path at all.
 *
 * So on every Edit and Write since it was written, this hook reported success
 * having validated zero files.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS GATE DELIBERATELY DOES NOT DO — a named scope reduction.
 * ---------------------------------------------------------------------------
 * The old hook claimed to validate HoloScript sources (.hs/.hsplus). That claim
 * is not restored here, because no validator within reach agrees with this
 * repo's own committed corpus. Measured over tracked files:
 *
 *   @holoscript/core HoloScriptPlusParser   .hsplus  130 pass /  70 fail (n=200)
 *                                           .holo    148 pass /  52 fail (n=200)
 *                                           .hs       72 pass /  65 fail (n=137)
 *   @holoscript/core HoloCompositionParser  .hsplus   74 pass / 126 fail (n=200)
 *                                           .holo    175 pass /  25 fail (n=200)
 *   remote validate_holoscript              5 of 12 sampled tracked files INVALID,
 *                                           and its format auto-detection is
 *                                           guesswork — it receives only `code`,
 *                                           never the filename, and labelled
 *                                           .hsplus files as "holo"/"hs" and a
 *                                           .hs file as "hsplus".
 *
 * Also note `parseHolo()` returns {success:true, errors:[]} for arbitrary
 * garbage — it cannot go red, so it is not a validator.
 *
 * Gating on any of these would red 35-47% of the repo's own source. That is a
 * louder version of the same lie, and it would be ignored within a day. So
 * HoloScript files are reported NOT VALIDATED — an honest null result. Fixing
 * that needs a per-stratum verifier of record, which is a separate piece of work.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT DOES CHECK — offline, deterministic, measured zero false positives.
 * ---------------------------------------------------------------------------
 *   .ts .tsx .mts .cts   TypeScript parser, SYNTAX ONLY (not type errors)
 *                        300/300 tracked files clean
 *   .js .jsx .mjs .cjs   same parser in JS/JSX mode
 *                        300/300 tracked files clean
 *   .json                strict JSON.parse; JSONC (comments/trailing commas)
 *                        tolerated for tsconfig/jsconfig/.vscode/devcontainer/
 *                        language-configuration
 *                        199/200 clean — the 1 failure, .bench-logs/
 *                        format-stress/2026-05-22_claudecode-realism-ratchet/
 *                        gaps.json, is genuinely malformed (bad escape at
 *                        line 30), i.e. a real defect this gate now catches.
 *
 * Anything else: no output and exit 0. Silence is the point — this gate makes
 * no claim about a file it did not check. What it must never do again is print
 * something reassuring over work it did not do.
 *
 * ---------------------------------------------------------------------------
 * EXIT CODES
 * ---------------------------------------------------------------------------
 * PostToolUse runs AFTER the tool has already been applied, so a non-zero exit
 * cannot block, undo, or lose the user's edit. In Claude Code's hook contract
 * exit 2 feeds stderr back to the agent as actionable feedback; other non-zero
 * codes surface stderr to the user. Either way the failure is visible and no
 * work is destroyed, which is why a real validation failure exits 2 here rather
 * than exiting 0 with a console.log.
 *
 *   exit 2  a file this gate checks is genuinely invalid.
 *   exit 0  checked and clean / not a checked file type.
 *   exit 0  the gate itself broke — but it says NOT VALIDATED loudly on stderr
 *           and never claims the file passed. A broken gate must not read as a
 *           green one; it also must not block every edit in the repo, which is
 *           the same fail-open-but-loud split ai-ecosystem/hooks/run-hook.mjs
 *           uses for advisory hooks.
 */

import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const TAG = '[Quality Gate]';
const MAX_BYTES = 4 * 1024 * 1024;

/* ---------- 1. Resolve the file that was ACTUALLY edited ---------- */
// Claude Code pipes a JSON payload on stdin:
//   {"tool_name":"Edit","tool_input":{"file_path":"..."},"tool_response":{...}}
// Read it from stdin rather than reintroducing shell interpolation, because
// shell interpolation is precisely what was broken.
function readStdin() {
  if (process.stdin.isTTY) return '';
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

let payload = {};
try {
  const raw = readStdin();
  if (raw.trim()) payload = JSON.parse(raw);
} catch {
  payload = {};
}

const fromStdin =
  payload?.tool_input?.file_path ||
  payload?.tool_input?.filePath ||
  payload?.tool_input?.notebook_path ||
  payload?.tool_response?.filePath ||
  payload?.tool_response?.file_path;

// argv is kept only as a fallback for hand-invocation. An argument still
// containing '$' is an unexpanded shell placeholder, not a path — the original
// bug. Reject it instead of trying to open it.
const argvArg = process.argv[2];
const fromArgv = argvArg && !argvArg.includes('$') ? argvArg : null;

const file = fromStdin || fromArgv;

// No path means this gate cannot say anything about anything. Say nothing.
if (!file) process.exit(0);

const ext = path.extname(file).toLowerCase();
const base = path.basename(file).toLowerCase();
const posix = String(file).replace(/\\/g, '/');

const TS_EXT = new Set(['.ts', '.tsx', '.mts', '.cts']);
const JS_EXT = new Set(['.js', '.jsx', '.mjs', '.cjs']);
const HOLO_EXT = new Set(['.hs', '.hsplus', '.holo']);

if (!TS_EXT.has(ext) && !JS_EXT.has(ext) && ext !== '.json' && !HOLO_EXT.has(ext)) {
  process.exit(0);
}

/* ---------- 2. Report helpers — three distinct verdicts, never merged ---------- */
function pass(kind) {
  console.log(`${TAG} PASS  ${kind}  ${file}`);
  process.exit(0);
}
function fail(kind, details) {
  console.error(`${TAG} FAIL  ${kind}  ${file}`);
  for (const d of details.slice(0, 10)) console.error(`  ${d}`);
  if (details.length > 10) console.error(`  ...and ${details.length - 10} more`);
  console.error(`${TAG} The edit was applied. Fix the file above.`);
  process.exit(2);
}
// Not "pass". Not "fail". The gate could not answer, and says so.
function notValidated(reason) {
  console.error(`${TAG} NOT VALIDATED  ${file}`);
  console.error(`  ${reason}`);
  process.exit(0);
}

/* ---------- 3. Read the file ---------- */
let source;
try {
  const stat = fs.statSync(file);
  if (!stat.isFile()) process.exit(0);
  if (stat.size > MAX_BYTES) {
    notValidated(`file is ${(stat.size / 1048576).toFixed(1)}MB, over this gate's ${MAX_BYTES / 1048576}MB cap.`);
  }
  source = fs.readFileSync(file, 'utf8');
} catch (err) {
  notValidated(`could not read the file: ${err.message}`);
}
// Strip a UTF-8 BOM; several tracked tsconfigs carry one and it is not an error.
source = source.replace(/^\uFEFF/, '');

/* ---------- 4. HoloScript: honest null result (see header) ---------- */
if (HOLO_EXT.has(ext)) {
  // Said in words a person can read. The earlier wording -- "verifier of record",
  // "stratum", "reds on", "tracked sources" -- was four pieces of in-house jargon
  // in two sentences, printed on every edit to any of the 4,506 HoloScript files
  // here. A message that appears that often and explains nothing is a message
  // someone deletes, taking the honest answer with it.
  notValidated(
    'nothing here can check HoloScript files yet. Every checker we have wrongly ' +
      'condemns roughly 4 of every 10 of our own files, so this one refuses to ' +
      'guess rather than tell you something false in either direction.'
  );
}

/* ---------- 5. Load the TypeScript parser ---------- */
let ts;
try {
  ts = createRequire(import.meta.url)('typescript');
} catch (err) {
  notValidated(`the TypeScript parser could not be loaded, so nothing was checked: ${err.message}`);
}

/* ---------- 6. JSON / JSONC ---------- */
if (ext === '.json') {
  // Files named .json that the tool owning them reads as JSONC. Keeping this list
  // short is how the gate stays sharp -- but getting it wrong in the STRICT
  // direction is worse than a miss, because this gate exits 2 and tells whoever
  // edited the file next to go fix damage they did not cause.
  //
  // language-configuration.json was measured on 2026-08-19 failing strict parse at
  // line 28, on two escapes inside an indent regex. It is not a stray artifact:
  // packages/vscode-extension/package.json names it as the "configuration" for
  // BOTH contributed languages, and VS Code and the TypeScript parser both read it
  // as JSONC. The file is correct. The gate was wrong.
  const jsoncAllowed =
    /^(tsconfig|jsconfig)[^/]*\.json$/.test(base) ||
    base === 'devcontainer.json' ||
    base === 'language-configuration.json' ||
    posix.includes('/.vscode/') ||
    posix.startsWith('.vscode/');
  try {
    JSON.parse(source);
    pass('json', file);
  } catch (strictErr) {
    if (jsoncAllowed) {
      const r = ts.parseConfigFileTextToJson(file, source);
      if (!r.error) pass('jsonc', file);
      const msg = ts.flattenDiagnosticMessageText(r.error.messageText, ' ');
      fail('jsonc', [msg]);
    }
    fail('json', [strictErr.message]);
  }
}

/* ---------- 7. TypeScript / JavaScript — SYNTAX ONLY ---------- */
const kind = ext === '.tsx' ? ts.ScriptKind.TSX
  : ext === '.jsx' ? ts.ScriptKind.JSX
  : TS_EXT.has(ext) ? ts.ScriptKind.TS
  : ts.ScriptKind.JS;

let diagnostics;
try {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
  diagnostics = sf.parseDiagnostics || [];
} catch (err) {
  notValidated(`the parser threw, so nothing was checked: ${err.message}`);
}

const label = TS_EXT.has(ext) ? 'typescript-syntax' : 'javascript-syntax';
if (diagnostics.length === 0) pass(label, file);

const details = diagnostics.map((d) => {
  const msg = ts.flattenDiagnosticMessageText(d.messageText, ' ');
  if (d.file && typeof d.start === 'number') {
    const { line, character } = d.file.getLineAndCharacterOfPosition(d.start);
    return `line ${line + 1}:${character + 1}  TS${d.code}: ${msg}`;
  }
  return `TS${d.code}: ${msg}`;
});
fail(label, details);
