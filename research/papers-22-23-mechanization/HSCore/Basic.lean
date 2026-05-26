/-!
# HSCore.Basic — Foundational definitions for Paper 23 (Formal Semantics of HS Core)

This module defines the abstract syntax, type system, and small-step
operational semantics for the HS core subset — the formal model underlying
Paper 23's soundness results.

**Design principle**: Minimal core, no Mathlib. All types are either
definitionally equal (provable by `rfl`) or stated as named axioms
surfacing runtime obligations (same pattern as `MSC.Invariants`).
Runtime-obligation axioms: dispatch_resolve, dispatch_resolve_total,
trait_accepts (here) + dispatch_resolve_preserves,
substitution_preserves_typing (in Soundness).

The HS core subset includes:
- Trait types (the fundamental unit of .holo programs)
- Dispatch expressions (runtime trait resolution)
- A small-step reduction relation
- A type system that assigns types to expressions

Paper 23's contribution: proving progress and preservation for this
core calculus, establishing type soundness of trait dispatch.
Status: 0 sorry, 5 named runtime-obligation axioms (see below).
-/

namespace HSCore

-- -------------------------------------------------------------------
-- §1  Trait identifiers and primitive types
-- -------------------------------------------------------------------

/-- Trait identifiers. In the full language these are qualified names;
    in the core model they are abstract. -/
inductive TraitId : Type where
  | mk (name : String) : TraitId
deriving BEq, DecidableEq

/-- Core value types for the HS subset. -/
inductive Ty : Type where
  | trait   : TraitId → Ty        -- a trait type (the .holo unit)
  | nat     : Ty                   -- Nat (for deviation metrics, hashes)
  | bool    : Ty                   -- Bool (for acceptance decisions)
  | unit    : Ty                   -- Unit (for effect-only operations)
  | arrow   : Ty → Ty → Ty        -- function type
deriving BEq, DecidableEq

-- -------------------------------------------------------------------
-- §2  Expressions (abstract syntax)
-- -------------------------------------------------------------------

inductive Expr : Type where
  | var      : Nat → Expr                    -- de Bruijn variable
  | lit_nat  : Nat → Expr                    -- natural number literal
  | lit_bool : Bool → Expr                   -- boolean literal
  | unit_val : Expr                          -- unit value
  | lam      : Ty → Expr → Expr              -- lambda abstraction
  | app      : Expr → Expr → Expr            -- application
  | dispatch : TraitId → Expr → Expr          -- trait dispatch (the key form)
  | let_     : Expr → Expr → Expr            -- let-binding (sequential)
deriving BEq

-- -------------------------------------------------------------------
-- §3  Values (reduced expressions)
-- -------------------------------------------------------------------

inductive Value : Type where
  | vnat  : Nat → Value
  | vbool : Bool → Value
  | vunit : Value
  | vlam  : Ty → Expr → Value
deriving BEq

def Value.toExpr : Value → Expr
  | Value.vnat n    => Expr.lit_nat n
  | Value.vbool b   => Expr.lit_bool b
  | Value.vunit      => Expr.unit_val
  | Value.vlam τ e  => Expr.lam τ e

def isValue : Expr → Bool
  | Expr.lit_nat _  => true
  | Expr.lit_bool _ => true
  | Expr.unit_val   => true
  | Expr.lam _ _    => true
  | _               => false

-- -------------------------------------------------------------------
-- §4  Type system declarations
-- -------------------------------------------------------------------

def Ctx : Type := List Ty

def Ctx.extend (Γ : Ctx) (τ : Ty) : Ctx := τ :: Γ

def Ctx.lookup : Ctx → Nat → Option Ty
  | [], _ => none
  | τ :: _, 0 => some τ
  | _ :: Γ, n + 1 => lookup Γ n

-- -------------------------------------------------------------------
-- §5  Substitution (de Bruijn) — defined before Step
-- -------------------------------------------------------------------

def shiftAbove : Nat → Expr → Expr
  | k, Expr.var n =>
    if n < k then Expr.var n else Expr.var (n + 1)
  | _, Expr.lit_nat m => Expr.lit_nat m
  | _, Expr.lit_bool b => Expr.lit_bool b
  | _, Expr.unit_val => Expr.unit_val
  | k, Expr.lam τ body =>
    Expr.lam τ (shiftAbove (k + 1) body)
  | k, Expr.app e₁ e₂ =>
    Expr.app (shiftAbove k e₁) (shiftAbove k e₂)
  | k, Expr.dispatch tid e =>
    Expr.dispatch tid (shiftAbove k e)
  | k, Expr.let_ e₁ e₂ =>
    Expr.let_ (shiftAbove k e₁) (shiftAbove (k + 1) e₂)

def shift : Expr → Expr := shiftAbove 0

def substitute : Expr → Nat → Expr → Expr
  | Expr.var n, k, s =>
    if n < k then Expr.var n
    else if n = k then s
    else Expr.var (n - 1)
  | Expr.lit_nat m, _, _ => Expr.lit_nat m
  | Expr.lit_bool b, _, _ => Expr.lit_bool b
  | Expr.unit_val, _, _ => Expr.unit_val
  | Expr.lam τ body, k, s =>
    Expr.lam τ (substitute body (k + 1) (shift s))
  | Expr.app e₁ e₂, k, s =>
    Expr.app (substitute e₁ k s) (substitute e₂ k s)
  | Expr.dispatch tid e, k, s =>
    Expr.dispatch tid (substitute e k s)
  | Expr.let_ e₁ e₂, k, s =>
    Expr.let_ (substitute e₁ k s) (substitute e₂ (k + 1) (shift s))

-- -------------------------------------------------------------------
-- §6  Axioms (MUST be declared before Step and HasType)
-- -------------------------------------------------------------------

/-- **Axiom**: trait dispatch resolution.

    When a trait `tid` is dispatched on a value `v`, the runtime resolves
    to some expression `e'`. The axiom states that for every well-typed
    dispatch, there exists a resolution.

    This is the "opaque-runtime-obligation" pattern: the abstract model
    cannot witness the internal implementation of trait dispatch, so it
    surfaces the obligation as a named axiom. -/
axiom dispatch_resolve :
  ∀ (tid : TraitId) (v : Value) (e' : Expr), Prop

/-- **Axiom**: trait dispatch resolution is total.

    Every dispatch on a value resolves to *some* expression. This is the
    progress-side runtime obligation: the abstract model cannot witness the
    resolution target, but the runtime guarantees one exists (a dispatch on a
    value is never stuck). Companion to `dispatch_resolve` (which names the
    relation) — this axiom asserts its inhabitation. -/
axiom dispatch_resolve_total :
  ∀ (tid : TraitId) (v : Value), ∃ (e' : Expr), dispatch_resolve tid v e'

/-- **Axiom**: trait acceptance typing rule.

    `trait_accepts tid τ_arg τ_res` means that trait `tid` accepts
    arguments of type `τ_arg` and produces results of type `τ_res`.

    This models the trait registry: the runtime maintains a mapping
    from (TraitId, input type) to output type. -/
axiom trait_accepts :
  ∀ (tid : TraitId) (τ_arg τ_res : Ty), Prop

-- -------------------------------------------------------------------
-- §7  Small-step reduction relation
-- -------------------------------------------------------------------

/-- The small-step reduction relation `e ⟶ e'`.

    The key rule is `dispatch_step`: when a trait dispatch expression
    has a value argument, the dispatch resolves via `dispatch_resolve`. -/
inductive Step : Expr → Expr → Prop where
  | app_beta :
      ∀ (τ : Ty) (body : Expr) (v : Value),
        Step (Expr.app (Expr.lam τ body) (Value.toExpr v))
             (substitute body 0 (Value.toExpr v))
  | app_step_left :
      ∀ (e₁ e₁' e₂ : Expr),
        Step e₁ e₁' →
        Step (Expr.app e₁ e₂) (Expr.app e₁' e₂)
  | app_step_right :
      ∀ (v : Value) (e₂ e₂' : Expr),
        Step e₂ e₂' →
        Step (Expr.app (Value.toExpr v) e₂)
             (Expr.app (Value.toExpr v) e₂')
  | dispatch_step :
      ∀ (tid : TraitId) (v : Value) (e' : Expr),
        dispatch_resolve tid v e' →
        Step (Expr.dispatch tid (Value.toExpr v)) e'
  | dispatch_arg_step :
      ∀ (tid : TraitId) (e e' : Expr),
        Step e e' →
        Step (Expr.dispatch tid e) (Expr.dispatch tid e')
  | let_step :
      ∀ (e₁ e₁' e₂ : Expr),
        Step e₁ e₁' →
        Step (Expr.let_ e₁ e₂) (Expr.let_ e₁' e₂)
  | let_val :
      ∀ (v : Value) (e₂ : Expr),
        Step (Expr.let_ (Value.toExpr v) e₂)
             (substitute e₂ 0 (Value.toExpr v))

-- -------------------------------------------------------------------
-- §8  Type system (typing relation)
-- -------------------------------------------------------------------

inductive HasType : Ctx → Expr → Ty → Prop where
  | ty_var :
      ∀ (Γ : Ctx) (n : Nat) (τ : Ty),
        Γ.lookup n = some τ →
        HasType Γ (Expr.var n) τ
  | ty_nat :
      ∀ (Γ : Ctx) (n : Nat),
        HasType Γ (Expr.lit_nat n) Ty.nat
  | ty_bool :
      ∀ (Γ : Ctx) (b : Bool),
        HasType Γ (Expr.lit_bool b) Ty.bool
  | ty_unit :
      ∀ (Γ : Ctx),
        HasType Γ Expr.unit_val Ty.unit
  | ty_lam :
      ∀ (Γ : Ctx) (τ₁ τ₂ : Ty) (body : Expr),
        HasType (Γ.extend τ₁) body τ₂ →
        HasType Γ (Expr.lam τ₁ body) (Ty.arrow τ₁ τ₂)
  | ty_app :
      ∀ (Γ : Ctx) (τ₁ τ₂ : Ty) (e₁ e₂ : Expr),
        HasType Γ e₁ (Ty.arrow τ₁ τ₂) →
        HasType Γ e₂ τ₁ →
        HasType Γ (Expr.app e₁ e₂) τ₂
  | ty_dispatch :
      ∀ (Γ : Ctx) (tid : TraitId) (τ_arg τ_res : Ty) (e : Expr),
        HasType Γ e τ_arg →
        trait_accepts tid τ_arg τ_res →
        HasType Γ (Expr.dispatch tid e) τ_res
  | ty_let :
      ∀ (Γ : Ctx) (τ₁ τ₂ : Ty) (e₁ e₂ : Expr),
        HasType Γ e₁ τ₁ →
        HasType (Γ.extend τ₁) e₂ τ₂ →
        HasType Γ (Expr.let_ e₁ e₂) τ₂

-- -------------------------------------------------------------------
-- §9  Helper: value extraction
-- -------------------------------------------------------------------

def Expr.toValue? : Expr → Option Value
  | Expr.lit_nat n  => some (Value.vnat n)
  | Expr.lit_bool b  => some (Value.vbool b)
  | Expr.unit_val    => some Value.vunit
  | Expr.lam τ body  => some (Value.vlam τ body)
  | _                => none

end HSCore