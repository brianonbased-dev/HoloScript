'use client';

/**
 * ImmersiveViewer — WebXR-capable three.js preview for /shared/[id].
 *
 * Parses the scene with @holoscript/core's HoloCompositionParser, renders a
 * 2D preview, and exposes an "Enter VR" button that starts an immersive-vr
 * session reusing the same scene.
 *
 * Auto-presents the "Enter VR" CTA on Meta Browser (Oculus Browser UA) so
 * opening /w/<id> from a Quest takes the user into VR with one tap.
 *
 * Intentionally narrow: handles primitives (cube, sphere, cylinder, cone,
 * torus, plane, capsule) with position + scale + color. Traits are displayed
 * in the summary but not animated in v0. Anything unsupported falls back
 * gracefully and the page still renders the source code.
 *
 * See:
 *  - research/quest3-iphone-moment/c-studio-share-path-map.md (G2)
 *  - packages/studio/src/app/shared/[id]/page.tsx (server parent)
 */

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { HoloCompositionParser } from '@holoscript/core';

interface ImmersiveViewerProps {
  code: string;
  /** Scene name — used as the share title when Publish runs. */
  name?: string;
}


type ParsedObject = {
  name: string;
  type: string;
  position: [number, number, number];
  scale: [number, number, number];
  color: string;
  traits: string[];
};

/** Minimal AST -> ParsedObject extraction for the viewer. */
function extractObjects(source: string): { objects: ParsedObject[]; parseOk: boolean; error?: string } {
  try {
    const parser = new HoloCompositionParser();
    const result = parser.parse(source);
    if (!result.success || !result.ast) {
      return {
        objects: [],
        parseOk: false,
        error: result.errors?.[0]?.message ?? 'parse failed',
      };
    }

    const rawObjects = (result.ast as unknown as { objects?: unknown[] }).objects ?? [];
    const out: ParsedObject[] = [];
    for (const raw of rawObjects) {
      const o = raw as {
        name?: string;
        properties?: Array<{ key: string; value: unknown }>;
        traits?: Array<{ name?: string }>;
      };
      const props = new Map<string, unknown>();
      for (const p of o.properties ?? []) props.set(p.key, p.value);

      const type = String(props.get('type') ?? 'sphere').toLowerCase();
      const pos = props.get('position');
      const scale = props.get('scale');
      const color = String(props.get('color') ?? '#ffffff');
      const position: [number, number, number] = Array.isArray(pos) && pos.length >= 3
        ? [Number(pos[0]) || 0, Number(pos[1]) || 0, Number(pos[2]) || 0]
        : [0, 1, 0];
      const scl: [number, number, number] = Array.isArray(scale) && scale.length >= 3
        ? [Number(scale[0]) || 1, Number(scale[1]) || 1, Number(scale[2]) || 1]
        : [1, 1, 1];

      out.push({
        name: String(o.name ?? 'object'),
        type,
        position,
        scale: scl,
        color,
        traits: (o.traits ?? []).map((t) => String(t.name ?? 'unknown')),
      });
    }
    return { objects: out, parseOk: true };
  } catch (err) {
    return {
      objects: [],
      parseOk: false,
      error: err instanceof Error ? err.message : 'unknown parse error',
    };
  }
}

function makeMesh(obj: ParsedObject): THREE.Mesh {
  let geom: THREE.BufferGeometry;
  const [sx, sy, sz] = obj.scale;
  switch (obj.type) {
    case 'cube':
    case 'box':
      geom = new THREE.BoxGeometry(sx, sy, sz);
      break;
    case 'cylinder':
      geom = new THREE.CylinderGeometry(sx / 2, sx / 2, sy, 32);
      break;
    case 'cone':
      geom = new THREE.ConeGeometry(sx / 2, sy, 32);
      break;
    case 'torus':
      geom = new THREE.TorusGeometry(sx / 2, sx / 6, 16, 48);
      break;
    case 'plane':
      geom = new THREE.PlaneGeometry(sx, sz);
      break;
    case 'capsule':
      geom = new THREE.CapsuleGeometry(sx / 2, sy, 8, 16);
      break;
    default:
      geom = new THREE.SphereGeometry(sx / 2, 32, 32);
  }
  const material = new THREE.MeshStandardMaterial({ color: obj.color, roughness: 0.5 });
  const mesh = new THREE.Mesh(geom, material);
  mesh.position.set(obj.position[0], obj.position[1], obj.position[2]);
  mesh.name = obj.name;
  return mesh;
}

function isOculusBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /OculusBrowser/i.test(navigator.userAgent);
}

export function ImmersiveViewer({ code, name }: ImmersiveViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  // 3D "Publish" button mesh + 3D QR display plane — created when entering VR.
  const publishButtonRef = useRef<THREE.Mesh | null>(null);
  const qrPlaneRef = useRef<THREE.Mesh | null>(null);
  const [parsed] = useState(() => extractObjects(code));
  const [xrSupported, setXrSupported] = useState(false);
  const [xrActive, setXrActive] = useState(false);
  const [xrError, setXrError] = useState<string | null>(null);
  const [publishState, setPublishState] = useState<'idle' | 'publishing' | 'ready' | 'error'>('idle');
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);

  // Set up three.js scene + animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!parsed.parseOk) return;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(typeof window !== 'undefined' ? window.devicePixelRatio : 1);
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    renderer.xr.enabled = true;
    renderer.setClearColor(0x0a0a12, 1);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(5, 10, 5);
    scene.add(dir);
    for (const o of parsed.objects) scene.add(makeMesh(o));
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(60, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
    camera.position.set(0, 1.6, 4);
    camera.lookAt(0, 1, 0);
    cameraRef.current = camera;

    let raf = 0;
    const tick = () => {
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    renderer.setAnimationLoop(() => renderer.render(scene, camera)); // XR-aware loop
    tick();

    const handleResize = () => {
      if (!canvas) return;
      renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
      camera.aspect = canvas.clientWidth / canvas.clientHeight;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(raf);
      renderer.setAnimationLoop(null);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
    };
  }, [parsed]);

  // Feature-detect immersive-vr
  useEffect(() => {
    const xr = (navigator as unknown as { xr?: { isSessionSupported: (m: string) => Promise<boolean> } }).xr;
    if (!xr) return;
    xr.isSessionSupported('immersive-vr').then(setXrSupported).catch(() => setXrSupported(false));
  }, []);

  const enterVR = async () => {
    setXrError(null);
    const renderer = rendererRef.current;
    if (!renderer) {
      setXrError('renderer not ready');
      return;
    }
    const xr = (navigator as unknown as {
      xr?: {
        requestSession: (
          m: string,
          o?: { optionalFeatures?: string[] }
        ) => Promise<XRSession>;
      };
    }).xr;
    if (!xr) {
      setXrError('WebXR not available');
      return;
    }
    try {
      const session = await xr.requestSession('immersive-vr', {
        optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'],
      });
      setXrActive(true);
      session.addEventListener('end', () => setXrActive(false));
      await renderer.xr.setSession(session as unknown as XRSession);
    } catch (e) {
      setXrError(e instanceof Error ? e.message : 'failed to enter VR');
    }
  };

  // Auto-enter on Oculus Browser once XR support is confirmed
  useEffect(() => {
    if (xrSupported && isOculusBrowser() && !xrActive && parsed.parseOk) {
      const t = setTimeout(() => void enterVR(), 1500);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xrSupported, parsed.parseOk]);

  /**
   * G6 — Publish the current scene and display a 3D QR code with the share
   * URL in-world. The user points their friend's phone at it.
   */
  const publishInVR = async () => {
    const scene = sceneRef.current;
    if (!scene) return;
    setPublishState('publishing');
    setXrError(null);

    // Flash the button yellow to show "working"
    const btn = publishButtonRef.current;
    const btnMat = btn?.material as THREE.MeshStandardMaterial | undefined;
    const originalColor = btnMat?.color.clone();
    if (btnMat) btnMat.color.setHex(0xeab308);

    try {
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name ?? 'Voice-authored scene',
          code,
          author: 'Anonymous',
        }),
      });
      const data = (await res.json()) as { id?: string; url?: string; error?: string };
      if (!res.ok || !data.id) throw new Error(data.error ?? `HTTP ${res.status}`);

      // Prefer short /w/<id> URL over /shared/<id>
      const base = window.location.origin;
      const shortUrl = `${base}/w/${data.id}`;
      setPublishedUrl(shortUrl);

      // Generate the QR bitmap and map it onto the 3D plane.
      const qr = await import('qrcode');
      const dataUrl = await qr.toDataURL(shortUrl, { width: 512, margin: 2 });
      const tex = await new THREE.TextureLoader().loadAsync(dataUrl);
      tex.colorSpace = THREE.SRGBColorSpace;

      // Create or update the QR plane mesh
      if (!qrPlaneRef.current) {
        const plane = new THREE.Mesh(
          new THREE.PlaneGeometry(0.6, 0.6),
          new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })
        );
        // In front of the user at roughly head height
        plane.position.set(0, 1.6, -1.2);
        scene.add(plane);
        qrPlaneRef.current = plane;
      } else {
        const mat = qrPlaneRef.current.material as THREE.MeshBasicMaterial;
        mat.map = tex;
        mat.needsUpdate = true;
        qrPlaneRef.current.visible = true;
      }

      setPublishState('ready');
      if (btnMat) btnMat.color.setHex(0x16a34a); // green = success
    } catch (e) {
      setPublishState('error');
      setXrError(e instanceof Error ? e.message : 'publish failed');
      if (btnMat && originalColor) btnMat.color.copy(originalColor);
    }
  };

  // When entering VR, spawn the publish button in the scene + wire XR select.
  useEffect(() => {
    const scene = sceneRef.current;
    const renderer = rendererRef.current;
    if (!xrActive || !scene || !renderer) return;

    // Spawn a small purple cube as the publish button, to the user's right.
    const btn = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.2, 0.2),
      new THREE.MeshStandardMaterial({ color: 0x7c3aed, emissive: 0x2e1065, emissiveIntensity: 0.4 })
    );
    btn.position.set(0.5, 1.4, -0.8);
    btn.userData.isPublishButton = true;
    scene.add(btn);
    publishButtonRef.current = btn;

    // Raycast on XR controller select events; if the publish button was hit, fire publishInVR.
    const raycaster = new THREE.Raycaster();
    const tmpMatrix = new THREE.Matrix4();
    const handleSelect = (e: Event) => {
      const xrEvent = e as unknown as { target: { matrixWorld?: THREE.Matrix4 } };
      const mw = xrEvent.target.matrixWorld;
      if (!mw) return;
      tmpMatrix.identity().extractRotation(mw);
      const origin = new THREE.Vector3().setFromMatrixPosition(mw);
      const direction = new THREE.Vector3(0, 0, -1).applyMatrix4(tmpMatrix);
      raycaster.set(origin, direction);
      const hits = raycaster.intersectObject(btn, false);
      if (hits.length > 0) void publishInVR();
    };

    // Controllers 0 and 1 (left/right). three.js's XRTargetRaySpace uses a
    // strict EventListener<...> type we can't match with a plain (e: Event)
    // signature; cast to a looser shape for the add/remove calls.
    const c0 = renderer.xr.getController(0) as unknown as {
      addEventListener: (type: string, fn: (e: Event) => void) => void;
      removeEventListener: (type: string, fn: (e: Event) => void) => void;
    };
    const c1 = renderer.xr.getController(1) as unknown as {
      addEventListener: (type: string, fn: (e: Event) => void) => void;
      removeEventListener: (type: string, fn: (e: Event) => void) => void;
    };
    c0.addEventListener('select', handleSelect);
    c1.addEventListener('select', handleSelect);

    return () => {
      c0.removeEventListener('select', handleSelect);
      c1.removeEventListener('select', handleSelect);
      scene.remove(btn);
      publishButtonRef.current = null;
      if (qrPlaneRef.current) {
        scene.remove(qrPlaneRef.current);
        qrPlaneRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xrActive]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: 12,
        background: '#0f172a',
        border: '1px solid #1e293b',
        borderRadius: 12,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 500 }}>
          3D Preview — {parsed.objects.length} object{parsed.objects.length === 1 ? '' : 's'}
          {!parsed.parseOk && (
            <span style={{ color: '#f97316', marginLeft: 8 }}>
              (parse failed: {parsed.error})
            </span>
          )}
        </div>
        <button
          onClick={() => void enterVR()}
          disabled={!xrSupported || xrActive || !parsed.parseOk}
          style={{
            background: xrActive ? '#16a34a' : xrSupported ? '#7c3aed' : '#475569',
            color: 'white',
            border: 0,
            borderRadius: 8,
            padding: '10px 18px',
            fontSize: 14,
            fontWeight: 600,
            cursor: xrSupported && !xrActive ? 'pointer' : 'not-allowed',
          }}
        >
          {xrActive ? 'In VR' : xrSupported ? '🥽 Enter VR' : 'VR not supported'}
        </button>
      </div>

      {xrError && (
        <div
          style={{
            background: '#7f1d1d',
            color: '#fca5a5',
            padding: 8,
            borderRadius: 6,
            fontSize: 12,
          }}
        >
          {xrError}
        </div>
      )}

      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '50vh',
          minHeight: 320,
          maxHeight: 600,
          display: 'block',
          borderRadius: 8,
          background: '#0a0a12',
        }}
      />

      {/* Publish status — visible whether or not user is in VR.
          In-VR the cube button publishes; out-of-VR this button does.
          See G6 in research/quest3-iphone-moment/c-studio-share-path-map.md */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: '#94a3b8' }}>
        <button
          onClick={() => void publishInVR()}
          disabled={publishState === 'publishing' || !parsed.parseOk}
          style={{
            background:
              publishState === 'ready'
                ? '#16a34a'
                : publishState === 'error'
                  ? '#dc2626'
                  : publishState === 'publishing'
                    ? '#eab308'
                    : '#7c3aed',
            color: 'white',
            border: 0,
            borderRadius: 6,
            padding: '6px 14px',
            fontSize: 12,
            fontWeight: 500,
            cursor: publishState === 'publishing' ? 'wait' : 'pointer',
          }}
        >
          {publishState === 'idle' && '📤 Publish + QR'}
          {publishState === 'publishing' && '…'}
          {publishState === 'ready' && '✓ Published'}
          {publishState === 'error' && '× Error'}
        </button>
        {publishedUrl && (
          <code style={{ fontSize: 11, color: '#60a5fa', fontFamily: 'ui-monospace, monospace' }}>
            {publishedUrl}
          </code>
        )}
      </div>
    </div>
  );
}
