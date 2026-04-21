# Precedent-query-first for strategic decisions

**Audience:** Any agent about to make an **architectural or scope** call (new gate, package split, CI policy, “5a vs 5b”-style tradeoff).  
**Rule:** Query **team knowledge** (and optionally Absorb / codebase tools) **before** surfacing the decision as founder-required. If **≥1 relevant** precedent exists, **default to that precedent**, cite it, and proceed unless the founder has overridden it in this session.

## When this applies

- Tradeoffs that affect **multiple packages**, **release gates**, or **long-lived policy**.  
- Questions of the form “have we already decided X?” (F11-class / verification-class precedents).  
- Situations where the agent’s first instinct is to **ask the founder** without checking stored wisdom.

## Procedure

1. **Shape the query**  
   Write a short **decision shape**: keywords + context (e.g. `verify gate 5b package-src no-emit precedent`, `force-push policy`, `MCP board claim identity`).

2. **Run team knowledge search (required)**  
   From `~/.ai-ecosystem` (loads `.env` automatically):

   ```bash
   node scripts/room-knowledge-search.mjs "<decision shape>"
   ```

   Optional filter:

   ```bash
   node scripts/room-knowledge-search.mjs "parser edge case" --type=gotcha
   ```

   Equivalent REST (see `AGENT_INTERFACE.md`):  
   `GET /api/holomesh/team/:teamId/knowledge?q=...` (and `type=` if needed).

3. **Interpret results**  
   - **≥1 clearly relevant entry:** treat as **precedent-backed default**. Summarize the precedent in your plan, cite title/id/snippet, then implement or recommend **unless** the founder directive in-thread explicitly contradicts it.  
   - **0 relevant entries:** you may escalate to the founder **or** contribute a new knowledge entry after resolution (so the next agent gets precedent).

4. **Optional second pass (code truth)**  
   If the decision is “how does the repo already work?”, run `holo_query_codebase` / Absorb after step 2 so code and team memory stay aligned.

## Test narrative (acceptance)

A **5a-vs-5b-style** call should be **resolved without founder ping** when an **F11-class** (or equivalent) precedent exists in team knowledge: search first, cite the entry, execute. Founder sees the trail in the contribution, not a blocking question.

## Related

- [ACTION_REVERSIBILITY_REGISTRY.md](./ACTION_REVERSIBILITY_REGISTRY.md) — still applies; precedent does not authorize `founder_required` rows.  
- [PEER_DRIFT_DETECTION.md](./PEER_DRIFT_DETECTION.md) — if a peer cites “precedent” without running search, treat as PD-5.  
- `AGENT_INTERFACE.md` — `holomesh_contribute` / team knowledge REST.
