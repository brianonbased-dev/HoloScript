/-!
# MSC.Basic — Foundational definitions for the Mechanized SimulationContract

This module defines the abstract model of the HoloScript simulation runtime
used in Paper 22 (Mechanized SimulationContract). All types are opaque or
axiomatized where the concrete implementation lives in the production engine.

**Design principle**: The abstract model is intentionally minimal — it contains
exactly the vocabulary needed to state the four SimulationContract invariants
and the acceptance-gate theorem. Any property that cannot be derived from these
primitives is stated as a named axiom, surfacing a runtime obligation.
-/}

namespace MSC

-- -------------------------------------------------------------------
-- Primitive types (opaque — internal structure is a runtime detail)
-- -------------------------------------------------------------------

/-- Abstract simulation state. The production runtime at
    `packages/engine/src/simulation/` defines the concrete representation. -/
opaque SimState : Type

/-- Abstract user/environment input to the simulation. -/
opaque Input : Type

/-- Abstract rendered frame. `renderFrame` produces this. -/
opaque Frame : Type

/-- Hash type for CAEL events. Using `Nat` as the carrier; the engine maps
    SHA-256 digests to `Nat` for the abstract model. -/
def CAELHash : Type := Nat

/-- A CAEL (Causal Event Log) event.

    `cause`: `none` for genesis events, `some h` when `h` is the hash of a
    prior event in the same log.
    `hash`: unique identifier for this event. -/
structure CAELEvent where
  cause : Option CAELHash
  hash  : CAELHash

-- -------------------------------------------------------------------
-- Simulation execution
-- -------------------------------------------------------------------

/-- The `execute` relation: given input `i` and state `s0`, the simulation
    transitions to `s1`.

    **Modeling choice**: `execute` is a `Prop`-valued relation rather than a
    function because the abstract model does not commit to a deterministic
    execution strategy. Determinism is stated separately as the
    `solver_functional` axiom in `MSC.Invariants`. -/
opaque execute : Input → SimState → SimState → Prop

/-- Derive a frame directly from the solver state. -/
opaque deriveFrame : SimState → Frame

/-- Render the current simulation state to a frame.

    **Modeling choice**: In a conforming runtime, `renderFrame` is *defined as*
    `deriveFrame`. The theorem `render_eq_solver` in `MSC.Invariants` captures
    this equality by `rfl`. -/
def renderFrame : SimState → Frame := deriveFrame

/-- Canonical geometry hash. -/
opaque geometryHash : SimState → CAELHash

/-- Geometry hash used by the solver. In a conforming runtime, equals
    `geometryHash`. -/
def solverGeometryHash : SimState → CAELHash := geometryHash

/-- Geometry hash used by the renderer. In a conforming runtime, equals
    `geometryHash`. -/
def rendererGeometryHash : SimState → CAELHash := geometryHash

-- -------------------------------------------------------------------
-- Well-formed run
-- -------------------------------------------------------------------

/-- A well-formed run starting from state `s0`. -/
inductive Run (s0 : SimState) : List (Input × SimState) → Prop where
  | nil : Run s0 []
  | cons {i s1 rest} :
      execute i s0 s1 →
      Run s1 rest →
      Run s0 ((i, s1) :: rest)

-- -------------------------------------------------------------------
-- CAEL pipeline
-- -------------------------------------------------------------------

/-- The CAEL pipeline emits a list of events from a well-formed run.

    **Modeling choice**: `cael` is `opaque` because the abstract model cannot
    witness the internal structure of the CAEL pipeline. This is the same
    pattern as `execute`: the function exists, but its body is hidden, and
    properties about it are stated as named axioms. -/
opaque cael (s0 : SimState) (run : List (Input × SimState)) (h : Run s0 run) : List CAELEvent

-- -------------------------------------------------------------------
-- NN-Primary Dispatch Model (Paper 22 / CG-035)
-- -------------------------------------------------------------------

/-- The three runtime tiers from the inverted stack (CG-035):
    - `Tier1_SNN`: spiking neural network hot path (sub-ms, neuromorphic)
    - `Tier2_LLM`: LLM speculative warm path (semantic/agentic traits)
    - `Tier3_CPU`: CPU cold path (safety-critical, audit, replay) -/
inductive Tier
  | Tier1_SNN
  | Tier2_LLM
  | Tier3_CPU

deriving BEq

def Tier.toString : Tier → String
  | Tier1_SNN => "SNN"
  | Tier2_LLM => "LLM"
  | Tier3_CPU => "CPU"

/-- A trait classification determines which tier handles a request. -/
inductive TraitClass
  | Spatial        -- perceptual/animation → Tier 1
  | Semantic       -- agentic/compositional → Tier 2
  | SafetyCritical -- audit/replay/low-confidence → Tier 3

deriving BEq

def TraitClass.defaultTier : TraitClass → Tier
  | Spatial        => Tier.Tier1_SNN
  | Semantic       => Tier.Tier2_LLM
  | SafetyCritical => Tier.Tier3_CPU

/-- Deviation metric: a non-negative real measuring how far a warm-path
    output deviates from the cold-path reference. Using `Nat` (milli-units)
    to avoid `Float` in core Lean; the engine maps physical units. -/
def DeviationMetric : Type := Nat  -- 0 = perfect match, higher = more deviation

/-- Acceptance threshold α (alpha). A result is accepted when
    `deviation ≤ α`. -/
def Threshold : Type := Nat

/-- Evidence pack produced by every dispatch. This is the SimulationContract
    artifact that tier-3 verification consumes. -/
structure SimulationContract where
  /-- The trait class that triggered this dispatch. -/
  traitClass : TraitClass
  /-- Which tier handled the request. -/
  tierUsed   : Tier
  /-- The deviation metric (meaningful for Tier 2 → Tier 3 handoff). -/
  deviation  : DeviationMetric
  /-- Whether the result was accepted by the warm path. -/
  accepted   : Bool
  /-- Provenance: CAEL events produced during this dispatch. -/
  provenance : List CAELEvent

/-- Result of dispatching a request. -/
structure DispatchResult where
  /-- The tier that produced the output. -/
  tier    : Tier
  /-- The output state (from whichever tier ran). -/
  state   : SimState
  /-- Evidence pack for verification. -/
  contract : SimulationContract

/-- The acceptance gate predicate: a warm-path result is accepted if its
    deviation is within the threshold AND the trait class permits warm-path
    routing.

    Safety-critical traits are never accepted on the warm path — they are
    always routed to Tier 3 for CPU verification. -/
def acceptanceGate (traitClass : TraitClass) (deviation : DeviationMetric)
    (α : Threshold) : Bool :=
  match traitClass with
  | TraitClass.SafetyCritical => false  -- always cold-path
  | _ => deviation ≤ α                  -- warm-path allowed if within α

/-- The dispatch policy routes a request to a tier based on trait class,
    confidence, and safety-criticality. For the abstract model we keep the
    deterministic tier selection; stochastic confidence is modeled by the
    `deviation` field in the output. -/
def dispatchPolicy (traitClass : TraitClass) (α : Threshold)
    (deviation : DeviationMetric) : Tier × Bool :=
  let accepted := acceptanceGate traitClass deviation α
  let tier := if accepted then traitClass.defaultTier else Tier.Tier3_CPU
  (tier, accepted)

end MSC
