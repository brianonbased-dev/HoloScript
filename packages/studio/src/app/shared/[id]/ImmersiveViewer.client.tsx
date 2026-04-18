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

export function ImmersiveViewer({ code }: ImmersiveViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const [parsed] = useState(() => extractObjects(code));
  const [xrSupported, setXrSupported] = useState(false);
  const [xrActive, setXrActive] = useState(false);
  const [xrError, setXrError] = useState<string | null>(null);

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
    </div>
  );
}
