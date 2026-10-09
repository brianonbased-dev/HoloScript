/**
 * holoEditorConfig.ts — thin typed wrapper around the compiled editor config.
 *
 * The artifact at packages/studio/holoscript-editor.json is produced by running
 * `compile_to_code_editor` against holoscript-editor.hs. It is the source of
 * truth for editor behaviour: changing holoscript-editor.hs and recompiling
 * updates the editor without touching any React code.
 *
 * The compiler's output is JSON, so it is saved and imported as `.json`. Until
 * 2026-10-09 it was saved as `.holo`, which sent it through Studio's `.holo`
 * webpack loader (src/lib/holo-loader.mjs): that loader parses HoloScript and
 * compiles a page, so this import received the loader's compiled module rather
 * than the config (the editor's fallbacks hold the same values, so nothing
 * showed). Once the parser refused JSON as HoloScript (#542), the same detour
 * failed every Studio build.
 *
 * Keep it current with holoscript-editor.hs (re-compile and git diff
 * --exit-code before merge).
 */

import rawConfig from '../../../holoscript-editor.json';

export interface HoloBindRef {
  __bind: true;
  source: string;
  write?: string;
  debounce_ms?: number;
}

export interface CodeEditorHoloConfig {
  code_editor?: {
    language?: string;
    theme?: string;
    readonly?: boolean;
    height?: string;
    font_family?: string;
    font_size?: number;
    line_height?: number;
    tab_size?: number;
    word_wrap?: boolean;
    value?: HoloBindRef;
  };
  lsp_client?: {
    diagnostics_tool?: string;
    completions_tool?: string;
    hover_tool?: string;
    diagnostics_debounce_ms?: number;
    hover_delay_ms?: number;
    static_completions?: boolean;
  };
  editor_gutters?: {
    line_numbers?: boolean;
    fold_gutter?: boolean;
    lint_gutter?: boolean;
    active_line_highlight?: boolean;
  };
  editor_keybindings?: {
    format?: { key: string; mac: string };
    save_flush?: { key: string; mac: string };
    blame?: { key: string; mac: string };
  };
  store_diagnostics?: {
    source?: HoloBindRef;
    severity?: string;
    debounce_ms?: number;
  };
  editor_toolbar?: Record<string, unknown>;
  spatial_blame?: {
    workspace_path_binding?: HoloBindRef;
    file_path?: string;
    trigger_key?: { key: string; mac: string };
  };
}

export const holoEditorConfig: CodeEditorHoloConfig = rawConfig as CodeEditorHoloConfig;

export function getEditorConfig(): CodeEditorHoloConfig {
  return holoEditorConfig;
}
