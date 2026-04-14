# Intelligence Package Architecture Decision

**Date**: 2026-04-05  
**Task**: A.011.02g - Evaluate merging intelligence package into @holoscript/framework  
**Decision**: RECOMMENDATION - Merge as sub-module

---

## Current Architecture Assessment

### Where Intelligence Exists

1. **@holoscript/framework** (framework/src/knowledge/):
   - `knowledge-store.ts` - Persistent storage
   - `brain.ts` - Neuroscience consolidation model (KNOWLEDGE_DOMAINS, consolidation config)
   - `consolidation.ts` - State machine for hot/cold storage transitions

2. **@holoscript/absorb-service** (packages/mcp-server):
   - Self-improvement pipeline
   - Graph RAG functionality
   - Semantic search
   - Auto-fix capabilities

3. **@holoscript/core** (packages/core/src/):
   - Analysis modules (analysis/)
   - Codebase intelligence (codebase/)
   - Various utility analyzers

### Overlap Analysis

| Concern         | framework.knowledge        | absorb-service        | overlap                 |
| --------------- | -------------------------- | --------------------- | ----------------------- |
| Consolidation   | ✅ Hot/cold model          | ✅ Recursive pipeline | YES - can unify         |
| Reconsolidation | ✅ Event triggers          | ✅ Improvement loop   | YES - same concept      |
| Domain config   | ✅ 40+ domains             | ✅ Uses domains       | YES - single source     |
| Storage model   | ✅ hot_buffer + cold_store | ✅ Graph DB           | PARTIAL - design choice |

### Pattern Match

- Framework: **Knowledge consolidation engine** (neuroscience-inspired state machine)
- Absorb: **Intelligence improvement pipeline** (applies consolidation iteratively)
- These are **complementary**, not competing - absorb uses framework consolidation as substrate

---

## Decision: MERGE as Sub-Module

### Recommendation

Merge absorb-service intelligence capabilities into `@holoscript/framework` as `framework.intelligence` sub-module:

- **Consolidate domain config** - single KNOWLEDGE_DOMAINS source of truth
- **Unify reconsolidation** - framework handles state machine, absorb/agents subscribe to reconsolidation events
- **Keep absorb-service as thin wrapper** - absorb remains the production service, imports from framework
- **Benefit**: Cleaner architecture, reduces import paths, framework becomes the definitive "knowledge substrate"

### Implementation

1. Extract absorb-service intelligence logic into framework.intelligence module
2. Consolidate domain configuration (currently split across three places)
3. Create unified reconsolidation event bus
4. Update @holoscript/absorb-service to import from framework.intelligence
5. Maintain existing APIs for backward compatibility

### Timeline

- Phase-2: Architecture evaluation ✅ (THIS TASK)
- Phase-3: A.011.03x - Intelligence package extraction + consolidation

---

## Technical Rationale

**Why merge?**

- Single domain configuration (KNOWLEDGE_DOMAINS) is source of truth
- Consolidation engine + improvement pipeline are complementary halves of same system
- Framework owns the "memory model", absorb should use framework as substrate
- Reduces cross-package imports and circular dependencies

**Why not keep separate (Adapter approach)?**

- Would require duplication of domain configuration
- Loses the elegant embedding of neuroscience pattern in framework core
- Adapter layer adds cognitive overhead for developers
- Blocks optimization opportunities across consolidation + improvement

---

## Next Steps

1. Update board: Mark A.011.02g as CLOSED - merge recommended
2. Create A.011.03x follow-up task for actual intelligence extraction
3. Reference this doc in Phase-3 planning
