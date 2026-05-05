export const BRITTNEY_KATEX_MARK = String.raw`x^{ai}\text{Brittney}`;
export const BRITTNEY_KATEX_MARK_MARKDOWN = String.raw`\( x^{ai}\text{Brittney} \)`;
export const BRITTNEY_KATEX_COMPACT_MARK = String.raw`^{ai}\text{Brittney}`;
export const BRITTNEY_KATEX_COMPACT_MARK_MARKDOWN = String.raw`\( ^{ai}\text{Brittney} \)`;
export const BRITTNEY_USERNAME_FALLBACKS = ['aiBrittney', 'xaiBrittney'] as const;

export const BRITTNEY_IDENTITY_MARK = {
  primaryKatex: BRITTNEY_KATEX_MARK,
  primaryMarkdown: BRITTNEY_KATEX_MARK_MARKDOWN,
  compactKatex: BRITTNEY_KATEX_COMPACT_MARK,
  compactMarkdown: BRITTNEY_KATEX_COMPACT_MARK_MARKDOWN,
  usernameFallbacks: BRITTNEY_USERNAME_FALLBACKS,
} as const;
