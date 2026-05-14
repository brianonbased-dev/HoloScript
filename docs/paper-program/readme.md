# HoloScript Paper Program

This program is not a pile of feature papers. Paper 0b/0c define the root
research machine: HoloScript owns enough of the stack to create candidate
novelty and enough of the evidence layer to prove or falsify it.

The core claim is bounded but powerful:

> HoloScript/HoloLand can originate, run, replay, measure, and publish
> claims that normal disconnected stacks can only describe after the fact.

That does not make every feature novel. The unit of novelty is the claim, not
the repo, product, or paper. A claim becomes paper-grade only when it is
implemented or reproducible, compared against external prior art, and backed by
reviewer-visible evidence.

## Root Novelty

Paper 0b and Paper 0c are the source layer for the rest of the program:

- **Paper 0b / Trust by Construction**: SimulationContract makes physics and
  experiment execution enforceable by runtime contract rather than post-hoc
  discipline.
- **Paper 0c / CAEL**: agent experience becomes a hash-verifiable chain of
  perception, cognition, action, physics, and world delta. Behavior is replayed,
  not merely explained.
- **Algebraic Trust**: each domain can use a different Layer-1 algebra, while
  CAEL history and SimulationContract replay remain the invariant spine.

The rest of the program should not pretend that ordinary subsystems are novel
just because they live in HoloScript. Their novelty comes from what the owned
substrate lets them prove, measure, generate, or coordinate.

## Owned Substrate

The reason hidden gems can exist here is ownership across layers:

| Layer | HoloScript/HoloLand owns | Paper value |
|---|---|---|
| Semantic truth | `.holo`, `.hs`, `.hsplus`, traits, units, constraints | Claims have precise machine-readable scope |
| Execution truth | runtime, solvers, SimulationContract, compiler targets | Results can be rerun and checked |
| Interaction truth | Studio, Brittney, HoloLand worlds, agent loops | Human and agent interventions become reproducible inputs |
| Evidence truth | CAEL traces, receipts, anchors, evidence envelopes | Claims carry provenance instead of prose-only support |
| Learning truth | trace corpora, SESL, trait inference, motion/UI generators | Verified behavior becomes training data |

That stack can do two things a normal research stack struggles to do:

1. **Create candidate novelty** by composing owned semantics, runtimes, agents,
   environments, and learners into new operative relationships.
2. **Prove or kill candidate novelty** by replaying the behavior, checking the
   contract, measuring cost, comparing baselines, and exporting the evidence.

## Promotion Rule

Before opening or elevating a paper, answer this:

> What can we prove, measure, or generate because of CAEL + SimulationContract
> + the owned runtime that a normal stack cannot?

If the answer is thin, the work stays an application note, benchmark section, or
product milestone. If the answer is strong, the work can become a paper track.

A paper-grade claim needs:

- Exact minimum claim scope.
- A named external artifact or class of artifacts that would falsify novelty if
  found.
- A shipped or reproducible mechanism.
- CAEL, SimulationContract, receipt, or equivalent evidence envelope.
- Baseline comparison, ablation, user study, or scaling/cost model appropriate
  to the venue.
- Reviewer-visible artifact paths, commands, and provenance.

## Hidden Gem Patterns

These are the shapes most likely to turn owned infrastructure into publishable
claims:

| Pattern | Claim shape | Gate |
|---|---|---|
| HoloLand as study instrument | VR/AR worlds emit paper-grade human/agent/world interaction traces | CAEL-logged sessions with replayable task evidence |
| Three-population trait library | HoloMesh teammates, HoloLand NPCs, and services share one sovereign trait substrate | Cross-surface trait corpus plus held-out evaluation |
| Disposable neural maps, durable identity | cognition can be regenerated because identity is anchored in wallet, handle, brain composition, memory, and provenance | fork/recovery tests plus continuity receipts |
| CAEL-traceability regularizers | generated motion, scenes, or UI layouts are trained to preserve replayable provenance | regularizer on/off ablation and trace pass rate |
| Papers-as-Service | the platform turns external R&D claims into spec -> implementation -> measurement -> paper evidence | claim-level novelty gate plus evidence envelope |
| Twin Earth receipts | HoloLand runtime state can be substrate-verifiable without trusting a single assistant narration | receipt schema, verifier, and cross-consumer replay |

## Anti-Overclaim Rule

Do not write "novel" because a heading, feature, or demo exists. Write it only
after the claim has survived the novelty definition in `DEFINITIONS.md`, the
audit-matrix readiness gates, and the relevant prior-art search.

Paper 0/CAEL is the root novelty generator. The rest of the program is valuable
when it routes claims through that generator and comes back with evidence.
