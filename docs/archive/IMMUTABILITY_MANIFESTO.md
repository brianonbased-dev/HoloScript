# The HoloLand Immutability Manifesto

> _"What we could change, we choose not to. What we promise today, we cannot take back tomorrow."_

**Version 1.0 — February 2026**  
**Status: Binding from first commit. Irrevocable.**

---

## Preamble

The game engine industry has a trust problem.

In 2023, Unity Software reversed its pricing terms overnight — adding a $0.20 per-install fee to games that had already launched under different rules. Three thousand employees were fired. Developers who had spent years building on Unity's promises discovered that a corporation's goodwill is only as durable as its quarterly earnings call.

HoloScript and HoloLand exist because we believe the tools for building spatial worlds deserve a fundamentally different covenant with creators.

This document is that covenant.

It is not a Terms of Service document (those can be changed). It is a public, version-controlled, irrevocable commitment — enforced by open source licensing, not by our goodwill.

---

## The Five Pillars

### Pillar I — MIT License, Forever

**The promise:**  
HoloScript core (`@holoscript/core`, `@holoscript/compiler`, `@holoscript/runtime`) is and will always be licensed under the [MIT License](https://opensource.org/licenses/MIT).

**What this means for you:**

- You can use HoloScript in commercial products **without paying us anything**
- You can fork it, modify it, sell it, embed it — no restrictions
- If HoloLand ceases to exist tomorrow, your investment in HoloScript survives
- We **cannot** revoke this license. MIT is irrevocable by design.

**The Unity anti-pattern we're solving:**  
Unity's pricing power rested on proprietary lock-in. Our engine being open source eliminates that leverage entirely. We chose this deliberately.

```
SPDX-License-Identifier: MIT
Copyright (c) 2024–present HoloLand, Inc. and contributors
```

---

### Pillar II — 90/10 Revenue Split, Legally Capped

**The promise:**  
HoloLand takes **no more than 10%** of marketplace revenue. Creators keep **at minimum 90%**. This ratio is legally encoded in our platform terms and cannot be increased without unanimous consent of our Creator Council.

**The math that matters:**

| Platform          | Creator Cut      | Platform Cut |
| ----------------- | ---------------- | ------------ |
| Apple App Store   | 70%              | 30%          |
| Google Play       | 70–85%           | 15–30%       |
| Unity Asset Store | 70%              | 30%          |
| Roblox (2024)     | ~25% (via Robux) | ~75%         |
| Epic Games Store  | 88%              | 12%          |
| **HoloLand**      | **90–95%**       | **5–10%**    |

**HoloLand Founders Program (Alpha):**  
First 100 creators receive **95/5** split permanently, plus **$2,000/month guaranteed income** for 12 months. No strings. This is our bet on your success.

**Why we can sustain this:**  
We make money when you make money. At scale, 10% of a thriving creator economy exceeds 30% of a stagnant one. Roblox proved it: $730M/year in platform revenue while paying creators $741M.

---

### Pillar III — No Runtime Fees, Ever

**The promise:**  
HoloLand will **never** charge per-install, per-play, or per-user fees for games built with HoloScript.

**Specifically prohibited:**

- ❌ Per-install charges (Unity 2023 debacle)
- ❌ Minimum revenue thresholds before launch
- ❌ Retroactive fee changes for games already launched
- ❌ "Platform-tier" paywalls that lock basic features

**What we charge instead:**

- ✅ Optional marketplace listing (subject to 90/10 split above)
- ✅ Optional managed hosting (competitive market rates, not required)
- ✅ Optional enterprise support contracts

If you host your own HoloScript world via the open source runtime, **you pay nothing to us**.

---

### Pillar IV — Creator Data Sovereignty

**The promise:**  
Your scenes, assets, player data, and analytics belong to you. HoloLand is a custodian, not an owner.

**Your rights:**

- **Export anytime**: Full data export in open formats (glTF 2.0, USD, JSON) within 24 hours of request
- **Portability**: Your HoloScript scenes run on any compliant runtime — not just HoloLand's
- **No training without consent**: We will never use your game data to train AI models without explicit, per-asset opt-in
- **Delete means delete**: Account deletion triggers 30-day verified purge of all personal data

**Anti-lock-in architecture:**  
Every HoloScript scene compiles to standard formats. The `compile_target` flag exports to WebGPU, Unity, Unreal, Godot, USDZ, glTF without modification. You are never trapped.

---

### Pillar V — Open Governance

**The promise:**  
Material changes to these commitments require public proposal, 90-day comment period, and supermajority approval from the **HoloLand Creator Council** (elected annually, one seat per 1,000 monthly active creators).

**What "material change" means:**

- Any reduction in creator revenue share
- Any introduction of new per-unit fees
- Any licensing change to HoloScript core
- Any change to data sovereignty rights

**What we can change without council approval:**

- Bug fixes and security patches
- New optional features
- Infrastructure providers
- Our own internal costs

**If HoloLand is acquired:**  
Acquiring entity must provide 24-month transition period with current terms preserved. This clause is incorporated into all shareholder agreements from day one.

---

## The Moat We're Building

> "The best moat is one your customers help you build."

We're not competing with Unity on features — they have a 20-year head start.  
We're not competing with Roblox on network effects — they have 150M DAU.

We're competing on **trust** — the one commodity both have destroyed.

Every creator who builds on HoloLand makes this manifesto more valuable. You're not just using a platform; you're co-signing a covenant that makes the entire HoloScript ecosystem more trustworthy for the next creator.

This is a **trustless architecture**: you don't need to trust us, because the MIT license and these binding terms mean it doesn't matter whether you do.

---

## Enforcement

This manifesto is enforced through:

1. **MIT License** — Legally irrevocable. Courts in every jurisdiction recognize it.
2. **Creator Council Veto** — Governance changes require supermajority approval.
3. **Public Version Control** — This document's git history is the audit trail.
4. **Open Source Runtime** — Any breach can be forked around.

If we violate this manifesto, we expect — and deserve — to be forked.

---

## Signatories

This manifesto is adopted by the founding team and incorporated by reference into HoloLand's corporate charter.

| Name         | Role       | Signed        |
| ------------ | ---------- | ------------- |
| _(Founders)_ | _(Titles)_ | February 2026 |

---

## Version History

| Version | Date       | Changes             |
| ------- | ---------- | ------------------- |
| 1.0     | 2026-02-23 | Initial publication |

---

_This document is maintained in the HoloScript monorepo at `IMMUTABILITY_MANIFESTO.md`. Proposed amendments must be submitted as pull requests with a minimum 90-day comment period._

_"First, do no harm to your creators."_
