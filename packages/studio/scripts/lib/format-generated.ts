/**
 * Format a generated file the way its generator promised to (#309: a generator
 * formats what it writes), or refuse loudly.
 *
 * Three generators (compile-view-registry.ts, compile-holo-pages.ts,
 * compile-vector-pages.mts) each called prettier's API on their own. Two of them
 * wrapped the call in a bare `try {} catch {}` that fell back to the raw bytes
 * with no signal, in build AND check mode, so a file prettier could not parse
 * would silently and permanently stop being formatted while the drift check
 * that lives in those same two scripts kept passing; the third threw prettier's
 * raw error. Independent review of #309 named the split (task_1790066851748_j9di).
 *
 * One rule now: a generated file prettier cannot parse is a compiler bug, and
 * the build or check fails on the spot, naming the file and prettier's own
 * reason, instead of writing bytes that the next check treats as formatted.
 *
 * And it fails before anything is written. The generators used to format and
 * write file by file, so one unparseable member stopped a build part-way through:
 * claude3-x402's review of #316 measured 6 of 15 pages rewritten, 9 untouched and
 * the manifest stale, a tree no single state of the sources produces.
 * emitGeneratedSet formats the whole set first and writes only when every member
 * formatted. It guards against prettier refusing, not against the disk failing
 * between two writes.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { format, resolveConfig } from 'prettier';

/** One file a generator emits: where it goes, and the unformatted code. */
export interface GeneratedFile {
  target: string;
  code: string;
}

export class GeneratedOutputUnformattableError extends Error {
  readonly target: string;

  constructor(target: string, cause: unknown, setSize?: number) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    const nothingWritten =
      setSize === undefined
        ? ''
        : ` Nothing was written: all ${setSize} file(s) of this run are left as they were.`;
    super(
      `generated output for ${target} could not be formatted: ${reason}.${nothingWritten} ` +
        'The generator produced something prettier cannot parse; fix the generator, ' +
        'do not commit the raw bytes.',
      { cause }
    );
    this.name = 'GeneratedOutputUnformattableError';
    this.target = target;
  }
}

async function formatOne(target: string, code: string, setSize?: number): Promise<string> {
  const config = await resolveConfig(target);
  try {
    return await format(code, { ...config, filepath: target });
  } catch (error) {
    throw new GeneratedOutputUnformattableError(target, error, setSize);
  }
}

/**
 * Prettier-format `code` as it will be written to `target`, using the config that
 * applies to that path. Throws GeneratedOutputUnformattableError when prettier
 * cannot parse the output.
 */
export async function formatGenerated(target: string, code: string): Promise<string> {
  return formatOne(target, code);
}

/**
 * The one way a generator emits its files. Formats EVERY member first; then, in
 * build mode, writes them all, or, in check mode, compares them all against the
 * files on disk and writes nothing. Both modes consume the identical bytes, so a
 * check cannot drift away from the build it guards. Returns the targets whose
 * file on disk differs or is missing (check mode; always empty in build mode).
 *
 * A member prettier cannot parse throws GeneratedOutputUnformattableError before
 * the first write, so the run leaves every file as it was.
 */
export async function emitGeneratedSet(
  files: readonly GeneratedFile[],
  options: { check: boolean }
): Promise<string[]> {
  const formatted: Array<{ target: string; pretty: string }> = [];
  for (const { target, code } of files) {
    formatted.push({ target, pretty: await formatOne(target, code, files.length) });
  }

  const drift: string[] = [];
  for (const { target, pretty } of formatted) {
    if (options.check) {
      let current: string | null = null;
      try {
        current = readFileSync(target, 'utf-8');
      } catch {
        current = null;
      }
      if (current !== pretty) drift.push(target);
      continue;
    }
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, pretty, 'utf-8');
  }
  return drift;
}
