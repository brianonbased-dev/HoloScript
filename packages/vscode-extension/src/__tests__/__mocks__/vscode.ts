/**
 * Minimal mock of the VS Code API for unit testing.
 *
 * Only the parts used by the production code at module-load time need real
 * behaviour; the rest can be stubs.
 */

// ---------------------------------------------------------------------------
// SemanticTokensLegend - used at the top level in semanticTokensProvider.ts
// ---------------------------------------------------------------------------
export class SemanticTokensLegend {
  tokenTypes: string[];
  tokenModifiers: string[];
  constructor(tokenTypes: string[], tokenModifiers: string[]) {
    this.tokenTypes = tokenTypes;
    this.tokenModifiers = tokenModifiers;
  }
}

// ---------------------------------------------------------------------------
// SemanticTokensBuilder - used inside the provider methods
// ---------------------------------------------------------------------------
export class SemanticTokensBuilder {
  private legend: SemanticTokensLegend;
  constructor(legend: SemanticTokensLegend) {
    this.legend = legend;
  }
  push(
    _line: number,
    _startChar: number,
    _length: number,
    _tokenType: number,
    _tokenModifiers: number
  ) {}
  build() {
    return { data: new Uint32Array(0) };
  }
}

// ---------------------------------------------------------------------------
// Position / Range - used in the range provider
// ---------------------------------------------------------------------------
export class Position {
  line: number;
  character: number;
  constructor(line: number, character: number) {
    this.line = line;
    this.character = character;
  }
}

export class Range {
  start: Position;
  end: Position;
  constructor(start: Position | number, end: Position | number, endChar?: number) {
    if (typeof start === 'number') {
      this.start = new Position(start, end as number);
      this.end = new Position(endChar as number, 0);
    } else {
      this.start = start as Position;
      this.end = end as Position;
    }
  }
}

// ---------------------------------------------------------------------------
// Completion API - used in completionProvider.ts
// ---------------------------------------------------------------------------
export enum CompletionItemKind {
  Text = 0,
  Method = 1,
  Function = 2,
  Constructor = 3,
  Field = 4,
  Variable = 5,
  Class = 6,
  Interface = 7,
  Module = 8,
  Property = 9,
  Unit = 10,
  Value = 11,
  Enum = 12,
  Keyword = 13,
  Snippet = 14,
  Color = 15,
  File = 16,
  Reference = 17,
  Folder = 18,
}

export class CompletionItem {
  label: string;
  kind?: CompletionItemKind;
  detail?: string;
  sortText?: string;
  insertText?: string | SnippetString;
  documentation?: MarkdownString | string;
  constructor(label: string, kind?: CompletionItemKind) {
    this.label = label;
    this.kind = kind;
  }
}

export class CompletionList {
  items: CompletionItem[];
  isIncomplete: boolean;
  constructor(items: CompletionItem[] = [], isIncomplete = false) {
    this.items = items;
    this.isIncomplete = isIncomplete;
  }
}

// ---------------------------------------------------------------------------
// SnippetString / MarkdownString
// ---------------------------------------------------------------------------
export class SnippetString {
  value: string;
  constructor(value: string) {
    this.value = value;
  }
}

export class MarkdownString {
  value: string;
  isTrusted: boolean = false;
  supportHtml: boolean = false;
  constructor(value = '') {
    this.value = value;
  }
  appendMarkdown(value: string): MarkdownString {
    this.value += value;
    return this;
  }
  appendCodeblock(value: string, _language?: string): MarkdownString {
    this.value += value;
    return this;
  }
}

// ---------------------------------------------------------------------------
// Hover - used in hoverProvider.ts
// ---------------------------------------------------------------------------
export class Hover {
  contents: MarkdownString | MarkdownString[];
  range?: Range;
  constructor(contents: MarkdownString | MarkdownString[], range?: Range) {
    this.contents = contents;
    this.range = range;
  }
}

// ---------------------------------------------------------------------------
// CancellationToken stub
// ---------------------------------------------------------------------------
export class CancellationTokenSource {
  token = {
    isCancellationRequested: false,
    onCancellationRequested: () => ({ dispose: () => {} }),
  };
  cancel() {}
  dispose() {}
}
