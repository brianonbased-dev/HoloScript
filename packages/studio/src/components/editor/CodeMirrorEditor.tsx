'use client';

// CodeMirror 6 replacement for HoloScriptEditor.tsx (Monaco).
// Drop-in: same props interface, same Zustand wiring, same EditorToolbar +
// SpatialBlameOverlay. Removes the @monaco-editor/react + monaco-editor deps.
// LSP tools (hs_diagnostics, hs_autocomplete, hs_hover) wired via /api/ide proxy.

import { useRef, useEffect, useState } from 'react';
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  drawSelection,
  hoverTooltip,
  type Tooltip,
} from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from '@codemirror/commands';
import { bracketMatching, indentOnInput, foldGutter } from '@codemirror/language';
import { linter, lintGutter, forceLinting, type Diagnostic } from '@codemirror/lint';
import { type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { useSceneStore, useWorkspaceStore } from '@/lib/stores';
import { EditorToolbar } from './EditorToolbar';
import { SpatialBlameOverlay } from '@/components/versionControl/SpatialBlameOverlay';
import { holoScriptExtensions } from './holoScriptCM';
import { formatHoloScript } from './holoScriptLanguage';
import { getDiagnostics, getCompletions, getHover } from '@/lib/ide/ideClient';

interface HoloScriptEditorProps {
  height?: string;
}

export function CodeMirrorEditor({ height: _height = '100%' }: HoloScriptEditorProps) {
  const code = useSceneStore((s) => s.code);
  const setCode = useSceneStore((s) => s.setCode);
  const errors = useSceneStore((s) => s.errors);
  const blameWorkspacePath = useWorkspaceStore((s) => {
    const id = s.activeWorkspaceId;
    return id ? (s.workspaces.find((w) => w.id === id)?.localPath ?? '') : '';
  });

  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const setCodeRef = useRef(setCode);
  const errorsRef = useRef(errors);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [blameTarget, setBlameTarget] = useState<{ line: number; traitLabel?: string } | null>(
    null
  );

  // Keep mutable refs current on every render so closures in the editor see fresh values
  setCodeRef.current = setCode;
  errorsRef.current = errors;

  // Build the EditorView once on mount; destroy on unmount
  useEffect(() => {
    if (!containerRef.current) return;

    // ── Linter 1: store errors (instant, reads from ref) ─────────────────────
    const storeErrorsLinter = linter(
      (view) =>
        errorsRef.current.map((e): Diagnostic => {
          const lineNum = Math.max(1, Math.min(e.line ?? 1, view.state.doc.lines));
          const ln = view.state.doc.line(lineNum);
          return { from: ln.from, to: ln.to, severity: 'error', message: e.message };
        }),
      { delay: 0 },
    );

    // ── Linter 2: LSP diagnostics (debounced, async server round-trip) ────────
    const lspLinter = linter(
      async (view): Promise<Diagnostic[]> => {
        const code = view.state.doc.toString();
        if (!code.trim()) return [];
        const items = await getDiagnostics(code);
        return items.map((d): Diagnostic => {
          const lineNum = Math.max(1, Math.min(d.line, view.state.doc.lines));
          const ln = view.state.doc.line(lineNum);
          const col = Math.max(0, (d.column ?? 1) - 1);
          const from = Math.min(ln.from + col, ln.to);
          const sev = d.severity === 'hint' ? ('info' as const) : d.severity;
          return { from, to: ln.to, severity: sev, message: d.message };
        });
      },
      { delay: 750 },
    );

    // ── LSP autocomplete source (async, merged after static completions) ──────
    async function lspCompletions(ctx: CompletionContext): Promise<CompletionResult | null> {
      const pos = ctx.pos;
      const ln = ctx.state.doc.lineAt(pos);
      const code = ctx.state.doc.toString();
      const line = ln.number;
      const column = pos - ln.from + 1;
      const triggerMatch = ctx.matchBefore(/[@a-zA-Z_]\w*/);
      const triggerChar = triggerMatch?.text.slice(-1);
      const items = await getCompletions(code, line, column, triggerChar);
      if (!items.length) return null;
      const wordMatch = ctx.matchBefore(/\w*/);
      const kindMap: Record<string, string> = {
        keyword: 'keyword',
        trait: 'class',
        function: 'function',
        variable: 'variable',
        property: 'property',
      };
      return {
        from: wordMatch ? wordMatch.from : pos,
        options: items.map((c) => ({
          label: c.label,
          type: kindMap[c.kind ?? ''] ?? 'text',
          detail: c.detail,
          info: c.documentation,
          apply: c.insertText,
        })),
        validFor: /\w*/,
      };
    }

    // ── LSP hover tooltip ─────────────────────────────────────────────────────
    const lspHover = hoverTooltip(
      async (view, pos): Promise<Tooltip | null> => {
        const code = view.state.doc.toString();
        const ln = view.state.doc.lineAt(pos);
        const line = ln.number;
        const column = pos - ln.from + 1;
        const hover = await getHover(code, line, column);
        if (!hover || (!hover.value && !hover.documentation)) return null;
        return {
          pos,
          create(): { dom: HTMLElement } {
            const dom = document.createElement('div');
            dom.style.cssText =
              'padding:6px 8px;max-width:320px;font-size:12px;line-height:1.5;' +
              'background:#1a1a2e;color:#e2e8f0;border-radius:4px;' +
              'border:1px solid #374151;white-space:pre-wrap;';
            dom.textContent = hover.value ?? hover.documentation ?? '';
            return { dom };
          },
        };
      },
      { hoverTime: 400 },
    );

    const formatKeymap = keymap.of([
      {
        // Ctrl+Shift+F / Cmd+Shift+F — format in place
        key: 'Ctrl-Shift-f',
        mac: 'Cmd-Shift-f',
        run(view) {
          const src = view.state.doc.toString();
          const formatted = formatHoloScript(src);
          if (formatted !== src) {
            view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: formatted } });
          }
          return true;
        },
      },
      {
        // Ctrl+S / Cmd+S — format + flush to store immediately (bypass debounce)
        key: 'Ctrl-s',
        mac: 'Cmd-s',
        run(view) {
          const src = view.state.doc.toString();
          const formatted = formatHoloScript(src);
          if (formatted !== src) {
            view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: formatted } });
          }
          setCodeRef.current(view.state.doc.toString());
          return true;
        },
      },
      {
        // Ctrl+Shift+B / Cmd+Shift+B — spatial blame at cursor line
        key: 'Ctrl-Shift-b',
        mac: 'Cmd-Shift-b',
        run(view) {
          const pos = view.state.selection.main.head;
          const ln = view.state.doc.lineAt(pos);
          const match = ln.text.match(/@([a-zA-Z_]\w*)/);
          setBlameTarget({ line: ln.number, traitLabel: match ? `@${match[1]}` : undefined });
          return true;
        },
      },
    ]);

    const updateListener = EditorView.updateListener.of((update) => {
      if (!update.docChanged) return;
      const value = update.state.doc.toString();
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => setCodeRef.current(value), 300);
    });

    const state = EditorState.create({
      doc: code,
      extensions: [
        history(),
        lineNumbers(),
        highlightActiveLine(),
        drawSelection(),
        bracketMatching(),
        indentOnInput(),
        foldGutter(),
        storeErrorsLinter,
        lspLinter,
        lintGutter(),
        lspHover,
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        formatKeymap,
        updateListener,
        // holoScriptExtensions merges lspCompletions alongside static completions
        ...holoScriptExtensions([lspCompletions]),
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount-once; external code + errors synced via dedicated effects below

  // Sync code written to the store from outside (Brittney, Vibe page, etc.)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (view.state.doc.toString() === code) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: code } });
  }, [code]);

  // Re-run the linter whenever store errors are updated
  useEffect(() => {
    if (viewRef.current) forceLinting(viewRef.current);
  }, [errors]);

  return (
    <div className="relative flex flex-col h-full">
      {blameTarget && (
        <SpatialBlameOverlay
          workspacePath={blameWorkspacePath || undefined}
          filePath="scene-1.holo"
          line={blameTarget.line}
          traitLabel={blameTarget.traitLabel}
          onClose={() => setBlameTarget(null)}
        />
      )}
      <div ref={containerRef} className="flex-1 min-h-0" />
      <EditorToolbar code={code} onCodeChange={setCode} />
    </div>
  );
}
