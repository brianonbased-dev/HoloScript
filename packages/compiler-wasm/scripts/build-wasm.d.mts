export const BUILD_TARGETS: ReadonlyArray<{ target: string; outDir: string; schema: string }>;

export const RUST_BUILD_INPUTS: ReadonlyArray<string>;

export function wasmPackCandidates(options?: Record<string, unknown>): string[];

export function runWasmBuild(options?: Record<string, unknown>): number;
