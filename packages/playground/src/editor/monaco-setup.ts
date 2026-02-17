/**
 * Monaco Editor Setup for HoloScript Playground
 *
 * Registers the HoloScript language, syntax highlighting, and
 * connects to the language server for completions and diagnostics.
 */

export interface MonacoSetupOptions {
  containerId: string;
  initialValue?: string;
  theme?: 'holoscript-dark' | 'holoscript-light';
  onChange?: (value: string) => void;
  fontSize?: number;
}

/** Options for createEditor when passing container directly */
export interface PlaygroundEditorOptions {
  container: HTMLElement;
  initialValue?: string;
  theme?: 'holoscript-dark' | 'holoscript-light';
  onChange?: (value: string) => void;
  fontSize?: number;
}

export const HOLOSCRIPT_LANGUAGE_ID = 'holoscript';

/**
 * Register HoloScript as a Monaco language with syntax highlighting.
 * Must be called once before creating any editor instances.
 */
export function registerHoloScriptLanguage(monaco: typeof import('monaco-editor')): void {
  // Skip if already registered
  if (monaco.languages.getLanguages().some((l: { id: string }) => l.id === HOLOSCRIPT_LANGUAGE_ID)) return;

  // Register language ID
  monaco.languages.register({ id: HOLOSCRIPT_LANGUAGE_ID, extensions: ['.hsplus', '.holo'] });

  // Tokenizer rules (TextMate-compatible subset)
  monaco.languages.setMonarchTokensProvider(HOLOSCRIPT_LANGUAGE_ID, {
    keywords: ['orb', 'template', 'environment', 'logic', 'import', 'from'],
    directives: ['@manifest', '@zones', '@physics', '@grabbable', '@synced',
                 '@networked', '@accessible', '@alt_text', '@highlight', '@haptic',
                 '@shadow', '@constraint', '@chunk'],
    typeKeywords: ['true', 'false', 'null', 'undefined'],

    tokenizer: {
      root: [
        // Block comments
        [/\/\*/, 'comment', '@comment'],
        // Line comments
        [/\/\/.*$/, 'comment'],
        // @ directives
        [/@[a-zA-Z_]\w*/, {
          cases: {
            '@directives': 'keyword.control',
            '@default': 'type',
          },
        }],
        // Strings
        [/"([^"\\]|\\.)*"/, 'string'],
        // Numbers
        [/-?\d+(\.\d+)?/, 'number'],
        // Braces
        [/[{}[\]()]/, 'delimiter'],
        // Colon
        [/:/, 'delimiter'],
        // Identifiers / keywords
        [/[a-zA-Z_]\w*/, {
          cases: {
            '@keywords': 'keyword',
            '@typeKeywords': 'constant',
            '@default': 'identifier',
          },
        }],
        // Spread operator
        [/\.\.\./, 'operator'],
        // Operators
        [/[=><!~?:&|+\-*/^%]+/, 'operator'],
      ],
      comment: [
        [/[^/*]+/, 'comment'],
        [/\*\//, 'comment', '@pop'],
        [/[/*]/, 'comment'],
      ],
    },
  } as Parameters<typeof monaco.languages.setMonarchTokensProvider>[1]);

  // Auto-closing pairs
  monaco.languages.setLanguageConfiguration(HOLOSCRIPT_LANGUAGE_ID, {
    brackets: [['{', '}'], ['[', ']'], ['(', ')']],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"', notIn: ['string', 'comment'] },
    ],
    surroundingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '"', close: '"' },
    ],
    comments: { lineComment: '//', blockComment: ['/*', '*/'] },
    indentationRules: {
      increaseIndentPattern: /^[^}]*\{[^}]*$/,
      decreaseIndentPattern: /^\s*}/,
    },
  });
}

/**
 * Register the dark and light themes.
 */
export function registerThemes(monaco: typeof import('monaco-editor')): void {
  monaco.editor.defineTheme('holoscript-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword',         foreground: '569cd6' },
      { token: 'keyword.control', foreground: 'c586c0' },
      { token: 'type',            foreground: '4ec9b0' },
      { token: 'string',          foreground: 'ce9178' },
      { token: 'number',          foreground: 'b5cea8' },
      { token: 'comment',         foreground: '6a9955', fontStyle: 'italic' },
      { token: 'operator',        foreground: 'd4d4d4' },
      { token: 'constant',        foreground: '569cd6' },
    ],
    colors: {
      'editor.background': '#1e1e2e',
      'editor.lineHighlightBackground': '#2a2a3e',
    },
  });

  monaco.editor.defineTheme('holoscript-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'keyword',         foreground: '0000ff' },
      { token: 'keyword.control', foreground: 'af00db' },
      { token: 'type',            foreground: '267f99' },
      { token: 'string',          foreground: 'a31515' },
      { token: 'number',          foreground: '098658' },
      { token: 'comment',         foreground: '008000', fontStyle: 'italic' },
    ],
    colors: {},
  });
}

/**
 * Create and mount a Monaco editor.
 * Accepts either MonacoSetupOptions (containerId) or PlaygroundEditorOptions (container element).
 */
export function createEditor(
  monaco: typeof import('monaco-editor'),
  options: MonacoSetupOptions | PlaygroundEditorOptions
): ReturnType<typeof monaco.editor.create> {
  let container: HTMLElement | null;

  if ('container' in options) {
    container = options.container;
  } else {
    container = document.getElementById(options.containerId);
    if (!container) throw new Error(`Container #${options.containerId} not found`);
  }

  registerHoloScriptLanguage(monaco);
  registerThemes(monaco);

  const editor = monaco.editor.create(container, {
    value: options.initialValue ?? EXAMPLE_SCENES[0].source,
    language: HOLOSCRIPT_LANGUAGE_ID,
    theme: options.theme ?? 'holoscript-dark',
    fontSize: options.fontSize ?? 14,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    wordWrap: 'on',
    lineNumbers: 'on',
    tabSize: 2,
    automaticLayout: true,
  });

  if (options.onChange) {
    editor.onDidChangeModelContent(() => {
      options.onChange!(editor.getValue());
    });
  }

  return editor;
}

// ---------------------------------------------------------------------------
// Example Scenes
// ---------------------------------------------------------------------------

export const EXAMPLE_SCENES: Array<{ name: string; description: string; source: string }> = [
  {
    name: 'Hello Orb',
    description: 'A simple grabbable orb — your first HoloScript object.',
    source: `orb "Hello" {\n  color: "blue"\n  scale: 1.0\n  @physics { mass: 1.0 }\n  @grabbable\n}`,
  },
  {
    name: 'Physics Sandbox',
    description: 'A physics-enabled box and a static floor.',
    source: `orb "Ground" {\n  scale: [10, 0.1, 10]\n  position: [0, -0.05, 0]\n  @physics { isStatic: true }\n}\n\norb "Ball" {\n  color: "red"\n  scale: 0.4\n  position: [0, 3, 0]\n  @physics { mass: 0.5 restitution: 0.7 }\n  @grabbable\n}`,
  },
  {
    name: 'Multiplayer',
    description: 'Shared scene with synced state across users.',
    source: `@manifest { title: "Shared Space" maxPlayers: 4 }\n\norb "Cube" {\n  color: "purple"\n  @synced { properties: ["color"] authority: "last" }\n  @grabbable\n  logic "click" {\n    on_click: () => {\n      this.color = this.color === "purple" ? "orange" : "purple"\n    }\n  }\n}`,
  },
  {
    name: 'Gallery',
    description: 'Three artworks in a lit gallery environment.',
    source: `environment "Gallery" {\n  ambientColor: "#f5f0ea"\n  ambientIntensity: 0.8\n}\n\ntemplate "Artwork" {\n  scale: [0.8, 1.0, 0.05]\n  @accessible { role: "artwork" }\n}\n\norb "Painting1" { ...Artwork  color: "#e63946"  position: [-3, 1.5, -5] }\norb "Painting2" { ...Artwork  color: "#2a9d8f"  position: [0,  1.5, -5] }\norb "Painting3" { ...Artwork  color: "#e9c46a"  position: [3,  1.5, -5] }`,
  },
  {
    name: 'Accessible UI',
    description: 'A button with screen-reader, haptic, and keyboard support.',
    source: `orb "Button" {\n  color: "#4caf50"\n  scale: [0.6, 0.2, 0.05]\n  position: [0, 1.5, -2]\n  @accessible { role: "button" label: "Confirm action" }\n  @alt_text { description: "A green confirmation button" }\n  @highlight\n  @haptic { intensity: 0.5 }\n}`,
  },
];
