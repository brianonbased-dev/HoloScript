export const BUILD_TARGETS: ReadonlyArray<{ target: string; outDir: string; schema: string }>;

export const REMAPPED_ROOTS: ReadonlyArray<{ role: string; to: string }>;

export const INPUTS_RULE: string;

export function buildRecipe(
  target: string,
  outDir: string
): { wasmPackArgs: string[]; rustflags: string[] };

export interface RustToken {
  kind: 'ident' | 'str' | 'punct' | 'lit' | 'lifetime';
  value: string;
  line: number;
}

export function lexRust(text: string): RustToken[];

export function scanRustSource(text: string): {
  includes: Array<{ macro: string; path: string; base: 'file' | 'crate'; line: number }>;
  refusals: Array<{ line: number; form: string }>;
};

export interface BuildInputSource {
  list(paths: string[]): string[];
  read(path: string): Buffer | Uint8Array | null;
}

export function collectBuildInputs(
  source: BuildInputSource,
  crateDir: string
): { inputs: Map<string, Buffer>; workspace: string };

export function inputsDigest(inputs: Map<string, Buffer>): {
  sha256: string;
  files: Record<string, string>;
};

export function workingTreeSource(options: {
  git: (args: string[]) => { status: number; stdout: string };
  rootDir: string;
  fs: { readFileSync(path: string): Buffer | string };
}): BuildInputSource;

export function gitSource(
  git: (args: string[], input?: string) => { status: number; stdout: Buffer; stderr: string },
  rev?: string | null
): BuildInputSource;

export function withRustflags(
  env: Record<string, string | undefined>,
  flags: string[]
): { existing: string[]; env: Record<string, string | undefined> };

export function wasmPackCandidates(options?: Record<string, unknown>): string[];

export function runWasmBuild(options?: Record<string, unknown>): number;
