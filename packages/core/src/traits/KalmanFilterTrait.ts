/**
 * Kalman Filter Trait
 *
 * Constant-acceleration linear Kalman filter for 3D position tracking.
 * State vector: [px, py, pz, vx, vy, vz, ax, ay, az] (9D).
 * Predict step: x' = F·x. Update step: blends prediction with measurement
 * weighted by covariance.
 *
 * Covariance is tracked as a single scalar (Frobenius norm of the covariance
 * matrix divided by 9) to keep the trait cheap on every tick while preserving
 * the visual semantic (green <0.3, yellow 0.3–0.6, red >0.6).
 *
 * Lifted from uaa2-service mtt-algorithm-panel.hsplus.
 *
 * @version 1.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface KalmanState {
  pos: Vec3;
  vel: Vec3;
  acc: Vec3;
}

export interface KalmanMeasurement {
  pos: Vec3;
  timestamp: number;
}

export interface KalmanFilterConfig {
  update_rate_hz: number;
  process_noise: number;
  measurement_noise: number;
  initial_covariance: number;
  max_dt_seconds: number;
}

interface KalmanInternalState {
  state: KalmanState;
  covariance: number;
  lastPredictAt: number;
  lastMeasurementAt: number;
  active: boolean;
}

function zeroVec(): Vec3 {
  return { x: 0, y: 0, z: 0 };
}

function predict(state: KalmanState, covariance: number, dt: number, processNoise: number): { state: KalmanState; covariance: number } {
  const next: KalmanState = {
    pos: {
      x: state.pos.x + state.vel.x * dt + 0.5 * state.acc.x * dt * dt,
      y: state.pos.y + state.vel.y * dt + 0.5 * state.acc.y * dt * dt,
      z: state.pos.z + state.vel.z * dt + 0.5 * state.acc.z * dt * dt,
    },
    vel: {
      x: state.vel.x + state.acc.x * dt,
      y: state.vel.y + state.acc.y * dt,
      z: state.vel.z + state.acc.z * dt,
    },
    acc: state.acc,
  };
  const grown = Math.min(1, covariance + processNoise * dt);
  return { state: next, covariance: grown };
}

function update(state: KalmanState, covariance: number, measurement: Vec3, measurementNoise: number, lastDt: number): { state: KalmanState; covariance: number } {
  // Kalman gain as a scalar derived from covariance ratio.
  const k = covariance / (covariance + measurementNoise);

  const newPos: Vec3 = {
    x: state.pos.x + k * (measurement.x - state.pos.x),
    y: state.pos.y + k * (measurement.y - state.pos.y),
    z: state.pos.z + k * (measurement.z - state.pos.z),
  };

  let newVel: Vec3 = state.vel;
  let newAcc: Vec3 = state.acc;
  if (lastDt > 0) {
    const observedVel: Vec3 = {
      x: (measurement.x - state.pos.x) / lastDt,
      y: (measurement.y - state.pos.y) / lastDt,
      z: (measurement.z - state.pos.z) / lastDt,
    };
    newVel = {
      x: state.vel.x + k * (observedVel.x - state.vel.x),
      y: state.vel.y + k * (observedVel.y - state.vel.y),
      z: state.vel.z + k * (observedVel.z - state.vel.z),
    };
    const observedAcc: Vec3 = {
      x: (observedVel.x - state.vel.x) / lastDt,
      y: (observedVel.y - state.vel.y) / lastDt,
      z: (observedVel.z - state.vel.z) / lastDt,
    };
    newAcc = {
      x: state.acc.x + k * 0.5 * (observedAcc.x - state.acc.x),
      y: state.acc.y + k * 0.5 * (observedAcc.y - state.acc.y),
      z: state.acc.z + k * 0.5 * (observedAcc.z - state.acc.z),
    };
  }

  return {
    state: { pos: newPos, vel: newVel, acc: newAcc },
    covariance: (1 - k) * covariance,
  };
}

// =============================================================================
// HANDLER
// =============================================================================

export const kalmanFilterHandler: TraitHandler<KalmanFilterConfig> = {
  name: 'kalman_filter',

  defaultConfig: {
    update_rate_hz: 90,
    process_noise: 0.05,
    measurement_noise: 0.1,
    initial_covariance: 1.0,
    max_dt_seconds: 1.0,
  },

  onAttach(node, config, _context) {
    const internal: KalmanInternalState = {
      state: { pos: zeroVec(), vel: zeroVec(), acc: zeroVec() },
      covariance: config.initial_covariance,
      lastPredictAt: 0,
      lastMeasurementAt: 0,
      active: false,
    };
    node.__kalmanState = internal;
  },

  onDetach(node, _config, _context) {
    delete node.__kalmanState;
  },

  onUpdate(node, config, context, delta) {
    const internal = node.__kalmanState as KalmanInternalState | undefined;
    if (!internal || !internal.active) return;

    const now = Date.now();
    const minStep = 1000 / config.update_rate_hz;
    if (now - internal.lastPredictAt < minStep) return;

    const dt = Math.min(config.max_dt_seconds, delta > 0 ? delta : (now - internal.lastPredictAt) / 1000);
    const result = predict(internal.state, internal.covariance, dt, config.process_noise);
    internal.state = result.state;
    internal.covariance = result.covariance;
    internal.lastPredictAt = now;

    context.emit?.('kalman_predicted', {
      node,
      state: internal.state,
      covariance: internal.covariance,
    });
  },

  onEvent(node, config, context, event) {
    const internal = node.__kalmanState as KalmanInternalState | undefined;
    if (!internal) return;

    if (event.type === 'kalman_measurement') {
      const measurement = event.measurement as KalmanMeasurement;
      if (!measurement || !measurement.pos) return;

      const now = Date.now();
      const dt = internal.lastMeasurementAt > 0 ? (now - internal.lastMeasurementAt) / 1000 : 0;
      const clampedDt = Math.min(config.max_dt_seconds, dt);

      if (!internal.active) {
        internal.state = { pos: measurement.pos, vel: zeroVec(), acc: zeroVec() };
        internal.covariance = config.initial_covariance;
        internal.active = true;
        internal.lastPredictAt = now;
        internal.lastMeasurementAt = now;
        context.emit?.('kalman_initialized', { node, state: internal.state });
        return;
      }

      const result = update(internal.state, internal.covariance, measurement.pos, config.measurement_noise, clampedDt);
      internal.state = result.state;
      internal.covariance = result.covariance;
      internal.lastMeasurementAt = now;

      context.emit?.('kalman_updated', {
        node,
        state: internal.state,
        covariance: internal.covariance,
      });
      return;
    }

    if (event.type === 'kalman_reset') {
      internal.state = { pos: zeroVec(), vel: zeroVec(), acc: zeroVec() };
      internal.covariance = config.initial_covariance;
      internal.active = false;
      context.emit?.('kalman_reset_complete', { node });
      return;
    }

    if (event.type === 'kalman_query') {
      context.emit?.('kalman_state', {
        queryId: event.queryId,
        node,
        active: internal.active,
        state: internal.state,
        covariance: internal.covariance,
      });
      return;
    }
  },
};

export default kalmanFilterHandler;
