'use client';

/**
 * HoloScriptEditor — Monaco editor with HoloScript syntax highlighting
 *
 * Features:
 *  - Dark studio theme matching the editor color palette
 *  - HoloScript tokenizer: keywords, types, @trait decorators, numbers, strings
 *  - Autocomplete: trait names, block keywords, built-in functions
 *  - Error markers from the pipeline (red squiggles)
 *  - onChange → debounced setCode (300ms) to avoid re-compiling every keystroke
 */

import { useRef, useEffect, useCallback } from 'react';
import MonacoEditor, { type Monaco, type OnMount } from '@monaco-editor/react';
import { useSceneStore } from '@/lib/store';
import type { editor as MonacoEditorNS } from 'monaco-editor';

// ─── HoloScript Grammar ───────────────────────────────────────────────────────

const HOLOSCRIPT_LANGUAGE_ID = 'holoscript';

const KEYWORDS = [
  'scene', 'object', 'trait', 'extends', 'import', 'from', 'export',
  'if', 'else', 'for', 'while', 'return', 'let', 'const', 'var',
  'true', 'false', 'null', 'undefined', 'new', 'this',
];

const BUILTIN_TRAITS = [
  '@mesh', '@material', '@light', '@camera', '@audio', '@physics',
  '@collider', '@rigidbody', '@animation', '@particle', '@script',
  '@gaussian_splat', '@audio_source', '@point_light', '@spot_light',
  '@directional_light', '@ambient_light',
];

const BUILTIN_FUNCTIONS = [
  'vec2', 'vec3', 'vec4', 'mat3', 'mat4', 'quat',
  'lerp', 'clamp', 'mix', 'smoothstep', 'length', 'normalize',
  'cross', 'dot', 'sin', 'cos', 'tan', 'abs', 'floor', 'ceil',
];

function registerHoloScript(monaco: Monaco) {
  // Skip if already registered
  if (monaco.languages.getLanguages().some((l) => l.id === HOLOSCRIPT_LANGUAGE_ID)) return;

  monaco.languages.register({ id: HOLOSCRIPT_LANGUAGE_ID, extensions: ['.holo'] });

  monaco.languages.setMonarchTokensProvider(HOLOSCRIPT_LANGUAGE_ID, {
    keywords: KEYWORDS,
    symbols: /[=><!~?:&|+\-*/^%]+/,
    tokenizer: {
      root: [
        // @trait decorators
        [/@[a-zA-Z_]\w*/, 'type.identifier'],
        // Line comments
        [/\/\/.*$/, 'comment'],
        // Block comments
        [/\/\*/, 'comment', '@comment'],
        // Strings
        [/"([^"\\]|\\.)*"/, 'string'],
        [/'([^'\\]|\\.)*'/, 'string'],
        // Template literals
        [/`/, 'string', '@template'],
        // Numbers
        [/\d+(\.\d+)?([eE][+-]?\d+)?/, 'number.float'],
        // Identifiers + keywords
        [/[a-zA-Z_]\w*/, {
          cases: {
            '@keywords': 'keyword',
            '@default': 'identifier',
          },
        }],
        // Scene block header: scene "Name" { 
        [/scene\s+"[^"]*"/, 'type.identifier'],
        // Punctuation
        [/[{}()[\]]/, '@brackets'],
        [/[,;.]/, 'delimiter'],
      ],
      comment: [
        [/[^/*]+/, 'comment'],
        [/\*\//, 'comment', '@pop'],
        [/[/*]/, 'comment'],
      ],
      template: [
        [/`/, 'string', '@pop'],
        [/\$\{/, { token: 'delimiter.bracket', next: '@templateExpr' }],
        [/./, 'string'],
      ],
      templateExpr: [
        [/}/, { token: 'delimiter.bracket', next: '@pop' }],
        { include: 'root' },
      ],
    },
  } as Parameters<typeof monaco.languages.setMonarchTokensProvider>[1]);

  // Autocomplete provider
  monaco.languages.registerCompletionItemProvider(HOLOSCRIPT_LANGUAGE_ID, {
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      const suggestions = [
        ...KEYWORDS.map((kw) => ({
          label: kw,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: kw,
          range,
        })),
        ...BUILTIN_TRAITS.map((t) => ({
          label: t,
          kind: monaco.languages.CompletionItemKind.Class,
          insertText: t.slice(1), // without the @
          detail: 'HoloScript trait',
          range,
        })),
        ...BUILTIN_FUNCTIONS.map((fn) => ({
          label: fn,
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: `${fn}($0)`,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
        })),
        // Snippet: new scene object
        {
          label: 'object',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: 'object ${1:MyObject} {\n\t@mesh { geometry: "${2:box}" }\n\t@material { color: "${3:#ffffff}" }\n}',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Create a new HoloScript object',
          range,
        },
        {
          label: 'trait',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: 'trait ${1:MyTrait} {\n\t$0\n}',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Define a new HoloScript trait',
          range,
        },
      ];

      return { suggestions };
    },
  });

  // Studio theme
  monaco.editor.defineTheme('holoscript-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: '6366f1', fontStyle: 'bold' },
      { token: 'type.identifier', foreground: '818cf8' },
      { token: 'comment', foreground: '4b5563', fontStyle: 'italic' },
      { token: 'string', foreground: '34d399' },
      { token: 'number.float', foreground: 'f59e0b' },
      { token: 'identifier', foreground: 'e2e8f0' },
      { token: 'delimiter', foreground: '6b7280' },
      { token: '@brackets', foreground: '94a3b8' },
    ],
    colors: {
      'editor.background': '#0a0a12',
      'editor.foreground': '#e2e8f0',
      'editor.lineHighlightBackground': '#1a1a2e',
      'editorCursor.foreground': '#6366f1',
      'editor.selectionBackground': '#6366f130',
      'editorIndentGuide.background1': '#1e1e30',
      'editorLineNumber.foreground': '#374151',
      'editorLineNumber.activeForeground': '#6366f1',
      'editor.inactiveSelectionBackground': '#6366f115',
    },
  });
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface HoloScriptEditorProps {
  height?: string | number;
}

export function HoloScriptEditor({ height = '100%' }: HoloScriptEditorProps) {
  const code = useSceneStore((s) => s.code);
  const setCode = useSceneStore((s) => s.setCode);
  const errors = useSceneStore((s) => s.errors);

  const editorRef = useRef<MonacoEditorNS.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Apply error markers whenever pipeline errors change
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;

    const model = editor.getModel();
    if (!model) return;

    const markers: MonacoEditorNS.IMarkerData[] = errors.map((e) => ({
      severity: monaco.MarkerSeverity.Error,
      message: e.message,
      startLineNumber: e.line ?? 1,
      startColumn: 1,
      endLineNumber: e.line ?? 1,
      endColumn: model.getLineLength(e.line ?? 1) + 1,
    }));

    monaco.editor.setModelMarkers(model, 'holoscript', markers);
  }, [errors]);

  const handleMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    registerHoloScript(monaco);
    monaco.editor.setTheme('holoscript-dark');

    // Set model language
    const model = editor.getModel();
    if (model) monaco.editor.setModelLanguage(model, HOLOSCRIPT_LANGUAGE_ID);
  }, []);

  const handleChange = useCallback((value: string | undefined) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setCode(value ?? '');
    }, 300);
  }, [setCode]);

  return (
    <MonacoEditor
      height={height}
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
  );
}
