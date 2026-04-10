# M.010.08 — Mobile Spatial Authoring (Gyro + Touch) Execution Spec

Date: 2026-04-04  
Owner: Copilot execution lane  
Status: Ready for implementation

## Goal

Allow creators to build and edit `.holo` scenes directly from a phone using motion (gyro/IMU) for camera pose and touch gestures for object manipulation.

## Product behavior

1. User opens Mobile Authoring mode.
2. Device motion controls camera/look direction.
3. Touch gestures place/select/move/rotate/scale scene objects.
4. Authoring operations update scene graph in real time.
5. User exports or syncs resulting `.holo` composition.

## Scope

### In scope (v1)

- gyro/IMU camera orientation pipeline
- touch gesture recognizers for object transforms
- transform gizmo-lite mobile UI
- edit history (undo/redo) for core operations
- save/export to `.holo`

### Out of scope (v1)

- full desktop parity for advanced editors
- multi-user simultaneous authoring conflicts
- scene scripting IDE features on mobile

## Architecture

### 1) Sensor input layer

```ts
interface MotionPose {
  timestampMs: number;
  orientationQuat: [number, number, number, number];
  stabilityScore: number; // 0..1
}
```

- smooth IMU pose with jitter filtering
- recenter support for drift correction

### 2) Gesture layer

```ts
type AuthoringGesture =
  | { type: 'tap'; x: number; y: number }
  | { type: 'pan'; dx: number; dy: number }
  | { type: 'pinch'; scale: number }
  | { type: 'twist'; radians: number }
```

- map gestures to selected object transform intents
- enforce transform constraints and snapping options

### 3) Scene edit pipeline

- command-based mutations (`add`, `move`, `rotate`, `scale`, `delete`)
- append to undo/redo stack
- emit scene graph delta for preview and persistence

### 4) Export path

- serialize current composition into valid `.holo`
- include viewport/camera metadata when useful for reopening session

## Proposed code touch points

- `packages/studio/` (mobile mode)
  - authoring UI shell + gesture controls
- `packages/runtime/`
  - motion pose adapter and filtered camera controller
- `packages/core/`
  - command schema + `.holo` serialization integration

## Failure taxonomy

- `MOTION_PERMISSION_DENIED`
- `MOTION_SIGNAL_UNSTABLE`
- `GESTURE_CONFLICT`
- `SCENE_MUTATION_REJECTED`
- `EXPORT_SERIALIZATION_FAILED`

## Acceptance criteria

1. User can create and transform objects in-scene using mobile controls.
2. Motion-driven camera remains stable with recenter option.
3. Undo/redo works for core transform operations.
4. Exported `.holo` reopens without structural errors.
5. Permission/failure states provide clear recovery guidance.

## Test plan

### Unit

- gesture-to-command mapping correctness
- IMU smoothing and recenter logic
- undo/redo stack behavior

### Integration

- motion + touch authoring loop
- selection + transform flow
- export + reopen validation

### Device validation

- iOS + Android mobile sessions
- varied lighting/motion scenarios
- long editing session stability

## Shipping slices

- Slice A: motion camera + basic object placement
- Slice B: transform gestures + undo/redo
- Slice C: export hardening + UX diagnostics + onboarding tips

## Metrics

- `mobile_authoring_session_start_total`
- `mobile_authoring_command_total{type}`
- `mobile_authoring_undo_redo_total`
- `mobile_authoring_export_success_total`
- `mobile_authoring_motion_recenter_total`

## Definition of done

- Mobile gyro+touch authoring workflow is production-usable for core `.holo` scene creation and editing.
