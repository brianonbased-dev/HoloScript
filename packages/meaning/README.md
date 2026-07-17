# @holoscript/meaning

**HoloMeaning** — the stratum-② meaning contract of the HoloScript language.

A language has three strata: **① surface** (what you write — `.holo` / `.hsplus` / `.hs`),
**② meaning** (what it means — this package), and **③ execution** (what it does — the VMs).
This package is the ONE home of the meaning contract: the resolution record
(`MeaningResolution` — a committed answer or an honest abstention with a typed reason), its
status union, and its gap taxonomy. The compiler, the reward layer, the corpus graders, and
the VMs all **import** this definition; nothing re-declares it. The `check:language-strata`
gate fails any second definition.

Canon: `docs/spec/language-architecture.md`. Grandfathered `UAAL*` type names are exported as
aliases and re-exported by `@holoscript/uaal`, so existing consumers are unchanged.

```ts
import { structuredGap, type MeaningResolution } from '@holoscript/meaning';

const abstained: MeaningResolution = {
  query: 'occluded',
  status: 'unresolvable',
  reason: 'underdetermined',
  gap: structuredGap('containment', 'containment.opacity_unstated', 'underdetermined'),
};
```

Stage 2 of the extraction (`language-architecture.md` §8) moves the family semantics
(`resolve*` bodies) here as well; until then `@holoscript/uaal` remains the resolver home.
