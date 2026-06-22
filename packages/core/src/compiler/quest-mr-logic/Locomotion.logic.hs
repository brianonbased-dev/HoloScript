// Continuous MMO-locomotion integration MATH — authored in .hs, compiled to on-device Kotlin by
// compile_to_quest (compile_to_kotlin, Rust/WASM grammar). This is the canonical source for the
// per-tick locomotion arithmetic; the Kotlin in android-mr/.../StarterSampleActivity.kt
// (updateLocomotion) is @generated from THESE functions and must not be hand-edited
// (F.126 native authoring; D.101 language work; F.014 single canonical parser).
//
// FUNCTIONAL-CORE / IMPERATIVE-SHELL split (the whole point): these functions are PURE,
// single-assignment Float math with no state and no host calls. ALL the statefulness
// (playerX / playerZ / playerYaw accumulated across ticks, lastLocoNanos) and EVERY SDK/host call
// (scene.getViewerPose, scene.setViewOrigin, Query.where{}.forEach<Controller>, c.isDown(ButtonBits…),
// System.nanoTime) STAY in the Kotlin shell updateLocomotion(). The shell computes the raw
// gaze-forward components (an SDK Pose subtraction it cannot express in .hs) and the stick inputs,
// then feeds them through these functions and writes the results back to the rig. The shell does NO
// arithmetic of its own beyond what cannot be expressed (the SDK vector subtraction).
//
// The .hs numeric subset is single-assignment Float: literals compile with the Kotlin `f` suffix,
// `+ - * /` keep their parsed grouping (re-parenthesized on emit), and `sqrt(x)` maps to
// kotlin.math.sqrt(x).

// New rig heading after a right-stick turn this tick (degrees). `turn` is the OR'd stick sign
// (-1/0/+1), `turnSpeed` deg/s, `dt` seconds since the last tick.
function newYaw(yaw, turn, turnSpeed, dt) {
  return yaw + turn * turnSpeed * dt
}

// Length of the ground-flattened gaze-forward vector (the shell passes its x/z components).
function gazeLength(fx, fz) {
  return sqrt(fx * fx + fz * fz)
}

// One component of the gaze-forward vector normalized to unit length (call once per axis).
function normalize(component, len) {
  return component / len
}

// Ground-RIGHT axis = gaze-forward rotated 90° on the ground plane: (rx, rz) = (-fz, fx).
// Only the X component carries computation (a negation); rz = fx is a pure identity copy — a
// variable binding, not math — so the shell binds `rz = fx` directly. A no-op `.hs` passthrough
// `function groundRightZ(fx) { return fx }` would (correctly) carry no arithmetic and so could not
// be typed Float by usage; expressing an identity as a function would be fake structure, not native.
function groundRightX(fz) {
  return -fz
}

// Integrate world position one tick along forward (fwd) + strafe inputs, in the gaze-relative
// basis (fx/fz = unit gaze-forward, rx/rz = unit ground-right). moveSpeed m/s, dt seconds.
function newX(x, fwd, fx, strafe, rx, moveSpeed, dt) {
  return x + (fwd * fx + strafe * rx) * moveSpeed * dt
}

function newZ(z, fwd, fz, strafe, rz, moveSpeed, dt) {
  return z + (fwd * fz + strafe * rz) * moveSpeed * dt
}
