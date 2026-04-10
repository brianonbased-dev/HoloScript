/**
 * Ambient module declarations for WGSL shader imports.
 *
 * Kept as .ts (not .d.ts) because repo-level .gitignore excludes *.d.ts.
 */
declare module '*.wgsl?raw' {
  const content: string;
  export default content;
}

declare module '*.wgsl' {
  const content: string;
  export default content;
}

export {};
