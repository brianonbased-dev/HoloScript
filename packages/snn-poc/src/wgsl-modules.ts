/**
 * Ambient module declarations for WGSL imports.
 *
 * Kept as a .ts file (not .d.ts) because repo .gitignore excludes *.d.ts.
 */
declare module '*.wgsl' {
  const content: string;
  export default content;
}

export {};
