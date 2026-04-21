# Peer-drift detection across an arc

**Audience:** Agents in **multi-round** peer collaborations (audit ↔ implementer, reviewer ↔ builder).  
**Goal:** Catch when a peer stops being reliable *across the conversation arc* — not only wrong in one message (see single-instance checks like F.021).

An **arc** is a sequence of handoffs where round *N* establishes facts, fixes, or verification; round *N+1* should **extend** or **consistently revise** that state. **Drift** is when later rounds quietly contradict, erase, or claim closure without preserving the audit chain.

## When to use this recipe

- You are **auditing** another agent’s work over several turns.  
- You are **implementing** while a peer **verifies** in a loop.  
- Multiple agents touch the same task or board item without a single owner rewriting history.

## Heuristics (flag → escalate)

Apply these **before** accepting the next peer output as ground truth. If any trigger fires, **stop silent continuation** and **escalate to the founder** for peer-quality review (do not “keep auditing” into a bad baseline).

| ID | Trigger | What it looks like |
|----|---------|-------------------|
| **PD-1** | **Contradiction vs prior verified state** | Round *N* established a concrete fact (file path, API shape, test name, commit hash). Round *N+1* states the opposite or a mutually exclusive story **without** calling out an explicit correction or new evidence. |
| **PD-2** | **“Fixed” / “done” without evidence** | Peer claims resolution but there is **no** cited commit, test log excerpt, diff summary, or reproducible command output in the **same** arc thread. |
| **PD-3** | **Verification debt creep** | Each round adds new assertions but **drops** earlier checklist items; open questions from *N* are never answered in *N+k*. |
| **PD-4** | **Scope slide** | Peer reframes the task to something easier **without** founder approval while leaving the original acceptance criteria implied as satisfied. |
| **PD-5** | **Authority cosplay** | Peer cites “policy” or “always allowed” that **does not** match repo docs (`AGENT_INTERFACE.md`, `.cursorrules`, board task text). |

## Escalation payload (include in founder ping)

1. **Arc summary:** what was verified by round *N* (bullets, with quotes or hashes if possible).  
2. **Contradiction or gap:** what round *N+1* said that conflicts with PD-1–PD-5.  
3. **Missing evidence:** what proof was expected (test command, file:line, commit SHA).  
4. **Risk:** blast radius if you continued (see [ACTION_REVERSIBILITY_REGISTRY.md](./ACTION_REVERSIBILITY_REGISTRY.md)).

## What this is not

- **Not** a substitute for running tests or reading the repo yourself when you own the change.  
- **Not** an accusation model — it is a **stop-and-escalate** pattern to protect audit integrity.

## Related

- [ACTION_REVERSIBILITY_REGISTRY.md](./ACTION_REVERSIBILITY_REGISTRY.md) — authorization and blast radius.  
- `AGENT_INTERFACE.md` — team workflow and when to ask the user.
