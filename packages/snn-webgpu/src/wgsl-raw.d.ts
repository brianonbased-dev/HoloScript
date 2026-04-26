/**
 * Ambient module declaration for `*.wgsl?raw` (and `*.wgsl`) shader imports.
 *
 * Same pattern engine/src/wgsl-raw.d.ts and studio/src/wgsl-raw.d.ts use.
 * Force-added past the repo-root *.d.ts gitignore (see .gitignore line 30).
 *
 * Why this file (not src/wgsl-modules.ts):
 * - tsup's DTS worker walks the entry-import graph from src/index.ts. Since
 *   no source file ever imports wgsl-modules.ts, the ambient declarations
 *   in it never enter the DTS program -> the *.wgsl?raw imports in
 *   pipeline-factory.ts fail with TS2307 in the dts emit pass (CI run
 *   24943955349 / job 73041990818, lines 23.3563 - 23.3579).
 * - tsc's DTS pass automatically includes every *.d.ts within the
 *   include glob, regardless of import graph -> the ambient declaration
 *   here is always picked up.
 *
 * This unblocks the studio Railway deploy preflight (task_1777163117693_iqs2).
 */

declare module '*.wgsl?raw' {
  const source: string;
  export default source;
}

declare module '*.wgsl' {
  const source: string;
  export default source;
}
