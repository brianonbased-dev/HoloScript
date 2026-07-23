# `.holo` scene-to-HoloMeaning containment perceiver

Date: 2026-07-23
Board task: `task_1784665811685_6nyc`
Scope: first executable `.holo` slice of the wider `.holo` / glTF / URDF
scene-to-meaning perceiver.

## Decision

`perceiveContainmentIR(source)` lives in `@holoscript/core`, not
`@holoscript/meaning`.

The dependency direction is:

```text
.holo source
  -> HoloCompositionParser          (surface syntax, @holoscript/core)
  -> HoloContainmentPerceiver       (surface adapter, @holoscript/core)
  -> UAALContainmentIR              (HoloMeaning, @holoscript/meaning)
  -> resolveOcclusion / resolveAccess / crossFamilyConsistency
```

Core already owns the canonical `.holo` parser and depends on the
parser-independent meaning package. Moving parser knowledge into HoloMeaning
would invert the language strata and make every future surface or import format
a dependency of the one shared meaning layer.

## Grounded mapping

The adapter walks the parser AST; it does not regex or rescan source text.

| `.holo` AST fact                              | Containment IR fact                                                   |
| --------------------------------------------- | --------------------------------------------------------------------- |
| composition                                   | transparent structural `region`                                       |
| named scene                                   | distinct structural `region`; cross-scene boundary remains unknown    |
| spatial group                                 | recursively contained `region`; authored barrier properties preserved |
| object declaration                            | semantic entity                                                       |
| nested object                                 | `inner -> outer` containment relation                                 |
| `kind: "..."` or HSI-compatible `role: "..."` | entity `kind`                                                         |
| `label: "..."`                                | entity `label`                                                        |
| `id`, `semantic_id`, or `semanticId`          | explicit semantic identifier                                          |
| `opaque: true`                                | definitely opaque                                                     |
| `opaque: false`                               | definitely transparent                                                |
| no `opaque` property                          | opacity unstated; field remains absent                                |
| `blocks: [...]`                               | definitely blocked modalities                                         |
| `blocks_unknown: [...]`                       | explicitly unstated modalities                                        |

An object without an explicit kind becomes `container` when it has children and
`object` otherwise. A parsed `spatial_agent` becomes `agent`.

The composition node is a parser-created organization region, not a physical
barrier, so its opacity and modality blocking are explicitly clear. Named scenes
are separate world contexts: the adapter leaves their visual boundary unstated
and audible boundary explicitly unknown. A query whose entities share a scene
stops at that common ancestor; a query crossing scenes therefore abstains rather
than inventing co-presence. Spatial groups are authored nodes: they default
structurally clear, but an explicit `opaque`, `blocks`, or `blocks_unknown`
declaration is preserved. An authored object that contains another object is
potentially physical; its missing opacity stays unknown.

## Honesty and failure policy

The perceiver preserves the resolver's three-state distinctions:

- `opaque: true`
- `opaque: false`
- `opaque` absent

It never converts absence to false. Likewise, `blocks_unknown` stays distinct
from a missing/empty `blocks` list. A modality cannot be both definitely blocked
and explicitly unknown.

The adapter also fails closed when:

- two nodes lower to the same semantic ID;
- exact semantic keys are duplicated or aliases conflict;
- a meaning-bearing property has the wrong value type;
- `blocks` and `blocks_unknown` overlap;
- an attached query names an entity not present in the perceived scene; or
- the canonical parser rejects the source.

This first slice also rejects unresolved imports, template-backed objects,
conditional/iterated scene membership, and platform-constrained objects or
groups. Accepting any of those without dependency/template expansion or a target
platform would make a partial world look complete.

The caller may attach a query, but the adapter never guesses an agent/object
pair. Guessing would turn scene inventory into an unsupported semantic claim.

## Provenance

The IR carries a `perception` envelope naming:

- format `.holo`;
- parser `HoloCompositionParser`;
- composition name; and
- SHA-256 digest of normalized source text; and
- optional caller-supplied source ID.

Every perceived entity and containment edge carries the same authority plus
its AST path and source line/column. This lets an agent explain which declaration
caused a resolved verdict or honest abstention without retaining a second
hand-built scene graph.

## Real fixture and done test

`packages/core/src/semantics/__tests__/fixtures/containment-world.holo` contains
one observer and four nested containers:

- opaque;
- explicitly transparent;
- opacity unstated; and
- audible blocking unstated.

The focused test parses that file through the real parser and proves:

1. entities, edges, source locations, and query are preserved;
2. all three opacity states reach the expected `resolveOcclusion` outcomes;
3. `blocks_unknown` reaches `resolveAccess` as an honest abstention;
4. `crossFamilyConsistency` reports no contradiction for the perceived opaque
   scene; and
5. ambiguous or contradictory annotations fail closed.
6. imports, templates, dynamic membership, and platform-dependent membership
   fail closed instead of yielding partial certainty;
7. cross-scene questions abstain instead of treating named scenes as co-present;
   and
8. the public runtime and declaration surfaces expose the same typed API.

Command:

```powershell
pnpm --filter @holoscript/core exec vitest run src/semantics/__tests__/HoloContainmentPerceiver.test.ts --maxWorkers=1
pnpm exec holoscript parse packages/core/src/semantics/__tests__/fixtures/containment-world.holo --json
pnpm --filter @holoscript/core build
pnpm exec tsc --noEmit --strict --target ES2020 --module NodeNext --moduleResolution NodeNext --skipLibCheck packages/core/test/public-types/HoloContainmentPerceiver.consumer.ts
pnpm check:language-strata:strict
```

## Deliberate limits of this slice

This pass perceives declared, concrete containment in composition objects,
named scenes, and spatial groups. It rejects, rather than silently projects:

- unresolved imports;
- template-backed objects;
- runtime branches in conditionals or iterators;
- platform-constrained objects/groups without a target platform.

It does not yet:

- infer visibility from geometry, transforms, materials, or physics;
- perceive NPC/zone/domain-specific declarations as containment;
- import glTF node trees; or
- import URDF links/joints.

Those are separate evidence-bearing adapters. glTF and URDF should lower into
the same `UAALContainmentIR` contract, with format-specific provenance, rather
than extending HoloMeaning with parser/importer dependencies. Cross-format
consistency can then compare resolver outcomes over one meaning substrate.

## Why this matters for agents

This creates an agent-efficiency mechanism, not yet a quantified speed or token
claim. After canonical parsing, lowering is one linear walk over the selected
objects, groups, and meaning-bearing properties; the resulting storage is
linear in semantic entities plus containment edges. Agents can then reuse that
typed relation graph across resolvers and cite originating declarations instead
of reconstructing nesting in each prompt or inventing a separate JSON schema per
tool. A follow-up benchmark should measure end-to-end parser/lower latency,
resident graph size, and prompt-token reduction on representative worlds before
claiming a numeric improvement.

The language novelty is the compositional seam: spatial source syntax and
imported world formats can converge on the same honest-abstention semantics that
agent rewards, runtime checks, and cross-family consistency already consume.
