/**
 * LanguageService.ts
 *
 * Top-level HoloScript+ Language Service.
 * Combines parsing, completions, diagnostics, and hover info
 * into a single API for editor/IDE integration.
 */

import { CompletionProvider, CompletionItem } from './CompletionProvider';
import { DiagnosticProvider, Diagnostic, DiagnosticContext } from './DiagnosticProvider';

export interface HoverInfo {
  contents: string;
  range?: { startLine: number; startCol: number; endLine: number; endCol: number };
}

/**
 * Built-in hover documentation for HoloScript primitives and traits.
 * 
 * Maps HoloScript symbol names to their hover documentation strings that appear
 * in editors when users hover over or request info about these symbols. Each
 * entry includes the symbol name, description, and available properties/config.
 * 
 * Used by {@link LanguageService.getHover} to provide contextual help for
 * built-in HoloScript primitives (box, sphere, panel) and traits (@grabbable,
 * @audio, @particles, etc.) during development.
 * 
 * This is exported to allow other tools and IDE extensions to access the same
 * documentation strings that the core language service uses.
 * 
 * @example
 * ```typescript
 * import { HOVER_DOCS } from '@holoscript/core/lsp';
 * 
 * // Get documentation for the box primitive
 * const boxDoc = HOVER_DOCS.box;
 * console.log(boxDoc); // "**box** — 3D box primitive..."
 * 
 * // Get documentation for a trait
 * const grabbableDoc = HOVER_DOCS['@grabbable'];
 * ```
 * 
 * @public
 */
export const HOVER_DOCS: Record<string, string> = {
  box: '**box** — 3D box primitive\n\nProperties: position, rotation, scale, color, opacity',
  sphere:
    '**sphere** — 3D sphere primitive\n\nProperties: position, rotation, scale, color, radius',
  panel: '**panel** — UI panel container\n\nProperties: width, height, color, border, opacity',
  button: '**button** — Interactive UI button\n\nProperties: text, color, onClick',
  text: '**text** — Text display element\n\nProperties: value, fontSize, color, align',
  group: '**group** — Container for child nodes\n\nUsed to organize scene hierarchy',
  '@grabbable': '**@grabbable** — Makes node grabbable in VR\n\nConfig: mass, throwable, snapZone',
  '@audio': '**@audio** — Attaches spatial audio\n\nConfig: sound, volume, loop, maxDistance',
  '@particles': '**@particles** — Attaches particle system\n\nConfig: preset, rate, lifetime',
  '@state': '**@state** — Attaches state machine\n\nConfig: initial, states, transitions',
  '@sync': '**@sync** — Network synchronization\n\nConfig: syncRate, syncProperties, authority',
  '@theme': '**@theme** — Applies theme styling\n\nConfig: classes, states, inline',
  '@animation': '**@animation** — Keyframe animation\n\nConfig: clip, duration, easing, loop',
  '@events': '**@events** — Event bus wiring\n\nConfig: listen, emitOnAttach, emitOnDetach',
};

export class LanguageService {
  readonly completions: CompletionProvider;
  readonly diagnostics: DiagnosticProvider;

  constructor() {
    this.completions = new CompletionProvider();
    this.diagnostics = new DiagnosticProvider();
  }

  /**
   * Get completions at a cursor position.
   */
  getCompletions(prefix: string, triggerChar?: string): CompletionItem[] {
    return this.completions.getCompletions({ prefix, triggerChar });
  }

  /**
   * Get diagnostics for a set of parsed nodes.
   */
  getDiagnostics(context: DiagnosticContext): Diagnostic[] {
    return this.diagnostics.diagnose(context);
  }

  /**
   * Get hover info for a symbol.
   */
  getHoverInfo(symbol: string): HoverInfo | null {
    const doc = HOVER_DOCS[symbol] || HOVER_DOCS[`@${symbol}`];
    if (!doc) return null;
    return { contents: doc };
  }

  /**
   * Get all known symbols for go-to-definition support.
   */
  getKnownSymbols(): string[] {
    return Object.keys(HOVER_DOCS);
  }
}
