/**
 * CodeEditorCompiler — HoloScript 'code-editor' compilation target
 *
 * Compiles a HoloScript object decorated with @code_editor traits into a
 * JSON configuration bundle for CodeMirror 6. The bundle is consumed by
 * Studio's CodeMirrorEditor.tsx (or any CM6 host) at runtime.
 *
 * Compilation target name: 'code-editor'
 * Output format: JSON string (UTF-8)
 *
 * CI gate: re-compile holoscript-editor.hs and git diff --exit-code before
 * merging any change to either holoscript-editor.hs or CodeMirrorEditor.tsx.
 *
 * static_completions: 'true' branch must be implemented in this compiler
 * before the field is used for anything other than documentation. Currently
 * the field is passed through to the bundle as-is.
 */

import type {
  HoloComposition,
  HoloObjectTrait,
  HoloValue,
} from '../parser/HoloCompositionTypes';

// ─── Known trait keys ────────────────────────────────────────────────────────

const KNOWN_TRAITS = new Set([
  'code_editor',
  'lsp_client',
  'editor_gutters',
  'editor_keybindings',
  'store_diagnostics',
  'editor_toolbar',
  'spatial_blame',
]);

// ─── Public types ─────────────────────────────────────────────────────────────

export interface CodeEditorConfig {
  code_editor?: Record<string, HoloValue>;
  lsp_client?: Record<string, HoloValue>;
  editor_gutters?: Record<string, HoloValue>;
  editor_keybindings?: Record<string, HoloValue>;
  store_diagnostics?: Record<string, HoloValue>;
  editor_toolbar?: Record<string, HoloValue>;
  spatial_blame?: Record<string, HoloValue>;
  /** Unknown traits are preserved when strictTraits is false */
  [key: string]: Record<string, HoloValue> | undefined;
}

export interface CodeEditorCompilerOptions {
  /** JSON indent level (default: 2) */
  indent?: number;
  /**
   * When true, only traits listed in KNOWN_TRAITS are emitted.
   * Default: false — unknown traits are passed through.
   */
  strictTraits?: boolean;
}

// ─── Compiler ─────────────────────────────────────────────────────────────────

export class CodeEditorCompiler {
  readonly compilerName = 'CodeEditorCompiler';

  compile(
    composition: HoloComposition,
    _agentToken?: string,
    _outputPath?: string,
    options?: CodeEditorCompilerOptions
  ): string {
    const indent = options?.indent ?? 2;
    const strict = options?.strictTraits ?? false;

    const config: CodeEditorConfig = {};

    // Collect traits from root-level composition traits + all top-level objects.
    // holoscript-editor.hs uses a single `object "holoscript-editor" { @traits… }`
    // block; the traits live on that object.
    const allTraits: HoloObjectTrait[] = [...(composition.traits ?? [])];
    for (const obj of composition.objects) {
      allTraits.push(...(obj.traits ?? []));
    }

    for (const trait of allTraits) {
      if (strict && !KNOWN_TRAITS.has(trait.name)) continue;
      config[trait.name] = trait.config as Record<string, HoloValue>;
    }

    return JSON.stringify(config, null, indent);
  }
}
