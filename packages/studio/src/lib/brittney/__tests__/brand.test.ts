import { describe, expect, it } from 'vitest';

import {
  BRITTNEY_IDENTITY_MARK,
  BRITTNEY_KATEX_COMPACT_MARK,
  BRITTNEY_KATEX_COMPACT_MARK_MARKDOWN,
  BRITTNEY_KATEX_MARK,
  BRITTNEY_KATEX_MARK_MARKDOWN,
  BRITTNEY_USERNAME_FALLBACKS,
} from '../brand';
import { SYSTEM_PROMPT } from '../systemPrompt';

describe('Brittney brand identity mark', () => {
  it('keeps the primary KaTeX mark copy-paste safe for markdown', () => {
    expect(BRITTNEY_KATEX_MARK).toBe(String.raw`x^{ai}\text{Brittney}`);
    expect(BRITTNEY_KATEX_MARK_MARKDOWN).toBe(String.raw`\( x^{ai}\text{Brittney} \)`);
  });

  it('keeps the compact mark and username fallbacks stable', () => {
    expect(BRITTNEY_KATEX_COMPACT_MARK).toBe(String.raw`^{ai}\text{Brittney}`);
    expect(BRITTNEY_KATEX_COMPACT_MARK_MARKDOWN).toBe(String.raw`\( ^{ai}\text{Brittney} \)`);
    expect(BRITTNEY_USERNAME_FALLBACKS).toEqual(['aiBrittney', 'xaiBrittney']);
  });

  it('exposes one structured identity token for UI and prompt callers', () => {
    expect(BRITTNEY_IDENTITY_MARK).toMatchObject({
      primaryKatex: BRITTNEY_KATEX_MARK,
      primaryMarkdown: BRITTNEY_KATEX_MARK_MARKDOWN,
      compactKatex: BRITTNEY_KATEX_COMPACT_MARK,
      compactMarkdown: BRITTNEY_KATEX_COMPACT_MARK_MARKDOWN,
      usernameFallbacks: BRITTNEY_USERNAME_FALLBACKS,
    });
  });

  it('teaches Brittney to use the mark without hardcoding it twice', () => {
    expect(SYSTEM_PROMPT).toContain(BRITTNEY_IDENTITY_MARK.primaryMarkdown);
    expect(SYSTEM_PROMPT).toContain(BRITTNEY_IDENTITY_MARK.compactMarkdown);
    expect(SYSTEM_PROMPT).toContain('aiBrittney, xaiBrittney');
  });
});
