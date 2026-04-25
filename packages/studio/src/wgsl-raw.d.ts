// Ambient module declaration for `*.wgsl?raw` bundler-suffix imports.
// Engine source files (path-aliased into studio via `@holoscript/engine/*`)
// import shaders with the `?raw` suffix; without this declaration, studio's
// strict tsc fails to resolve those imports even though the bundler handles
// them at runtime. Mirrors `packages/engine/src/wgsl-raw.d.ts`.
declare module '*.wgsl?raw' {
  const source: string;
  export default source;
}
