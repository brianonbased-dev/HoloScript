// ============================================================
// holoscript-editor.hs
// Native HoloScript description of the Studio code editor.
//
// Compilation target: Native2D (React/CodeMirror 6 output)
// Compiler:           CodeEditorCompiler (packages/core)
//
// PREMORTEM NOTES (2026-06-08):
//   - `value` uses HoloBindValue form (__bind: true) — plain strings
//     are NOT used as store references. The compiler derives hook
//     emissions from source/write, not from string matching.
//   - CI gate required: re-compile and git diff --exit-code before merge.
//   - static_completions: false branch must be implemented in the
//     compiler before schema field is used for anything other than docs.
// ============================================================

object "holoscript-editor" {

  // ── Primary editor surface ───────────────────────────────────────────
  @code_editor {
    language: "holoscript"
    theme: "holoscript-dark"
    readonly: false
    height: "100%"
    font_family: "JetBrains Mono, Fira Mono, Cascadia Code, monospace"
    font_size: 12
    line_height: 20
    tab_size: 2
    word_wrap: true
    // HoloBindValue — compiler emits useSceneStore((s) => s.code) + setCode
    value: {
      __bind: true
      source: "useSceneStore.code"
      write: "useSceneStore.setCode"
      debounce_ms: 300
    }
  }

  // ── Language server features ─────────────────────────────────────────
  @lsp_client {
    diagnostics_tool: "hs_diagnostics"
    completions_tool: "hs_autocomplete"
    hover_tool: "hs_hover"
    diagnostics_debounce_ms: 750
    hover_delay_ms: 400
    // static_completions: true — compiler emits static source alongside LSP.
    // When false, LSP-only mode (not yet implemented in CodeEditorCompiler).
    static_completions: true
  }

  // ── Gutter + structure ───────────────────────────────────────────────
  @editor_gutters {
    line_numbers: true
    fold_gutter: true
    lint_gutter: true
    active_line_highlight: true
  }

  // ── Keyboard shortcuts ───────────────────────────────────────────────
  @editor_keybindings {
    format:    { key: "Ctrl-Shift-F", mac: "Cmd-Shift-F" }
    save_flush:{ key: "Ctrl-S",       mac: "Cmd-S" }
    blame:     { key: "Ctrl-Shift-B", mac: "Cmd-Shift-B" }
  }

  // ── Store error injection (pipeline validation errors → lint markers) ─
  @store_diagnostics {
    source: {
      __bind: true
      source: "useSceneStore.errors"
    }
    severity: "error"
    debounce_ms: 0
  }

  // ── Bottom toolbar ───────────────────────────────────────────────────
  @editor_toolbar {
    code_binding: {
      __bind: true
      source: "useSceneStore.code"
      write: "useSceneStore.setCode"
    }
  }

  // ── Spatial blame overlay ────────────────────────────────────────────
  @spatial_blame {
    workspace_path_binding: {
      __bind: true
      source: "useWorkspaceStore.activeWorkspacePath"
    }
    file_path: "scene-1.holo"
    trigger_key: { key: "Ctrl-Shift-B", mac: "Cmd-Shift-B" }
  }

}
