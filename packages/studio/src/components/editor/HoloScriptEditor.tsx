'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import MonacoEditor, { type Monaco, type OnMount } from '@monaco-editor/react';
import { useSceneStore } from '@/lib/stores';
import { EditorToolbar } from './EditorToolbar';
import { SpatialBlameOverlay } from '@/components/versionControl/SpatialBlameOverlay';
import {
  HOLOSCRIPT_LANGUAGE_ID,
  formatHoloScript,
  registerHoloScript,
} from './holoScriptLanguage';

/** Minimal IStandaloneCodeEditor surface used by this component. */
interface IStandaloneCodeEditor {
  getModel(): {
    getLineLength(line: number): number;
    getValue(): string;
    setValue(value: string): void;
  } | null;
  dispose(): void;
  addAction(action: {
    id: string;
    label: string;
    keybindings?: number[];
    run: (editor: unknown) => void;
  }): void;
  getAction(id: string): { run(): Promise<void> } | null;
}

/** Minimal IMarkerData surface used for pipeline error markers. */
interface IMarkerData {
  severity: number;
  message: string;
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}

interface HoloScriptEditorProps {
  height?: string;
}

export function HoloScriptEditor({ _height = '100%' }: HoloScriptEditorProps) {
  const code = useSceneStore((s) => s.code);
  const setCode = useSceneStore((s) => s.setCode);
  const errors = useSceneStore((s) => s.errors);

  const editorRef = useRef<IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const [blameTarget, setBlameTarget] = useState<{ line: number; traitLabel?: string } | null>(
    null
  );

  // Apply error markers whenever pipeline errors change
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;

    const model = editor.getModel();
    if (!model) return;

    const markers: IMarkerData[] = errors.map((e) => ({
      severity: monaco.MarkerSeverity.Error,
      message: e.message,
      startLineNumber: e.line ?? 1,
      startColumn: 1,
      endLineNumber: e.line ?? 1,
      endColumn: model.getLineLength(e.line ?? 1) + 1,
    }));

    monaco.editor.setModelMarkers(
      model as unknown as Parameters<typeof monaco.editor.setModelMarkers>[0],
      'holoscript',
      markers as unknown as Parameters<typeof monaco.editor.setModelMarkers>[2],
    );
  }, [errors]);

  const handleMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;
      registerHoloScript(monaco);
      monaco.editor.setTheme('holoscript-dark');

      // Set model language
      const model = editor.getModel();
      if (model) monaco.editor.setModelLanguage(model, HOLOSCRIPT_LANGUAGE_ID);

      // Register format action (Ctrl+Shift+F)
      editor.addAction({
        id: 'holoscript.format',
        label: 'Format HoloScript',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyF],
        run: () => {
          const m = editor.getModel();
          if (!m) return;
          const formatted = formatHoloScript(m.getValue());
          if (formatted !== m.getValue()) {
            m.setValue(formatted);
          }
        },
      });

      // Format on save (Ctrl+S)
      editor.addAction({
        id: 'holoscript.formatOnSave',
        label: 'Format & Save HoloScript',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
        run: () => {
          const m = editor.getModel();
          if (!m) return;
          const formatted = formatHoloScript(m.getValue());
          if (formatted !== m.getValue()) {
            m.setValue(formatted);
          }
          setCode(formatted);
        },
      });

      // Spatial Blame â€” right-click context menu
      editor.addAction({
        id: 'holoscript.blame',
        label: 'Spatial Blame: Who wrote this?',
        contextMenuGroupId: 'navigation',
        contextMenuOrder: 1.5,
        run: () => {
          const pos = editor.getPosition();
          if (!pos) return;
          const lineText = editor.getModel()?.getLineContent(pos.lineNumber) ?? '';
          const traitMatch = lineText.match(/@([a-zA-Z_]\w*)/);
          setBlameTarget({
            line: pos.lineNumber,
            traitLabel: traitMatch ? `@${traitMatch[1]}` : undefined,
          });
        },
      });
    },
    [setCode, setBlameTarget]
  );

  const handleChange = useCallback(
    (value: string | undefined) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setCode(value ?? '');
      }, 300);
    },
    [setCode]
  );

  return (
    <div className="relative flex flex-col h-full">
      {blameTarget && (
        <SpatialBlameOverlay
          filePath="scene-1.holo"
          line={blameTarget.line}
          traitLabel={blameTarget.traitLabel}
          onClose={() => setBlameTarget(null)}
        />
      )}
      <div className="flex-1 min-h-0">
        <MonacoEditor
          height="100%"
          defaultLanguage={HOLOSCRIPT_LANGUAGE_ID}
          language={HOLOSCRIPT_LANGUAGE_ID}
          value={code}
          onChange={handleChange}
          onMount={handleMount}
          theme="holoscript-dark"
          options={{
            fontSize: 12,
            fontFamily: '"JetBrains Mono", "Fira Mono", "Cascadia Code", monospace',
            lineHeight: 20,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            padding: { top: 12, bottom: 12 },
            folding: true,
            renderLineHighlight: 'gutter',
            glyphMargin: false,
            lineDecorationsWidth: 4,
            tabSize: 2,
            insertSpaces: true,
            automaticLayout: true,
            bracketPairColorization: { enabled: true },
            formatOnPaste: true,
            suggest: {
              showKeywords: true,
              showSnippets: true,
            },
            quickSuggestions: {
              other: true,
              comments: false,
              strings: false,
            },
          }}
        />
      </div>
      <EditorToolbar code={code} />
    </div>
  );
}