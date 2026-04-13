# @holoscript/connector-vscode — Roadmap

## Current State
- 8 tools: file open, terminal run, preview HoloScript output, workspace info, sync push/pull, extension status, MCP connection status
- Communicates with VS Code via the HoloScript extension's local HTTP API
- Enables agents to read workspace state and execute commands inside the editor

## Next (v1.1)
- [ ] Debugger integration — `vscode_set_breakpoint` and `vscode_debug_start` using DAP (Debug Adapter Protocol) via extension API
- [ ] Diagnostics push — `vscode_push_diagnostics` sending errors/warnings to the Problems panel (typed as `DiagnosticSeverity`)
- [ ] Editor annotations — `vscode_annotate_line` adding inline decorations (hints, warnings) at specific file:line locations
- [ ] Task runner — `vscode_run_task` executing named tasks from `.vscode/tasks.json` (build, test, lint)
- [ ] Settings read/write — `vscode_get_setting` and `vscode_set_setting` for workspace and user-level configuration
- [ ] Multi-file open — `vscode_open_files` opening a set of files in split editors for side-by-side review

## Future (v2.0)
- [ ] Notebook support — `vscode_notebook_run_cell` executing Jupyter notebook cells and returning output
- [ ] Refactoring commands — `vscode_rename_symbol` and `vscode_extract_function` using VS Code's built-in refactoring API
- [ ] Source control — `vscode_git_stage` and `vscode_git_commit` driving the SCM panel programmatically
- [ ] Extension management — `vscode_install_extension` and `vscode_disable_extension` by extension ID
- [ ] Webview panel — `vscode_create_webview` rendering custom HTML panels (HoloScript preview, diff views)
- [ ] Snippet injection — `vscode_insert_snippet` placing parameterized snippets at cursor position

## Integration Goals
- [ ] Diagnostics from connector-github PR review comments pushed directly to VS Code Problems panel
- [ ] connector-railway deploy logs streamed into a dedicated VS Code terminal via `vscode_terminal_run`
- [ ] HoloScript `.hs`/`.holo` file saves trigger parse validation and push errors as diagnostics
- [ ] Workspace info reported to HoloMesh team presence (which files are open, active language)
