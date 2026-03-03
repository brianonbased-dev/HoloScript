import { describe, it, expect } from 'vitest';
import { CompletionProvider } from '../lsp/CompletionProvider';
import { DiagnosticProvider, DiagnosticContext } from '../lsp/DiagnosticProvider';
import { LanguageService } from '../lsp/LanguageService';

describe('LSP Foundation', () => {
    describe('CompletionProvider', () => {
        it('Returns trait completions on @ trigger', () => {
            const provider = new CompletionProvider();
            const items = provider.getCompletions({ prefix: '', triggerChar: '@' });
            expect(items.length).toBeGreaterThan(5);
            expect(items.some(i => i.label === 'grabbable')).toBe(true);
        });

        it('Filters completions by prefix', () => {
            const provider = new CompletionProvider();
            const items = provider.getCompletions({ prefix: '@au', triggerChar: '@' });
            expect(items.some(i => i.label === 'audio')).toBe(true);
            expect(items.every(i => i.label.startsWith('au') || i.label.startsWith('author'))).toBe(true);
        });

        it('Returns node types with no prefix', () => {
            const provider = new CompletionProvider();
            const items = provider.getCompletions({ prefix: '' });
            expect(items.some(i => i.label === 'box')).toBe(true);
            expect(items.some(i => i.label === 'sphere')).toBe(true);
        });

        it('Registers custom trait completions', () => {
            const provider = new CompletionProvider();
            provider.registerTrait({ label: 'myCustom', kind: 'trait', detail: 'Custom trait' });
            const items = provider.getCompletions({ prefix: '', triggerChar: '@' });
            expect(items.some(i => i.label === 'myCustom')).toBe(true);
        });
    });

    describe('DiagnosticProvider', () => {
        it('Flags unknown directives', () => {
            const provider = new DiagnosticProvider();
            const ctx: DiagnosticContext = {
                nodes: [{
                    type: 'box',
                    directives: [{ name: 'nonexistent' }],
                    loc: { start: { line: 5, column: 1 }, end: { line: 5, column: 15 } },
                }],
                knownTraits: new Set(),
            };

            const diags = provider.diagnose(ctx);
            expect(diags).toHaveLength(1);
            expect(diags[0].severity).toBe('warning');
            expect(diags[0].code).toBe('HS001');
        });

        it('Allows known traits in directives', () => {
            const provider = new DiagnosticProvider();
            const ctx: DiagnosticContext = {
                nodes: [{
                    type: 'box',
                    directives: [{ name: 'grabbable' }],
                }],
                knownTraits: new Set(['grabbable']),
            };

            const diags = provider.diagnose(ctx);
            expect(diags).toHaveLength(0);
        });

        it('Warns about empty groups', () => {
            const provider = new DiagnosticProvider();
            const ctx: DiagnosticContext = {
                nodes: [{ type: 'group', name: 'emptyGroup', children: [] }],
                knownTraits: new Set(),
            };

            const diags = provider.diagnose(ctx);
            expect(diags).toHaveLength(1);
            expect(diags[0].severity).toBe('warning');
            expect(diags[0].code).toBe('HS002');
        });

        it('Hints about deprecated nodes', () => {
            const provider = new DiagnosticProvider();
            const ctx: DiagnosticContext = {
                nodes: [{
                    type: 'box', name: 'oldBox',
                    directives: [{ name: 'deprecated' }],
                }],
                knownTraits: new Set(),
            };

            const diags = provider.diagnose(ctx);
            expect(diags.some(d => d.code === 'HS003')).toBe(true);
        });

        it('Supports custom rules', () => {
            const provider = new DiagnosticProvider();
            provider.addRule({
                id: 'CUSTOM01',
                check: () => [{ severity: 'info', message: 'Custom check', line: 1, column: 1, source: 'test' }],
            });

            const diags = provider.diagnose({ nodes: [], knownTraits: new Set() });
            expect(diags.some(d => d.message === 'Custom check')).toBe(true);
        });
    });

    describe('LanguageService', () => {
        it('Provides completions', () => {
            const ls = new LanguageService();
            const items = ls.getCompletions('', '@');
            expect(items.length).toBeGreaterThan(0);
        });

        it('Provides diagnostics', () => {
            const ls = new LanguageService();
            const diags = ls.getDiagnostics({
                nodes: [{ type: 'box', directives: [{ name: 'fake' }] }],
                knownTraits: new Set(),
            });
            expect(diags.length).toBeGreaterThan(0);
        });

        it('Provides hover info for known symbols', () => {
            const ls = new LanguageService();
            const hover = ls.getHoverInfo('box');
            expect(hover).not.toBeNull();
            expect(hover!.contents).toContain('box');
        });

        it('Returns null for unknown hover symbols', () => {
            const ls = new LanguageService();
            expect(ls.getHoverInfo('xyzzy')).toBeNull();
        });

        it('Lists known symbols', () => {
            const ls = new LanguageService();
            const symbols = ls.getKnownSymbols();
            expect(symbols.length).toBeGreaterThan(5);
            expect(symbols).toContain('box');
            expect(symbols).toContain('@grabbable');
        });
    });
});
