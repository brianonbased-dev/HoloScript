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
 */
import { format, resolveConfig } from 'prettier';

export type PrettierFormat = typeof format;
export type PrettierResolveConfig = typeof resolveConfig;

export class GeneratedOutputUnformattableError extends Error {
  readonly target: string;

  constructor(target: string, cause: unknown) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    super(
      `generated output for ${target} could not be formatted: ${reason}. `
        + 'The generator produced something prettier cannot parse; fix the generator, '
        + 'do not commit the raw bytes.',
      { cause },
    );
    this.name = 'GeneratedOutputUnformattableError';
    this.target = target;
  }
}

/**
 * Prettier-format `code` as it will be written to `target`, using the config that
 * applies to that path. Throws GeneratedOutputUnformattableError when prettier
 * cannot parse the output. `deps` exists so a test can feed the fault a real
 * prettier throws, without a real unparseable generator.
 */
export async function formatGenerated(
  target: string,
  code: string,
  deps: { format?: PrettierFormat; resolveConfig?: PrettierResolveConfig } = {},
): Promise<string> {
  const config = await (deps.resolveConfig ?? resolveConfig)(target);
  try {
    return await (deps.format ?? format)(code, { ...config, filepath: target });
  } catch (error) {
    throw new GeneratedOutputUnformattableError(target, error);
  }
}
