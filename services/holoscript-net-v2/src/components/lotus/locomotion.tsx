'use client';

/**
 * locomotion — three locomotion modes for the lotus world, all on raw three.js
 * (no @react-three/xr; the project must not add that dependency).
 *
 *  1. VR — WebXR *offset reference space* (the three.js-correct path; a camera
 *     "dolly" does NOT move you in WebXR). Left stick = gaze-relative smooth
 *     glide, right stick = SNAP turn, point+trigger = teleport to a floor target.
 *     Ported from packages/studio ImmersiveViewer.client.tsx (~lines 283-342).
 *  2. Desktop — pointer-drag to look + WASD/arrows to fly.
 *  3. Touch — an on-screen virtual joystick (left half = move, right/elsewhere
 *     drag = look). Required (founder: controllers AND touch screens).
 *
 * The desktop/touch rig moves the R3F camera directly. VR locomotion rewrites the
 * XR reference space each frame and is independent of the camera rig.
 */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useThree, useFrame } from '@react-three/fiber';

// ───────────────────────── VR (WebXR offset reference space) ─────────────────
export function VRLocomotion() {
  const gl = useThree((s) => s.gl);

  useEffect(() => {
    const renderer = gl as THREE.WebGLRenderer;
    renderer.xr.enabled = true;

    const player = new THREE.Vector3(0, 0, 0);
    let yaw = 0;
    let baseRefSpace: XRReferenceSpace | null = null;
    let lastNow = 0;
    let snapArmed = true; // right-stick snap-turn debounce

    const onStart = () => {
      baseRefSpace = (renderer.xr.getReferenceSpace() as XRReferenceSpace | null) ?? null;
      player.set(0, 0, 0);
      yaw = 0;
      lastNow = 0;
    };
    renderer.xr.addEventListener('sessionstart', onStart);

    const fwd = new THREE.Vector3();
    const right = new THREE.Vector3();
    const yAxis = new THREE.Vector3(0, 1, 0);
    const turnQuat = new THREE.Quaternion();
    const rotPos = new THREE.Vector3();
    const SPEED = 2.0; // m/s
    const SNAP = (30 * Math.PI) / 180; // 30° snap

    // Teleport: a controller select while pointing at the floor jumps the player
    // to the aimed ground point (point+trigger). Read controller pose from the
    // XRFrame each animation tick.
    const tmpMat = new THREE.Matrix4();
    const tmpPos = new THREE.Vector3();
    const tmpDir = new THREE.Vector3();

    const onSelect = (ev: Event) => {
      const e = ev as unknown as { inputSource?: XRInputSource };
      const session = renderer.xr.getSession();
      const src = e.inputSource;
      if (!session || !src || !src.targetRaySpace || !baseRefSpace) return;
      const frame = (renderer.xr as unknown as { getFrame?: () => XRFrame }).getFrame?.();
      if (!frame) return;
      const pose = frame.getPose(src.targetRaySpace, baseRefSpace);
      if (!pose) return;
      tmpMat.fromArray(pose.transform.matrix);
      tmpPos.setFromMatrixPosition(tmpMat);
      tmpDir.set(0, 0, -1).applyMatrix4(new THREE.Matrix4().extractRotation(tmpMat)).normalize();
      // Intersect the ray with the y=0 floor plane.
      if (Math.abs(tmpDir.y) > 1e-3) {
        const t = -tmpPos.y / tmpDir.y;
        if (t > 0 && t < 40) {
          const hit = tmpPos.clone().addScaledVector(tmpDir, t);
          player.x = hit.x;
          player.z = hit.z;
        }
      }
    };
    const onSessionStartAttachSelect = () => {
      const session = renderer.xr.getSession();
      session?.addEventListener('select', onSelect);
    };
    renderer.xr.addEventListener('sessionstart', onSessionStartAttachSelect);

    const applyOffset = () => {
      turnQuat.setFromAxisAngle(yAxis, -yaw);
      rotPos.copy(player).applyQuaternion(turnQuat).multiplyScalar(-1);
      const XRRT = (
        window as unknown as { XRRigidTransform?: typeof XRRigidTransform }
      ).XRRigidTransform;
      if (!XRRT || !baseRefSpace) return;
      const offset = new XRRT(
        { x: rotPos.x, y: 0, z: rotPos.z, w: 1 },
        { x: turnQuat.x, y: turnQuat.y, z: turnQuat.z, w: turnQuat.w }
      );
      renderer.xr.setReferenceSpace(baseRefSpace.getOffsetReferenceSpace(offset));
    };

    const loop = (now?: number) => {
      const session = renderer.xr.getSession();
      if (session && baseRefSpace) {
        const t = typeof now === 'number' ? now : 0;
        const dt = lastNow ? Math.min((t - lastNow) / 1000, 0.05) : 0.016;
        lastNow = t;
        let snapNeutral = true;
        for (const source of session.inputSources) {
          const gp = source.gamepad;
          if (!gp || gp.axes.length < 4) continue;
          const sx = gp.axes[2];
          const sy = gp.axes[3];
          if (source.handedness === 'right') {
            // SNAP turn (not smooth): one 30° step per stick push past threshold.
            if (Math.abs(sx) > 0.6) {
              snapNeutral = false;
              if (snapArmed) {
                yaw -= Math.sign(sx) * SNAP;
                snapArmed = false;
              }
            }
          } else {
            if (Math.abs(sx) < 0.12 && Math.abs(sy) < 0.12) continue;
            const cam = renderer.xr.getCamera();
            fwd.set(0, 0, -1).applyQuaternion(cam.quaternion);
            fwd.y = 0;
            fwd.normalize();
            right.set(1, 0, 0).applyQuaternion(cam.quaternion);
            right.y = 0;
            right.normalize();
            player.addScaledVector(fwd, -sy * SPEED * dt);
            player.addScaledVector(right, sx * SPEED * dt);
          }
        }
        if (snapNeutral) snapArmed = true; // re-arm when right stick returns to center
        applyOffset();
      }
    };

    // R3F owns setAnimationLoop; we pigg-back via the renderer's existing loop by
    // wrapping it. Simpler + safe: register our own pre-frame via an onBeforeRender
    // would miss XR timing, so we wrap setAnimationLoop preserving R3F's callback.
    const prev = (renderer as unknown as { _xrLocomotionPatched?: boolean })._xrLocomotionPatched;
    if (!prev) {
      const origSetLoop = renderer.setAnimationLoop.bind(renderer);
      renderer.setAnimationLoop = (cb: XRFrameRequestCallback | null) => {
        if (cb === null) return origSetLoop(null);
        origSetLoop((time: number, frame: XRFrame) => {
          loop(time);
          cb(time, frame);
        });
      };
      (renderer as unknown as { _xrLocomotionPatched?: boolean })._xrLocomotionPatched = true;
    }

    return () => {
      renderer.xr.removeEventListener('sessionstart', onStart);
      renderer.xr.removeEventListener('sessionstart', onSessionStartAttachSelect);
      const session = renderer.xr.getSession();
      session?.removeEventListener('select', onSelect);
    };
  }, [gl]);

  return null;
}

// ───────────────────────── Desktop + Touch (camera rig) ──────────────────────
export interface MoveState {
  // movement in camera-local space (-1..1)
  moveX: number;
  moveZ: number;
  // look deltas accumulated since last frame (radians)
  lookYaw: number;
  lookPitch: number;
}

export function DesktopTouchControls({
  target,
  enabled,
}: {
  target: [number, number, number];
  enabled: boolean;
}) {
  const camera = useThree((s) => s.camera);
  const move = useRef<MoveState>({ moveX: 0, moveZ: 0, lookYaw: 0, lookPitch: 0 });
  const yawRef = useRef(0);
  const pitchRef = useRef(0);

  // Initialize yaw/pitch from the camera's starting orientation toward the target.
  useEffect(() => {
    const dir = new THREE.Vector3(...target).sub(camera.position).normalize();
    yawRef.current = Math.atan2(dir.x, dir.z) + Math.PI; // forward is -Z
    pitchRef.current = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1));
  }, [camera, target]);

  // ── Keyboard (WASD / arrows) ──
  useEffect(() => {
    if (!enabled) return;
    const keys = new Set<string>();
    const down = (e: KeyboardEvent) => {
      keys.add(e.key.toLowerCase());
      updateFromKeys();
    };
    const up = (e: KeyboardEvent) => {
      keys.delete(e.key.toLowerCase());
      updateFromKeys();
    };
    const updateFromKeys = () => {
      const m = move.current;
      m.moveZ = (keys.has('w') || keys.has('arrowup') ? -1 : 0) + (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
      m.moveX = (keys.has('d') || keys.has('arrowright') ? 1 : 0) + (keys.has('a') || keys.has('arrowleft') ? -1 : 0);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [enabled]);

  // ── Pointer-drag to look (desktop mouse + touch "look" drags routed here) ──
  useEffect(() => {
    if (!enabled) return;
    const dom = camera ? document : null;
    if (!dom) return;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    const start = (x: number, y: number) => {
      dragging = true;
      lastX = x;
      lastY = y;
    };
    const moveLook = (x: number, y: number) => {
      if (!dragging) return;
      move.current.lookYaw -= (x - lastX) * 0.0035;
      move.current.lookPitch -= (y - lastY) * 0.0035;
      lastX = x;
      lastY = y;
    };
    const end = () => {
      dragging = false;
    };
    const onMouseDown = (e: MouseEvent) => start(e.clientX, e.clientY);
    const onMouseMove = (e: MouseEvent) => moveLook(e.clientX, e.clientY);
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', end);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', end);
    };
  }, [camera, enabled]);

  // The on-screen joystick + touch-look are driven by the DOM overlay (below) via
  // this shared ref published on window for the overlay to write into.
  useEffect(() => {
    (window as unknown as { __lotusMove?: MoveState }).__lotusMove = move.current;
    return () => {
      delete (window as unknown as { __lotusMove?: MoveState }).__lotusMove;
    };
  }, []);

  useFrame((_, delta) => {
    if (!enabled) return;
    const m = move.current;
    const SPEED = 4.5;
    yawRef.current += m.lookYaw;
    pitchRef.current = THREE.MathUtils.clamp(pitchRef.current + m.lookPitch, -1.2, 1.2);
    m.lookYaw = 0;
    m.lookPitch = 0;

    const yaw = yawRef.current;
    const pitch = pitchRef.current;
    const forward = new THREE.Vector3(
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      Math.cos(yaw) * Math.cos(pitch)
    ).multiplyScalar(-1); // forward is -Z when yaw=0
    const flatForward = new THREE.Vector3(forward.x, 0, forward.z).normalize();
    const rightVec = new THREE.Vector3().crossVectors(flatForward, new THREE.Vector3(0, 1, 0)).normalize().multiplyScalar(-1);

    camera.position.addScaledVector(flatForward, -m.moveZ * SPEED * delta);
    camera.position.addScaledVector(rightVec, m.moveX * SPEED * delta);
    camera.position.y = THREE.MathUtils.clamp(camera.position.y, 0.6, 14);

    const lookAt = camera.position.clone().add(forward);
    camera.lookAt(lookAt);
  });

  return null;
}
