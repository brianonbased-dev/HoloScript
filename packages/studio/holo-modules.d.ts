/**
 * Ambient module declarations for compiled HoloScript artifacts (.holo).
 *
 * .holo files are JSON bundles produced by CodeEditorCompiler (and other
 * compile_to_* targets). TypeScript resolves them via resolveJsonModule once
 * this wildcard declaration is present.
 */
declare module '*.holo' {
  const value: Record<string, unknown>;
  export default value;
}
