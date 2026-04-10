import * as vscode from 'vscode';
import { ALL_TRAITS } from './completionProvider';

/**
 * Build a lookup map from trait name (without @) to its definition
 * for O(1) hover resolution.
 */
const traitLookup = new Map(
  ALL_TRAITS.map((t) => [t.label.slice(1), t]) // strip leading '@'
);

/**
 * HoloScript Hover Provider
 *
 * Shows documentation when the user hovers over a trait decorator (@trait_name).
 * Covers all 56 registered runtime traits with category, description, and
 * parameter documentation.
 */
export class HoloScriptHoverProvider implements vscode.HoverProvider {
  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Hover> {
    // Expand the word range to include the '@' prefix
    const wordRange = document.getWordRangeAtPosition(position, /@[a-zA-Z_][a-zA-Z0-9_]*/);
    if (!wordRange) {
      return undefined;
    }

    const word = document.getText(wordRange); // e.g. "@grabbable"
    const traitName = word.slice(1); // e.g. "grabbable"

    const trait = traitLookup.get(traitName);
    if (!trait) {
      return undefined;
    }

    // Build a rich Markdown hover card
    const md = new vscode.MarkdownString();
    md.isTrusted = true;
    md.supportHtml = true;

    md.appendMarkdown(`### ${trait.label}\n\n`);
    md.appendMarkdown(`**Category:** ${trait.category}\n\n`);
    md.appendMarkdown(`${trait.documentation}\n\n`);
    md.appendMarkdown(`---\n\n`);
    md.appendCodeblock(
      `${trait.label.slice(1).includes('(') ? trait.label : '@' + trait.insertText}`,
      'holoscript'
    );

    return new vscode.Hover(md, wordRange);
  }
}
