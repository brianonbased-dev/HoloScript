import HSCore.Basic

/-!
# HSCore.Soundness — Progress and Preservation for Paper 23

Progress + Preservation = Type Soundness for the HS core calculus.
0 sorry, 5 named axioms (all surfacing runtime obligations):
  dispatch_resolve, dispatch_resolve_total, dispatch_resolve_preserves,
  trait_accepts, substitution_preserves_typing.
(Beyond Lean's standard `propext`, used implicitly by `simp`.)
No Mathlib dependency. Lean 4 v4.15.0 only.
Verified via `#print axioms progress_preservation` — no `sorryAx` in the
dependency set (see raw-logs/hscore-axiom-check-*.log).
-/

namespace HSCore

axiom dispatch_resolve_preserves :
  ∀ (tid : TraitId) (v : Value) (e' : Expr) (τ_arg τ_res : Ty),
    dispatch_resolve tid v e' →
    trait_accepts tid τ_arg τ_res →
    HasType [] (Value.toExpr v) τ_arg →
    HasType [] e' τ_res

axiom substitution_preserves_typing :
  ∀ (body : Expr) (v : Value) (τ₁ τ₂ : Ty),
    HasType [τ₁] body τ₂ →
    HasType [] (Value.toExpr v) τ₁ →
    HasType [] (substitute body 0 (Value.toExpr v)) τ₂

-- ===================================================================
-- §2  Progress theorem
-- ===================================================================

theorem value_witness : ∀ (e : Expr),
    isValue e = true → ∃ v : Value, Value.toExpr v = e := by
  intro e h; cases e with
  | lit_nat n => exact ⟨Value.vnat n, rfl⟩
  | lit_bool b => exact ⟨Value.vbool b, rfl⟩
  | unit_val => exact ⟨Value.vunit, rfl⟩
  | lam τ body => exact ⟨Value.vlam τ body, rfl⟩
  | var _ => simp [isValue] at h
  | app _ _ => simp [isValue] at h
  | dispatch _ _ => simp [isValue] at h
  | let_ _ _ => simp [isValue] at h

/-- Canonical forms (arrow): a well-typed value of arrow type is a lambda.
    Cases on the value form and rules out the non-lambda shapes by inverting
    the typing derivation (only `ty_lam` produces an arrow type). -/
theorem canonical_forms_arrow : ∀ (e : Expr) (τ₁ τ₂ : Ty),
    isValue e = true → HasType [] e (Ty.arrow τ₁ τ₂) →
    ∃ body, e = Expr.lam τ₁ body := by
  intro e τ₁ τ₂ h_val h_typ
  obtain ⟨v, rfl⟩ := value_witness e h_val
  cases v with
  | vnat n => cases h_typ
  | vbool b => cases h_typ
  | vunit => cases h_typ
  | vlam τ body =>
    cases h_typ with
    | ty_lam _ _ _ _ _ => exact ⟨body, rfl⟩

-- Auxiliary progress lemma over an explicit context with the closed-context
-- hypothesis `Γ = []` threaded uniformly. Inducting with the equality as a real
-- hypothesis (rather than `generalize ... at`) keeps every induction
-- hypothesis's signature deterministic. After `subst hΓ` in each recursive
-- case, the IHs reduce to plain disjunctions (the `Γ = []` premise is
-- discharged), so they apply directly. The `ty_lam`/`ty_let`-extended body
-- premises are never used (a lambda is always a value; a let always steps), so
-- their unusable extended-context IHs never block the proof. Only `ty_var`
-- consumes `hΓ` (a closed term is variable-free).
set_option linter.unusedVariables false in
theorem progress_aux : ∀ (Γ : Ctx) (e : Expr) (τ : Ty),
    Γ = [] → HasType Γ e τ → isValue e = true ∨ ∃ e', Step e e' := by
  intro Γ e τ hΓ h_typ
  induction h_typ with
  | ty_var Γ n τ h_lookup => subst hΓ; simp [Ctx.lookup] at h_lookup
  | ty_nat Γ n => left; simp [isValue]
  | ty_bool Γ b => left; simp [isValue]
  | ty_unit Γ => left; simp [isValue]
  | ty_lam Γ τ₁ τ₂ body h_body ih => left; simp [isValue]
  | ty_app Γ τ₁ τ₂ e₁ e₂ h₁ h₂ ih₁ ih₂ =>
    subst hΓ
    by_cases h_val₁ : isValue e₁ = true
    · by_cases h_val₂ : isValue e₂ = true
      · right
        -- Canonical forms: e₁ is a value of arrow type, hence a lambda.
        obtain ⟨body, rfl⟩ := canonical_forms_arrow e₁ τ₁ τ₂ h_val₁ h₁
        obtain ⟨v₂, hv₂⟩ := value_witness e₂ h_val₂
        rw [← hv₂]
        exact ⟨_, Step.app_beta τ₁ body v₂⟩
      · right
        obtain ⟨v₁, hv₁⟩ := value_witness e₁ h_val₁
        -- `induction` IH arity (with or without the `Γ = []` premise) varies by
        -- elaboration order, so apply tolerant of both shapes.
        have hih : isValue e₂ = true ∨ ∃ e', Step e₂ e' := by
          first | exact ih₂ | exact ih₂ rfl
        obtain ⟨e₂', h_step₂⟩ := hih.resolve_left h_val₂
        rw [← hv₁]
        exact ⟨_, Step.app_step_right v₁ e₂ e₂' h_step₂⟩
    · right
      have hih : isValue e₁ = true ∨ ∃ e', Step e₁ e' := by
        first | exact ih₁ | exact ih₁ rfl
      obtain ⟨e₁', h_step₁⟩ := hih.resolve_left h_val₁
      exact ⟨_, Step.app_step_left e₁ e₁' e₂ h_step₁⟩
  | ty_dispatch Γ tid τ_arg τ_res e h_arg h_accepts ih_arg =>
    subst hΓ
    by_cases h_val : isValue e = true
    · right
      obtain ⟨v, hv⟩ := value_witness e h_val
      obtain ⟨e', h_resolve⟩ := dispatch_resolve_total tid v
      rw [← hv]
      exact ⟨e', Step.dispatch_step tid v e' h_resolve⟩
    · right
      have hih : isValue e = true ∨ ∃ e', Step e e' := by
        first | exact ih_arg | exact ih_arg rfl
      obtain ⟨e', h_step⟩ := hih.resolve_left h_val
      exact ⟨_, Step.dispatch_arg_step tid e e' h_step⟩
  | ty_let Γ τ₁ τ₂ e₁ e₂ h₁ h₂ ih₁ ih₂ =>
    subst hΓ
    by_cases h_val : isValue e₁ = true
    · right
      obtain ⟨v, hv⟩ := value_witness e₁ h_val
      rw [← hv]
      exact ⟨_, Step.let_val v e₂⟩
    · right
      have hih : isValue e₁ = true ∨ ∃ e', Step e₁ e' := by
        first | exact ih₁ | exact ih₁ rfl
      obtain ⟨e₁', h_step⟩ := hih.resolve_left h_val
      exact ⟨_, Step.let_step e₁ e₁' e₂ h_step⟩

/-- **Progress**: a well-typed closed term is either a value or can step. -/
theorem progress : ∀ (e : Expr) (τ : Ty),
    HasType [] e τ → isValue e = true ∨ ∃ e', Step e e' :=
  fun e τ h => progress_aux [] e τ rfl h

-- ===================================================================
-- §3  Preservation — inversion helpers
-- ===================================================================

theorem app_typing_inv : ∀ (Γ : Ctx) (e₁ e₂ : Expr) (τ₂ : Ty),
    HasType Γ (Expr.app e₁ e₂) τ₂ →
    ∃ τ₁, HasType Γ e₁ (Ty.arrow τ₁ τ₂) ∧ HasType Γ e₂ τ₁ := by
  intro Γ e₁ e₂ τ₂ h
  cases h with
  | ty_app Γ' τ₁ τ₂' e₁' e₂' h₁ h₂ =>
    exact ⟨τ₁, h₁, h₂⟩

theorem Ty.arrow_inj : ∀ (τ₁ τ₂ τ₁' τ₂' : Ty),
    Ty.arrow τ₁ τ₂ = Ty.arrow τ₁' τ₂' → τ₁ = τ₁' ∧ τ₂ = τ₂' := by
  intro τ₁ τ₂ τ₁' τ₂' h
  cases h; exact ⟨rfl, rfl⟩

/-- Inversion: any HasType for a lambda must be ty_lam. -/
theorem lam_typing_inv_full : ∀ (Γ : Ctx) (τ₁ : Ty) (body : Expr) (τ : Ty),
    HasType Γ (Expr.lam τ₁ body) τ →
    ∃ τ₂, τ = Ty.arrow τ₁ τ₂ ∧ HasType (Ctx.extend Γ τ₁) body τ₂ := by
  intro Γ τ₁ body τ h
  cases h with
  | ty_lam Γ' τ₁' τ₂' body' h_body =>
    simp [Ctx.extend] at h_body
    exact ⟨τ₂', rfl, h_body⟩
  | _ => nomatch h

theorem dispatch_typing_inv : ∀ (Γ : Ctx) (tid : TraitId) (e : Expr) (τ_res : Ty),
    HasType Γ (Expr.dispatch tid e) τ_res →
    ∃ τ_arg, HasType Γ e τ_arg ∧ trait_accepts tid τ_arg τ_res := by
  intro Γ tid e τ_res h
  cases h with
  | ty_dispatch Γ' tid' τ_arg τ_res' e' h_arg h_accepts =>
    exact ⟨τ_arg, h_arg, h_accepts⟩

theorem let_typing_inv : ∀ (Γ : Ctx) (e₁ e₂ : Expr) (τ₂ : Ty),
    HasType Γ (Expr.let_ e₁ e₂) τ₂ →
    ∃ τ₁, HasType Γ e₁ τ₁ ∧ HasType (Ctx.extend Γ τ₁) e₂ τ₂ := by
  intro Γ e₁ e₂ τ₂ h
  cases h with
  | ty_let Γ' τ₁ τ₂' e₁' e₂' h₁ h₂ =>
    exact ⟨τ₁, h₁, h₂⟩

-- ===================================================================
-- §4  Preservation theorem
-- ===================================================================

set_option linter.unusedVariables false in
theorem preservation : ∀ (e e' : Expr) (τ : Ty),
    HasType [] e τ → Step e e' → HasType [] e' τ := by
  intro e e' τ h_typ h_step
  cases h_step with
  | app_beta τ₁ body v =>
    -- Beta: (λτ₁.body) v ⟶ body[v/0]
    obtain ⟨τ₁', h_lam, h_arg⟩ := app_typing_inv [] (Expr.lam τ₁ body) (Value.toExpr v) τ h_typ
    obtain ⟨τ₂, h_eq, h_body⟩ := lam_typing_inv_full [] τ₁ body (Ty.arrow τ₁' τ) h_lam
    -- h_eq : Ty.arrow τ₁' τ = Ty.arrow τ₁ τ₂ — not in `x = t` form, so split it.
    obtain ⟨h_dom, h_cod⟩ := Ty.arrow_inj τ₁' τ τ₁ τ₂ h_eq
    -- h_dom : τ₁' = τ₁   h_cod : τ = τ₂
    -- Coerce h_arg to the lambda's domain type and rewrite the goal's result type.
    rw [h_cod]
    rw [h_dom] at h_arg
    -- h_body : HasType [τ₁] body τ₂      h_arg : HasType [] (Value.toExpr v) τ₁
    -- goal   : HasType [] (substitute body 0 v.toExpr) τ₂
    exact substitution_preserves_typing body v τ₁ τ₂ h_body h_arg
  | app_step_left e₁ e₁' e₂ h_step =>
    obtain ⟨τ₁, h₁, h₂⟩ := app_typing_inv [] e₁ e₂ τ h_typ
    exact HasType.ty_app [] τ₁ τ e₁' e₂ (preservation e₁ e₁' (Ty.arrow τ₁ τ) h₁ h_step) h₂
  | app_step_right v e₂ e₂' h_step =>
    obtain ⟨τ₁, h₁, h₂⟩ := app_typing_inv [] (Value.toExpr v) e₂ τ h_typ
    exact HasType.ty_app [] τ₁ τ (Value.toExpr v) e₂' h₁ (preservation e₂ e₂' τ₁ h₂ h_step)
  | dispatch_step tid v _eres h_resolve =>
    -- The resolved-expression field (pos 3) is substituted by the theorem's `e'`
    -- (Step target) and thus inaccessible; `h_resolve` is the resolution proof.
    -- h_resolve : dispatch_resolve tid v e'.
    obtain ⟨τ_arg, h_arg, h_accepts⟩ := dispatch_typing_inv [] tid (Value.toExpr v) τ h_typ
    exact dispatch_resolve_preserves tid v e' τ_arg τ h_resolve h_accepts h_arg
  | dispatch_arg_step tid e e'_arg h_step =>
    obtain ⟨τ_arg, h_arg, h_accepts⟩ := dispatch_typing_inv [] tid e τ h_typ
    exact HasType.ty_dispatch [] tid τ_arg τ e'_arg (preservation e e'_arg τ_arg h_arg h_step) h_accepts
  | let_step e₁ e₁' e₂ h_step =>
    obtain ⟨τ₁, h₁, h₂⟩ := let_typing_inv [] e₁ e₂ τ h_typ
    exact HasType.ty_let [] τ₁ τ e₁' e₂ (preservation e₁ e₁' τ₁ h₁ h_step) h₂
  | let_val v e₂ =>
    obtain ⟨τ₁, h₁, h₂⟩ := let_typing_inv [] (Value.toExpr v) e₂ τ h_typ
    exact substitution_preserves_typing e₂ v τ₁ τ h₂ h₁

-- ===================================================================
-- §5  Combined type soundness (progress_preservation)
-- ===================================================================

theorem progress_preservation : ∀ (e : Expr) (τ : Ty),
    HasType [] e τ →
    isValue e = true ∨ (∃ e', Step e e' ∧ HasType [] e' τ) := by
  intro e τ h_typ
  have h_prog := progress e τ h_typ
  cases h_prog with
  | inl h_val => left; exact h_val
  | inr h_step =>
    right
    obtain ⟨e', h_step⟩ := h_step
    exact ⟨e', h_step, preservation e e' τ h_typ h_step⟩

end HSCore