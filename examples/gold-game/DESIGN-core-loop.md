# DESIGN: THE GOLD GAME — core loop "Graduate the Knowledge"

Authored by the /game-design discipline (marathon round 1). Grounds in the REAL vault system and the
real economy primitives. Honest where it's a build target, not a claim.

## CORE LOOP — the verb: **graduate a knowledge entry up a tier**
The single repeated action mirrors the real `graduate.py` pipeline: take a raw piece of knowledge and
shepherd it **bronze → silver → gold → platinum → diamond**.

- **act** — pick a candidate entry (a raw wisdom / scar), then *capture → refine → link its lineage →
  submit to the Archivist → ratify*.
- **outcome** — the entry ascends a terrace (rises a tier in the world); the vault brightens.
- **reward** — standing with the Archivist (`@reputationLedger` trustDelta+), credits (`economy:earn`),
  and the entry becomes a permanent glowing gem in the world.
- **motivation to repeat** — higher tiers gate rarer/more valuable entries; the lineage constellation
  grows (collection + mastery); the Archivist *remembers* and opens new dialogue/quests; and the honest
  hook — **it's real**: graduating in-game graduates a real vault entry.

**Why the 10th graduation still matters:** the bar rises per tier (collision-guard conflicts to resolve
— the "monster"; lineage-depth requirements), variety across entry types (patterns / protocols /
gotchas / architectures), agents curating alongside you (social), and scarcity at the top (only ~4
Diamond entries exist — the peak is genuinely aspirational, not a grind ceiling).

## PROGRESSION — gated by tier, paced to the real pipeline
- **Bronze → Gold** = the on-ramp. In the real vault, `farm.py promote` auto-promotes Bronze→GOLD via
  lineage detection (skipping Silver). In-game: *forging enough lineage links unlocks graduation* — fast,
  rewarding, teaches the verb.
- **Silver** is structurally fallow in the real vault (no detection logic). Honest design choice: make
  Silver an *optional polish/bonus* path, not a required step — don't fake a tier the system skips.
- **Platinum / Diamond** = the late game. Require lineage depth + a collision-clean submission + the
  Archivist's approval (reputation-gated). Difficulty curve = collision frequency and ratification bar
  both rise; reward = permanence and prestige.

## ECONOMY — closed system (real primitives)
Built on `EconomyPrimitivesTrait` (credit accounts; `economy:spend/earn/transfer/insufficient_funds`;
`initial_balance` default 100) and `@reputationLedger` (behavior-facts with `trustDelta`, 90-day TTL).

| Resource | Sources | Sinks | Balance note |
|---|---|---|---|
| **Credits** (`economy:*`) | graduate an entry; resolve a collision; daily curation | **stake-on-submit** (fee to send to review); buy lineage hints; fast-track tools | the stake sink is load-bearing — it's what stops spam-submission |
| **Reputation** (`@reputationLedger`) | successful graduations; clean (collision-free) submissions; helping agents curate | **90-day TTL decay** (stop curating → standing fades); negative `trustDelta` on clobbering/failed submits | reputation gates the high tiers — the *progression* currency, not a wallet |

**The degenerate strategy to watch (named, per the skill):** spam low-effort graduations to farm
credits/reputation. Mitigations, all from the real system: (1) **stake-on-submit** makes spam cost
credits; (2) the **collision-guard** rejects duplicates with a negative `trustDelta`; (3) **value scars
over success-patterns** — per P.GOLD.001 Diamond ("failure-knowledge decays slower; prune success-patterns
first, keep scars"), reward graduating *gotchas/failures* higher than tidy success notes, matching the
real vault's value model. This makes the optimal in-game strategy the *same* as the optimal real-curation
strategy — the honest-mapping payoff.

## PLAYTEST PLAN — agents at scale, then a human (no "it'll be fun" without a signal)
- **Agent playtest (compose /sim):** spin up N `@ai_agent` curators (`@autonomousAgenda`, $0.50/day cap)
  and run the loop thousands of deterministic, replayable times under `SimulationContract`. Log:
  credit-inflation rate (sources ÷ sinks over time), reputation distribution, which sink dominates/ignored,
  median time-to-Diamond, and **any farm exploit the agents discover** (the determinism means a found
  exploit replays exactly — fix, re-run, confirm). Expected break to falsify: credits inflate (rewards
  feel worthless) if stake-on-submit is too low — tune the stake until sources ≈ sinks at steady state.
- **Human session checklist:** Does a graduation *feel* like an achievement? Is the collision "monster"
  satisfying to resolve or just friction? Is the Diamond peak aspirational from the Bronze valley? Does
  the Archivist relationship (memory-driven) land emotionally? — the things agents can't measure.

## HANDOFF
- to **/gamedev**: this is the Gate-2 core-loop spec (the verb that makes the parsed entities *do*
  something) — wire `graduate` to a real `/api/vault` op so a play-action is a vault op.
- to **/narrative** (the Archivist): the ratification dialogue + the first quest ("graduate your first
  entry to GOLD") live here; reputation gates which dialogue branches open.
- to **/look-dev**: the moments to make *feel* big — an entry ascending a tier, a Diamond ratification.
- **Status:** design + playtest *plan*; the agent-playtest run itself is the build target (needs the
  loop wired first). Not claiming a playtest signal yet — claiming the design and how to get the signal.
