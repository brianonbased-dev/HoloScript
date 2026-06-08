'use client';

// CodeMirror 6 replacement for HoloScriptEditor.tsx (Monaco).
// Drop-in: same props interface, same Zustand wiring, same EditorToolbar +
// SpatialBlameOverlay. Removes the @monaco-editor/react + monaco-editor deps.

import { useRef, useEffect, useState } from 'react';
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  drawSelection,
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
import { useSceneStore, useWorkspaceStore } from '@/lib/stores';
import { EditorToolbar } from './EditorToolbar';
import { SpatialBlameOverlay } from '@/components/versionControl/SpatialBlameOverlay';
import { holoScriptExtensions } from './holoScriptCM';
import { formatHoloScript } from './holoScriptLanguage';

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

    // Linter reads store errors via ref; forceLinting() is called when errors change
    const storeErrorsLinter = linter(
      (view) =>
        errorsRef.current.map((e): Diagnostic => {
          const lineNum = Math.max(1, Math.min(e.line ?? 1, view.state.doc.lines));
          const ln = view.state.doc.line(lineNum);
          return { from: ln.from, to: ln.to, severity: 'error', message: e.message };
        }),
      { delay: 0 },
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
        lintGutter(),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        formatKeymap,
        updateListener,
        ...holoScriptExtensions(),
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
