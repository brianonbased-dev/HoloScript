// CodeMirror 6 HoloScript language extension.
// Ported from holoScriptLanguage.ts (Monaco/Monarch) to CM6 StreamLanguage.
// Provides: syntax highlighting, Studio dark theme, static autocomplete.
// LSP-backed features (diagnostics, hover, live completions) are wired in
// CodeMirrorEditor.tsx via the CM6 linting + tooltip extension APIs.

import { HighlightStyle, StreamLanguage, syntaxHighlighting } from '@codemirror/language';
import { autocompletion, type CompletionContext, type CompletionResult, snippetCompletion } from '@codemirror/autocomplete';
import { EditorView } from '@codemirror/view';
import { type Extension } from '@codemirror/state';
import { tags } from '@lezer/highlight';

import {
  BUILTIN_FUNCTIONS,
  BUILTIN_TRAITS,
  KEYWORDS,
  TYPE_KEYWORDS,
} from './holoScriptLanguage';

// ─── StreamLanguage tokenizer ──────────────────────────────────────────────────
// Ported from the Monarch tokenizer in holoScriptLanguage.ts. Uses CM6's CM5-compat
// stream interface. Token return values map to standard CM5 class names which CM6
// resolves to lezer highlight tags via its internal tokenTable.

interface HoloScriptState {
  inBlockComment: boolean;
}

const holoScriptStreamLang = StreamLanguage.define<HoloScriptState>({
  name: 'holoscript',

  startState(): HoloScriptState {
    return { inBlockComment: false };
  },

  token(stream, state): string | null {
    // ── Block comment continuation ───────────────────────────────────────────
    if (state.inBlockComment) {
      if (stream.match('*/')) state.inBlockComment = false;
      else stream.next();
      return 'comment';
    }

    // ── Whitespace ────────────────────────────────────────────────────────────
    if (stream.eatSpace()) return null;

    // ── @trait decorators — before identifier rule ────────────────────────────
    if (stream.peek() === '@') {
      stream.next();
      stream.match(/^[a-zA-Z_]\w*/);
      return 'attribute'; // → tags.attributeName (#818cf8)
    }

    // ── Line comments ─────────────────────────────────────────────────────────
    if (stream.match('//')) {
      stream.skipToEnd();
      return 'comment';
    }

    // ── Block comments ────────────────────────────────────────────────────────
    if (stream.match('/*')) {
      while (!stream.eol()) {
        if (stream.match('*/')) return 'comment';
        stream.next();
      }
      state.inBlockComment = true;
      return 'comment';
    }

    // ── Double-quoted strings ─────────────────────────────────────────────────
    if (stream.peek() === '"') {
      stream.next();
      while (!stream.eol()) {
        const ch = stream.next();
        if (ch === '\\') { stream.next(); continue; }
        if (ch === '"') break;
      }
      return 'string';
    }

    // ── Single-quoted strings ─────────────────────────────────────────────────
    if (stream.peek() === "'") {
      stream.next();
      while (!stream.eol()) {
        const ch = stream.next();
        if (ch === '\\') { stream.next(); continue; }
        if (ch === "'") break;
      }
      return 'string';
    }

    // ── Template literals (single-line; multi-line treated as continuation) ───
    if (stream.peek() === '`') {
      stream.next();
      while (!stream.eol()) {
        const ch = stream.next();
        if (ch === '\\') { stream.next(); continue; }
        if (ch === '`') break;
      }
      return 'string';
    }

    // ── Hex numbers ───────────────────────────────────────────────────────────
    if (stream.match(/^0x[0-9a-fA-F]+/)) return 'number';

    // ── Decimal / float numbers ───────────────────────────────────────────────
    if (stream.match(/^\d+(\.\d+)?([eE][+-]?\d+)?/)) return 'number';

    // ── Identifiers and keywords ──────────────────────────────────────────────
    if (stream.match(/^[a-zA-Z_]\w*/)) {
      const word = stream.current();
      if (KEYWORDS.includes(word)) return 'keyword';
      if (TYPE_KEYWORDS.includes(word)) return 'type';  // → tags.typeName (#38bdf8)
      return null; // identifier — uses default foreground (#ffffff)
    }

    // ── Brackets ──────────────────────────────────────────────────────────────
    if (stream.match(/^[{}()[\]]/)) return 'bracket';

    // ── Operators ─────────────────────────────────────────────────────────────
    if (stream.match(/^[=><~?:&|+\-*/^%!]+/)) return 'operator';

    // ── Punctuation ───────────────────────────────────────────────────────────
    if (stream.match(/^[,;.]/)) return 'punctuation';

    // ── Fallback: consume one char ────────────────────────────────────────────
    stream.next();
    return null;
  },

  languageData: {
    commentTokens: { line: '//', block: { open: '/*', close: '*/' } },
    closeBrackets: { brackets: ['(', '[', '{', '"', "'", '`'] },
    indentOnInput: /^\s*[{}]$/,
  },
});

// ─── Highlight style — HoloScript dark palette ────────────────────────────────
// Colors match the Monaco holoscript-dark theme in holoScriptLanguage.ts.

export const holoScriptHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword,       color: '#6366f1', fontWeight: 'bold' },
  { tag: tags.attributeName, color: '#818cf8' },           // @trait decorators
  { tag: tags.typeName,      color: '#38bdf8' },           // type keywords
  { tag: tags.comment,       color: '#4b5563', fontStyle: 'italic' },
  { tag: tags.string,        color: '#34d399' },
  { tag: tags.number,        color: '#f59e0b' },
  { tag: tags.bracket,       color: '#94a3b8' },
  { tag: tags.operator,      color: '#c084fc' },
  { tag: tags.punctuation,   color: '#6b7280' },
  { tag: tags.invalid,       color: '#f87171' },
]);

// ─── Editor theme — matches Studio globals.css tokens ─────────────────────────
// --studio-bg: #0d0d14  --studio-panel: #1a1a2e  --studio-accent: #6366f1

export const holoScriptTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: '#0d0d14',
      color: '#ffffff',
      fontFamily: '"JetBrains Mono", "Fira Mono", "Cascadia Code", monospace',
      fontSize: '12px',
      lineHeight: '20px',
      height: '100%',
    },
    '.cm-content': {
      caretColor: '#6366f1',
      padding: '12px 0',
    },
    '.cm-scroller': {
      overflow: 'auto',
    },
    '.cm-gutters': {
      backgroundColor: '#0d0d14',
      color: '#374151',
      border: 'none',
      borderRight: '1px solid #1e1e30',
    },
    '.cm-lineNumbers .cm-gutterElement': {
      minWidth: '3em',
      paddingRight: '8px',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'transparent',
      color: '#6366f1',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: '#6366f1',
    },
    '.cm-activeLine': {
      backgroundColor: '#1a1a2e',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
      backgroundColor: '#6366f130',
    },
    '.cm-matchingBracket': {
      color: '#ffffff',
      backgroundColor: '#6366f130',
      fontWeight: 'bold',
      outline: '1px solid #6366f150',
    },
    '.cm-foldPlaceholder': {
      backgroundColor: '#1a1a2e',
      border: '1px solid #374151',
      color: '#6b7280',
    },
    // Autocomplete dropdown
    '.cm-tooltip': {
      backgroundColor: '#1a1a2e',
      border: '1px solid #374151',
      borderRadius: '6px',
    },
    '.cm-tooltip-autocomplete ul': {
      maxHeight: '300px',
    },
    '.cm-tooltip-autocomplete ul li': {
      padding: '3px 8px',
    },
    '.cm-tooltip-autocomplete ul li[aria-selected]': {
      backgroundColor: '#6366f1',
      color: '#ffffff',
    },
    '.cm-completionIcon': {
      fontSize: '0.9em',
      opacity: 0.7,
    },
    // Lint gutter + underlines
    '.cm-lintRange-error':   { backgroundImage: 'none', borderBottom: '2px solid #f87171' },
    '.cm-lintRange-warning': { backgroundImage: 'none', borderBottom: '2px dotted #f59e0b' },
    '.cm-lintRange-info':    { backgroundImage: 'none', borderBottom: '2px dotted #38bdf8' },
    '.cm-diagnostic-error':  { borderLeft: '3px solid #f87171', paddingLeft: '6px' },
    '.cm-diagnostic-warning':{ borderLeft: '3px solid #f59e0b', paddingLeft: '6px' },
    '.cm-diagnostic-info':   { borderLeft: '3px solid #38bdf8', paddingLeft: '6px' },
  },
  { dark: true },
);

// ─── Static autocomplete ──────────────────────────────────────────────────────
// Covers traits, keywords, type keywords, built-in functions, and common snippets.
// Live LSP completions (hs_autocomplete MCP tool) are wired in CodeMirrorEditor.tsx.

function holoScriptCompletions(context: CompletionContext): CompletionResult | null {
  // @trait context: user typed @ or is mid-trait name
  const traitWord = context.matchBefore(/@[a-zA-Z_]\w*/);
  if (traitWord) {
    return {
      from: traitWord.from,
      options: BUILTIN_TRAITS.map((t) => ({
        label: t.name,
        type: 'class' as const,
        detail: t.detail,
        info: (): HTMLElement => {
          const el = document.createElement('div');
          el.style.cssText = 'padding:6px 8px;max-width:300px;font-size:12px;line-height:1.5';
          el.textContent = t.docs;
          return el;
        },
      })),
      validFor: /@[a-zA-Z_]\w*/,
    };
  }

  // Regular word context
  const word = context.matchBefore(/[a-zA-Z_]\w*/);
  if (!word || (word.from === word.to && !context.explicit)) return null;

  return {
    from: word.from,
    options: [
      ...KEYWORDS.map((kw) => ({ label: kw, type: 'keyword' as const })),
      ...TYPE_KEYWORDS.map((t) => ({ label: t, type: 'type' as const })),
      ...BUILTIN_FUNCTIONS.map((fn) =>
        snippetCompletion(`${fn}(\${0})`, {
          label: fn,
          type: 'function' as const,
          detail: 'built-in',
        }),
      ),
      snippetCompletion('scene "\${1:MyScene}" {\n\t\${0}\n}', {
        label: 'scene',
        type: 'keyword' as const,
        detail: 'scene block',
      }),
      snippetCompletion(
        'object \${1:MyObject} {\n\t@mesh { geometry: "\${2:box}" }\n\t@material { color: "\${3:#ffffff}" }\n\t\${0}\n}',
        { label: 'object', type: 'keyword' as const, detail: 'object block' },
      ),
      snippetCompletion('trait \${1:MyTrait} {\n\t\${0}\n}', {
        label: 'trait',
        type: 'keyword' as const,
        detail: 'trait definition',
      }),
      snippetCompletion(
        'world "\${1:MyWorld}" {\n\t@terrain { heightmap: "\${2:flat}" }\n\t@ambient_light { intensity: \${3:0.5} }\n\n\t\${0}\n}',
        { label: 'world', type: 'keyword' as const, detail: 'world block' },
      ),
      snippetCompletion(
        'object \${1:PhysicsObj} {\n\t@mesh { geometry: "\${2:sphere}" }\n\t@rigidbody { mass: \${3:1.0} }\n\t@collider { shape: "\${4:sphere}" }\n\t\${0}\n}',
        { label: 'physics-object', type: 'keyword' as const, detail: 'physics object' },
      ),
      snippetCompletion(
        'object \${1:NPC} {\n\t@mesh { geometry: "humanoid" }\n\t@ai_npc_brain { goals: ["\${2:patrol}"] }\n\t@dialogue { greeting: "\${3:Hello!}" }\n\t\${0}\n}',
        { label: 'npc', type: 'keyword' as const, detail: 'AI NPC object' },
      ),
    ],
    validFor: /[a-zA-Z_]\w*/,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const holoScriptLanguage = holoScriptStreamLang;

/** All CM6 extensions needed to edit HoloScript source in a CodeMirror view. */
export function holoScriptExtensions(): Extension[] {
  return [
    holoScriptStreamLang,
    syntaxHighlighting(holoScriptHighlightStyle),
    holoScriptTheme,
    autocompletion({ override: [holoScriptCompletions] }),
  ];
}
