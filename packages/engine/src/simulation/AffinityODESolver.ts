/**
 * AffinityODESolver — Strogatz-Rinaldi relational dynamics for HoloScript.
 *
 * ## Mathematical Formulation
 *
 * Models social/affective dynamics as coupled ODEs, extending the
 * Strogatz-Rinaldi (1988) love dynamics model with Sternberg's
 * Triangular Theory state vector [I, P, C] (Intimacy, Passion,
 * Commitment).
 *
 * **Linear coupled ODE (Strogatz 1988):**
 *
 *   dR/dt = -a_R * R + b_RJ * J + f_R(t)
 *   dJ/dt = -a_J * J + b_JR * R + f_J(t)
 *
 * where:
 *   R(t), J(t)   = feeling states of partner R and partner J
 *   a_R, a_J      = emotional damping / forgetting rates
 *   b_RJ, b_JR    = cross-coupling (attraction / reactance)
 *   f_R(t), f_J(t) = external forcing (events, environment)
 *
 * **Extended nonlinear model (Rinaldi et al., 2015):**
 *
 * Adds Sternberg's triangular state vector [Intimacy, Passion, Commitment]
 * with nonlinear reaction terms:
 *
 *   dI/dt = -a_I * I + b_I * reaction(R, J) + f_I(t)
 *   dP/dt = -a_P * P + b_P * arousal(R, J) - d_P * P^2 + f_P(t)
 *   dC/dt = -a_C * C + b_C * commitment(I, P) + f_C(t)
 *
 * **Personality archetypes** (from Strogatz parameter space):
 *   - Eager beaver:    +a (self-amplifying), +b (partner-responsive)
 *   - Cautious lover:  -a (self-dampening),  +b (partner-responsive)
 *   - Narcissistic:    +a (self-amplifying), -b (partner-ignoring)
 *   - Hermit:          -a (self-dampening),  -b (partner-ignoring)
 *
 * **Nash-equilibrium effort control inputs:**
 *   Each agent adjusts effort (investment) to optimize a payoff function
 *   that balances personal well-being against relational contribution.
 *   Equilibrium efforts converge when neither agent benefits from
 *   unilateral deviation.
 *
 * ## Numerical Method
 *
 * RK4 (4th-order Runge-Kutta) for ODE integration — matches the
 * infrastructure pattern of ThermalSolver (explicit time-stepping)
 * but operates on a state vector rather than a spatial field.
 *
 * ## Known Limitations
 *
 * - Fixed personality parameters per run (no within-run adaptation)
 * - No stochastic forcing (deterministic only; add noise externally)
 * - Single dyad only (2 agents); multi-agent networks require
 *   coupling via CouplingManagerV2
 *
 * ## References
 *
 * - Strogatz, S.H. (1988). "Love Affairs and Differential Equations."
 *   Mathematics Magazine, 61(1), 35.
 * - Rinaldi, S., Della Rossa, F., & Landi, P. (2015).
 *   "Modeling Love Dynamics." World Scientific.
 * - Sternberg, R.J. (1986). "A Triangular Theory of Love."
 *   Psychological Review, 93(2), 119-135.
 * - PLOS ONE (2021). "Controlling Forever Love."
 *
 * @see SimSolver — generic solver interface
 * @see CouplingManagerV2 — multi-solver coupling
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type PersonalityArchetype =
  | 'eager_beaver'
  | 'cautious_lover'
  | 'narcissistic'
  | 'hermit'
  | 'custom';

export interface AgentParams {
  /** Unique agent identifier */
  id: string;
  /** Emotional damping / forgetting rate (decay toward baseline). Positive = self-amplifying, negative = self-dampening */
  dampingRate: number;
  /** Cross-coupling coefficient: how much this agent responds to the partner's feeling. Positive = attracted, negative = repelled */
  couplingToPartner: number;
  /** Personality archetype (sets dampingRate/couplingToPartner if provided instead of numeric params) */
  archetype?: PersonalityArchetype;
  /** External forcing function f(t). Receives current time, returns forcing value */
  forcing?: (t: number) => number;
}

export interface SternbergParams {
  /** Intimacy decay rate */
  intimacyDecay: number;
  /** Intimacy coupling to feelings */
  intimacyCoupling: number;
  /** Passion decay rate */
  passionDecay: number;
  /** Passion arousal coefficient */
  passionArousal: number;
  /** Passion saturation coefficient (nonlinear damping on P^2) */
  passionSaturation: number;
  /** Commitment decay rate */
  commitmentDecay: number;
  /** Commitment coupling to intimacy+passion */
  commitmentCoupling: number;
}

export interface NashEffortParams {
  /** Enable Nash-equilibrium effort control */
  enabled: boolean;
  /** Personal well-being weight in payoff */
  wellBeingWeight: number;
  /** Relational contribution weight in payoff */
  relationalWeight: number;
  /** Maximum effort per agent */
  maxEffort: number;
  /** Effort adaptation rate (how fast agents adjust) */
  adaptationRate: number;
}

export interface AffinityConfig {
  /** Two agents in the dyad */
  agents: [AgentParams, AgentParams];
  /** Initial feeling states [R_0, J_0] */
  initialFeelings?: [number, number];
  /** Enable Sternberg triangular state vector [I, P, C] */
  enableSternberg?: boolean;
  /** Sternberg model parameters (required if enableSternberg=true) */
  sternberg?: SternbergParams;
  /** Initial Sternberg state [I_0, P_0, C_0] */
  initialSternbergState?: [number, number, number];
  /** Nash-equilibrium effort control */
  nashEffort?: NashEffortParams;
  /** Integration time step (seconds) */
  timeStep: number;
  /** Maximum integration time (for steady-state detection) */
  maxTime?: number;
}

export interface AffinityState {
  /** Current time */
  time: number;
  /** Partner R feeling state */
  R: number;
  /** Partner J feeling state */
  J: number;
  /** Sternberg Intimacy (NaN if disabled) */
  intimacy: number;
  /** Sternberg Passion (NaN if disabled) */
  passion: number;
  /** Sternberg Commitment (NaN if disabled) */
  commitment: number;
  /** Nash effort for agent R (NaN if disabled) */
  effortR: number;
  /** Nash effort for agent J (NaN if disabled) */
  effortJ: number;
  /** Number of integration steps taken */
  stepCount: number;
  /** Solver wall-clock time for last step (ms) */
  lastStepMs: number;
}

export interface AffinityStats extends AffinityState {
  /** Feeling states as Float32Array [R, J, I, P, C, effortR, effortJ] */
  stateVector: Float32Array;
  /** Whether Sternberg extension is active */
  sternbergEnabled: boolean;
  /** Whether Nash effort control is active */
  nashEnabled: boolean;
}

// ── Archetype Presets ────────────────────────────────────────────────────────

const ARCHETYPE_PARAMS: Record<string, { dampingRate: number; couplingToPartner: number }> = {
  // In the ODE dR/dt = -a*R + b*J, positive 'a' = forgetting (damping),
  // negative 'a' = self-amplification. Positive 'b' = attracted to partner,
  // negative 'b' = repelled by partner.
  // The Strogatz classification names the SIGN of the coefficients:
  //   eager_beaver:    +a (forgets), +b (attracted)  → stable spiral
  //   cautious_lover:  -a (self-amplifies), +b (attracted) → unstable spiral
  //   narcissistic:   +a (forgets), -b (repelled)    → damped independent
  //   hermit:          -a (self-amplifies), -b (repelled) → unstable independent
  //
  // For intuitive use, we WANT:
  //   eager_beaver: moderate forgetting + attracted → converges to equilibrium
  //   cautious_lover: slow forgetting + attracted   → slow convergence
  //   narcissistic:   forgetting + repelled          → damps to zero
  //   hermit:         strong forgetting + repelled   → damps to zero fast
  //
  // The naming in Strogatz refers to the SIGN of the LINEAR coefficients,
  // but for simulation we want physically meaningful defaults:
  eager_beaver:     { dampingRate: 0.2,  couplingToPartner: 0.5 },
  cautious_lover:   { dampingRate: 0.1,  couplingToPartner: 0.8 },  // slow forgetting, strong attraction
  narcissistic:     { dampingRate: 0.3,  couplingToPartner: -0.2 }, // forgets but repelled
  hermit:           { dampingRate: 0.5,  couplingToPartner: -0.1 }, // strong forgetting, slight repulsion
};

// ── Default Sternberg parameters ─────────────────────────────────────────────

const DEFAULT_STERNBERG: SternbergParams = {
  intimacyDecay: 0.1,
  intimacyCoupling: 0.3,
  passionDecay: 0.4,
  passionArousal: 0.5,
  passionSaturation: 0.1,
  commitmentDecay: 0.05,
  commitmentCoupling: 0.2,
};

const DEFAULT_NASH: NashEffortParams = {
  enabled: false,
  wellBeingWeight: 0.5,
  relationalWeight: 0.5,
  maxEffort: 1.0,
  adaptationRate: 0.1,
};

// ── Solver ────────────────────────────────────────────────────────────────────

export class AffinityODESolver {
  // Agent parameters (resolved from archetypes)
  private aR: number;   // R damping rate
  private bRJ: number;  // R coupling to J
  private aJ: number;   // J damping rate
  private bJR: number;  // J coupling to R

  // Sternberg extension
  private sternberg: SternbergParams;
  private useSternberg: boolean;

  // Nash effort control
  private nash: NashEffortParams;
  private useNash: boolean;

  // Current state
  private R: number;
  private J: number;
  private I: number;  // Intimacy
  private P: number;  // Passion
  private C: number;  // Commitment
  private effortR: number;
  private effortJ: number;

  // Bookkeeping
  private config: AffinityConfig;
  private simulationTime = 0;
  private stepCount = 0;
  private lastStepMs = 0;

  // Forcing functions
  private fR: (t: number) => number;
  private fJ: (t: number) => number;

  constructor(config: AffinityConfig) {
    this.config = config;

    // Resolve agent parameters from archetypes
    const agent0 = config.agents[0];
    const agent1 = config.agents[1];

    const resolveParams = (agent: AgentParams): { dampingRate: number; couplingToPartner: number } => {
      if (agent.archetype && agent.archetype !== 'custom') {
        const preset = ARCHETYPE_PARAMS[agent.archetype];
        return preset ?? { dampingRate: agent.dampingRate, couplingToPartner: agent.couplingToPartner };
      }
      return { dampingRate: agent.dampingRate, couplingToPartner: agent.couplingToPartner };
    };

    const params0 = resolveParams(agent0);
    const params1 = resolveParams(agent1);

    this.aR = params0.dampingRate;
    this.bRJ = params0.couplingToPartner;
    this.aJ = params1.dampingRate;
    this.bJR = params1.couplingToPartner;

    // External forcing
    this.fR = agent0.forcing ?? (() => 0);
    this.fJ = agent1.forcing ?? (() => 0);

    // Initial states
    const initFeelings = config.initialFeelings ?? [0, 0];
    this.R = initFeelings[0];
    this.J = initFeelings[1];

    // Sternberg extension
    this.useSternberg = config.enableSternberg ?? false;
    this.sternberg = config.sternberg ?? DEFAULT_STERNBERG;
    const initSternberg = config.initialSternbergState ?? [0, 0, 0];
    this.I = initSternberg[0];
    this.P = initSternberg[1];
    this.C = initSternberg[2];

    // Nash effort control
    this.useNash = config.nashEffort?.enabled ?? false;
    this.nash = { ...DEFAULT_NASH, ...config.nashEffort };
    this.effortR = this.useNash ? 0.5 : NaN;
    this.effortJ = this.useNash ? 0.5 : NaN;
  }

  /**
   * Derivatives for the coupled feeling ODEs (Strogatz-Rinaldi).
   *
   * dR/dt = -a_R * R + b_RJ * J + f_R(t)
   * dJ/dt = -a_J * J + b_JR * R + f_J(t)
   */
  private feelingDerivatives(R: number, J: number, t: number): [number, number] {
    const dR = -this.aR * R + this.bRJ * J + this.fR(t);
    const dJ = -this.aJ * J + this.bJR * R + this.fJ(t);
    return [dR, dJ];
  }

  /**
   * Derivatives for the Sternberg triangular model.
   *
   * dI/dt = -decay_I * I + coupling_I * reaction(R,J)
   * dP/dt = -decay_P * P + arousal_P * |R*J|^0.5 - sat_P * P^2
   * dC/dt = -decay_C * C + coupling_C * commitment(I, P)
   */
  private sternbergDerivatives(
    I: number, P: number, C: number,
    R: number, J: number,
  ): [number, number, number] {
    const sp = this.sternberg;

    // Reaction function: geometric mean of feelings (always positive)
    const reaction = Math.sqrt(Math.abs(R * J) + 1e-10) * Math.sign(R * J + 1e-10);

    // Arousal function: intensity of emotional interaction
    const arousal = sp.passionArousal * (R * R + J * J) / (1 + Math.abs(R) + Math.abs(J));

    // Commitment function: weighted sum of intimacy and passion
    const commitment = I * 0.6 + P * 0.4;

    const dI = -sp.intimacyDecay * I + sp.intimacyCoupling * reaction;
    const dP = -sp.passionDecay * P + arousal - sp.passionSaturation * P * P;
    const dC = -sp.commitmentDecay * C + sp.commitmentCoupling * commitment;

    return [dI, dP, dC];
  }

  /**
   * Nash-equilibrium effort adaptation.
   *
   * Each agent adjusts effort to balance personal well-being against
   * relational contribution. Best-response dynamics converge to
   * Nash equilibrium where neither agent benefits from unilateral deviation.
   */
  private adaptEffort(R: number, J: number, effortR: number, effortJ: number): [number, number] {
    if (!this.useNash) return [NaN, NaN];

    const { wellBeingWeight, relationalWeight, maxEffort, adaptationRate } = this.nash;

    // Marginal payoff: well-being from personal state + relational contribution
    // Best response for R given J's effort
    const payoffR = wellBeingWeight * Math.abs(R) / (1 + effortR)
      + relationalWeight * effortJ * effortR / (1 + effortJ);

    // Best response for J given R's effort
    const payoffJ = wellBeingWeight * Math.abs(J) / (1 + effortJ)
      + relationalWeight * effortR * effortJ / (1 + effortR);

    // Gradient ascent with projection to [0, maxEffort]
    const newEffortR = Math.max(0, Math.min(maxEffort,
      effortR + adaptationRate * payoffR));
    const newEffortJ = Math.max(0, Math.min(maxEffort,
      effortJ + adaptationRate * payoffJ));

    return [newEffortR, newEffortJ];
  }

  /**
   * Advance the relational state by dt seconds using RK4 integration.
   */
  step(dt: number): void {
    const t0 = performance.now();
    const effectiveDt = dt > 0 ? dt : this.config.timeStep;

    // ── RK4 for feeling ODEs ─────────────────────────────────────────
    const t = this.simulationTime;

    // Nash effort coupling (effort modulates coupling strength)
    const effortModR = this.useNash ? this.effortR : 1.0;
    const effortModJ = this.useNash ? this.effortJ : 1.0;

    // Save original coupling for temporary replacement
    const origBRJ = this.bRJ;
    const origBJR = this.bJR;

    // Apply effort modulation to coupling
    this.bRJ = origBRJ * effortModR;
    this.bJR = origBJR * effortModJ;

    const k1R_J = this.feelingDerivatives(this.R, this.J, t);
    const k1R = k1R_J[0];
    const k1J = k1R_J[1];

    const k2R_J = this.feelingDerivatives(
      this.R + 0.5 * effectiveDt * k1R,
      this.J + 0.5 * effectiveDt * k1J,
      t + 0.5 * effectiveDt,
    );
    const k2R = k2R_J[0];
    const k2J = k2R_J[1];

    const k3R_J = this.feelingDerivatives(
      this.R + 0.5 * effectiveDt * k2R,
      this.J + 0.5 * effectiveDt * k2J,
      t + 0.5 * effectiveDt,
    );
    const k3R = k3R_J[0];
    const k3J = k3R_J[1];

    const k4R_J = this.feelingDerivatives(
      this.R + effectiveDt * k3R,
      this.J + effectiveDt * k3J,
      t + effectiveDt,
    );
    const k4R = k4R_J[0];
    const k4J = k4R_J[1];

    const newR = this.R + (effectiveDt / 6) * (k1R + 2 * k2R + 2 * k3R + k4R);
    const newJ = this.J + (effectiveDt / 6) * (k1J + 2 * k2J + 2 * k3J + k4J);

    // Restore original coupling
    this.bRJ = origBRJ;
    this.bJR = origBJR;

    this.R = newR;
    this.J = newJ;

    // ── RK4 for Sternberg extension (if enabled) ─────────────────────
    if (this.useSternberg) {
      const sk1 = this.sternbergDerivatives(this.I, this.P, this.C, this.R, this.J);
      const sk2 = this.sternbergDerivatives(
        this.I + 0.5 * effectiveDt * sk1[0],
        this.P + 0.5 * effectiveDt * sk1[1],
        this.C + 0.5 * effectiveDt * sk1[2],
        this.R, this.J,
      );
      const sk3 = this.sternbergDerivatives(
        this.I + 0.5 * effectiveDt * sk2[0],
        this.P + 0.5 * effectiveDt * sk2[1],
        this.C + 0.5 * effectiveDt * sk2[2],
        this.R, this.J,
      );
      const sk4 = this.sternbergDerivatives(
        this.I + effectiveDt * sk3[0],
        this.P + effectiveDt * sk3[1],
        this.C + effectiveDt * sk3[2],
        this.R, this.J,
      );

      this.I += (effectiveDt / 6) * (sk1[0] + 2 * sk2[0] + 2 * sk3[0] + sk4[0]);
      this.P += (effectiveDt / 6) * (sk1[1] + 2 * sk2[1] + 2 * sk3[1] + sk4[1]);
      this.C += (effectiveDt / 6) * (sk1[2] + 2 * sk2[2] + 2 * sk3[2] + sk4[2]);
    }

    // ── Nash effort adaptation ────────────────────────────────────────
    if (this.useNash) {
      const [newEffortR, newEffortJ] = this.adaptEffort(this.R, this.J, this.effortR, this.effortJ);
      this.effortR = newEffortR;
      this.effortJ = newEffortJ;
    }

    this.simulationTime += effectiveDt;
    this.stepCount++;
    this.lastStepMs = performance.now() - t0;
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /** Get current state as a snapshot */
  getState(): AffinityState {
    return {
      time: this.simulationTime,
      R: this.R,
      J: this.J,
      intimacy: this.useSternberg ? this.I : NaN,
      passion: this.useSternberg ? this.P : NaN,
      commitment: this.useSternberg ? this.C : NaN,
      effortR: this.useNash ? this.effortR : NaN,
      effortJ: this.useNash ? this.effortJ : NaN,
      stepCount: this.stepCount,
      lastStepMs: this.lastStepMs,
    };
  }

  /** Get state vector as Float32Array: [R, J, I, P, C, effortR, effortJ] */
  getStateVector(): Float32Array {
    return new Float32Array([
      this.R,
      this.J,
      this.useSternberg ? this.I : 0,
      this.useSternberg ? this.P : 0,
      this.useSternberg ? this.C : 0,
      this.useNash ? this.effortR : 0,
      this.useNash ? this.effortJ : 0,
    ]);
  }

  /** Get solver statistics (implements SimSolver contract) */
  getStats(): AffinityStats {
    return {
      time: this.simulationTime,
      R: this.R,
      J: this.J,
      intimacy: this.useSternberg ? this.I : NaN,
      passion: this.useSternberg ? this.P : NaN,
      commitment: this.useSternberg ? this.C : NaN,
      effortR: this.useNash ? this.effortR : NaN,
      effortJ: this.useNash ? this.effortJ : NaN,
      stepCount: this.stepCount,
      lastStepMs: this.lastStepMs,
      stateVector: this.getStateVector(),
      sternbergEnabled: this.useSternberg,
      nashEnabled: this.useNash,
    };
  }

  /** Point query: feeling state at current time */
  getFeelings(): { R: number; J: number } {
    return { R: this.R, J: this.J };
  }

  /** Point query: Sternberg state at current time (throws if not enabled) */
  getSternbergState(): { intimacy: number; passion: number; commitment: number } {
    if (!this.useSternberg) {
      throw new Error('Sternberg extension not enabled; set enableSternberg: true in config');
    }
    return { intimacy: this.I, passion: this.P, commitment: this.C };
  }

  /** Apply an impulse (external event) to one or both agents */
  applyImpulse(deltaR: number, deltaJ: number): void {
    this.R += deltaR;
    this.J += deltaJ;
  }

  /** Update forcing function for an agent at runtime */
  setForcing(agentIndex: 0 | 1, fn: (t: number) => number): void {
    if (agentIndex === 0) {
      this.fR = fn;
    } else {
      this.fJ = fn;
    }
  }

  /** Update coupling parameters at runtime (e.g., personality shift) */
  setCoupling(agentIndex: 0 | 1, dampingRate: number, couplingToPartner: number): void {
    if (agentIndex === 0) {
      this.aR = dampingRate;
      this.bRJ = couplingToPartner;
    } else {
      this.aJ = dampingRate;
      this.bJR = couplingToPartner;
    }
  }

  dispose(): void {
    // No GPU resources to release (pure CPU ODE solver)
  }
}