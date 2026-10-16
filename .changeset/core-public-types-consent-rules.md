---
'@holoscript/core': patch
---

core public types: export `ConsentRules` and `LikenessSource` from the package root, and add `consentRules` (HS1011 likeness consent, #590) and `knownTraits` (HS1006) to `CanonicalSourceValidationRequest`. The hand-maintained declarations in `scripts/generate-types.mjs` had drifted from `CanonicalSourceValidator.ts`, which broke `@holoscript/lsp`'s declaration build. A root-only public-types canary now covers it.
