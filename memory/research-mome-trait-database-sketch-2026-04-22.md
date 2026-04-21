# MoME (Mixture of Memory Experts) — sketch for trait knowledge routing

**Board:** `task_1776394509341_be7k`  
**Source audit:** `2026-03-10_confabulation-vw-backprop-AUTONOMIZE.md`

## Intent

Route **trait documentation / examples / WPG entries** through **multiple specialist retrieval heads** (“experts”) instead of one undifferentiated embedding index—e.g. **physics**, **networking**, **rendering**, **AI**—so agents retrieve **narrow, less confusable** contexts. This is a **design sketch**, not a trained model in-repo.

## Existing anchors (where memory already lives)

| Layer | Path | Use in MoME |
|-------|------|-------------|
| Trait skill / dispatch | `packages/core/src/traits/SkillRegistryTrait.ts` | Per-agent **skills** bucket — analogy to “expert output heads” |
| Shared agent memory | `packages/core/src/traits/BlackboardTrait.ts` | Runtime facts; **not** a substitute for static trait docs |
| Knowledge consolidation | `packages/framework/src/knowledge/brain.ts` (exported via `@holoscript/framework`) | Half-life, domains — temporal memory policy |
| GraphRAG over code/docs | `packages/absorb-service/src/engine/GraphRAGEngine.ts` | **Retrieve** + graph fan-out — backbone for “experts” as **tagged subgraphs** |
| LSP / trait docs | `packages/core/src/traits/constants/*.ts`, trait handlers | Authoritative **symbol** ground truth |

## Proposed MoME layout (conceptual)

1. **Partition** the absorb graph by `domain` / folder prefix / manual tag → **expert id** ∈ {physics, render, net, ai, studio, …}.  
2. **Query:** embed once → **top-k per expert** (small k) → **merge** with fixed weights or learned router (future).  
3. **Guardrail:** if top experts disagree above threshold, return **abstain** + request human tag (confabulation control).

## Minimal prototype (engineering path)

- Extend `absorb_query` / GraphRAG filter params to accept **`expert`** or **`file:` prefix sets** (already similar to `GraphRAGOptions.file`).  
- Add Vitest: same query restricted to two disjoint prefixes → disjoint top symbol sets.

## Out of scope (for this memo)

- Training neural **routers** — needs dataset + labels.  
- Replacing `TraitTypes` or compiler registration — **retrieval only**.
