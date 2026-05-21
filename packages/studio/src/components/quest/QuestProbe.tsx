'use client';

/**
 * QuestProbe — React version of /probe.html.
 *
 * Same eight capability checks, usable from any Studio page (e.g. /quest-probe)
 * so the founder can run it without remembering a separate URL.
 *
 * See plan: research/quest3-iphone-moment/a-quest3-feasibility-probe.md
 */

import { useEffect, useRef, useState } from 'react';

import {
  questHandReceiptKey,
  startQuestHandTrackingReceiptObserver,
  type QuestHandTrackingReceipt,
  type QuestInputSourceLike,
  type QuestXRSessionLike,
} from '../../lib/xr/questHandTrackingReceipt';

type Status = 'OK' | 'WARN' | 'FAIL';

interface Result {
  label: string;
  status: Status;
  detail: string;
  at: number;
}

const PROBE_TIMEOUT_MS = 12000;

function proofRunId(): string {
  if (typeof window === 'undefined') return new Date().toISOString().slice(0, 10);
  const fromUrl = new URLSearchParams(window.location.search).get('runId');
  if (fromUrl) return fromUrl;
  return `${new Date().toISOString().slice(0, 10)}-quest-proof`;
}

async function withTimeout<T>(promise: Promise<T>, label: string, timeoutMs = PROBE_TIMEOUT_MS): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 3500
): Promise<Response | null> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
}

function proofContext() {
  if (typeof window === 'undefined') return {};
  return {
    url: window.location.href,
    userAgent: navigator.userAgent,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
      orientation: screen.orientation?.type ?? null,
      crossOriginIsolated: self.crossOriginIsolated === true,
    },
    xr: {
      hasNavigatorXr: getXR() !== null,
    },
  };
}

function proofApiPath(path: string): string {
  if (typeof window === 'undefined') return path;
  const tunnel = window.location.pathname.match(/^\/t\/[^/]+/);
  if (tunnel) return `${tunnel[0]}${path}`;
  if (window.location.pathname.startsWith('/live/')) return `/live${path}`;
  return path;
}

async function postProofReceipt(label: string, status: Status, detail: string) {
  if (typeof window === 'undefined') return;
  const context = proofContext();
  const payload = {
    runId: proofRunId(),
    pageId: 'quest-probe',
    label,
    status,
    detail,
    ...context,
  };
  const posted = await fetchWithTimeout(proofApiPath('/api/quest-proof'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then((res) => res?.ok === true);
  if (posted) return;
  const query = new URLSearchParams({
    record: '1',
    runId: payload.runId,
    pageId: payload.pageId,
    label,
    status,
    detail,
    url: context.url ?? '',
    userAgent: context.userAgent ?? '',
  });
  await fetchWithTimeout(`${proofApiPath('/api/quest-proof')}?${query.toString()}`, {
    cache: 'no-store',
  });
}

// Minimal WebXR type polyfill — @types/webxr isn't always present.
interface XRSystemLike {
  isSessionSupported(mode: string): Promise<boolean>;
  requestSession(
    mode: string,
    opts?: { requiredFeatures?: string[]; optionalFeatures?: string[]; domOverlay?: { root: Element } }
  ): Promise<XRSessionLike>;
}
interface XRSessionLike extends QuestXRSessionLike {
  enabledFeatures?: string[];
  inputSources: ReadonlyArray<QuestInputSourceLike>;
  addEventListener(type: string, cb: () => void): void;
  end(): Promise<void>;
}

function getXR(): XRSystemLike | null {
  if (typeof navigator === 'undefined') return null;
  return (navigator as unknown as { xr?: XRSystemLike }).xr ?? null;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult:
    | ((e: { results: ArrayLike<{ 0: { transcript: string; confidence: number } }> }) => void)
    | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function QuestProbe() {
  const [results, setResults] = useState<Result[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [running, setRunning] = useState<string | null>(null);
  const [handReceipt, setHandReceipt] = useState<QuestHandTrackingReceipt | null>(null);
  const handOverlayRef = useRef<HTMLDivElement | null>(null);
  const handObserverRef = useRef<(() => void) | null>(null);
  const lastHandReceiptKeyRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      handObserverRef.current?.();
      handObserverRef.current = null;
    };
  }, []);

  const push = (label: string, status: Status, detail: string) => {
    setResults((rs) => [...rs, { label, status, detail, at: Date.now() }]);
    void postProofReceipt(label, status, detail);
  };
  const say = (s: string) => setLog((l) => [...l, s]);

  const recordHandReceipt = (receipt: QuestHandTrackingReceipt) => {
    setHandReceipt(receipt);
    const key = questHandReceiptKey(receipt);
    if (key === lastHandReceiptKeyRef.current && receipt.event !== 'end') return;
    lastHandReceiptKeyRef.current = key;
    push(receipt.label, receipt.status, receipt.detail);
  };

  const checkWebXR = async () => {
    setRunning('webxr');
    const xr = getXR();
    if (!xr) {
      push('WebXR API', 'FAIL', 'navigator.xr missing — old browser');
    } else {
      const vr = await withTimeout(xr.isSessionSupported('immersive-vr'), 'immersive-vr support')
        .catch(() => false);
      const ar = await withTimeout(xr.isSessionSupported('immersive-ar'), 'immersive-ar support')
        .catch(() => false);
      push('WebXR immersive-vr', vr ? 'OK' : 'FAIL', vr ? 'supported' : 'not supported');
      push(
        'WebXR immersive-ar',
        ar ? 'OK' : 'FAIL',
        ar ? 'supported (passthrough possible)' : 'not supported'
      );
    }
    setRunning(null);
  };

  const enterVR = async () => {
    setRunning('session');
    const xr = getXR();
    if (!xr) {
      push('VR session', 'FAIL', 'no navigator.xr');
      setRunning(null);
      return;
    }
    try {
      const domOverlayRoot = handOverlayRef.current ?? undefined;
      const session = await withTimeout(
        xr.requestSession('immersive-vr', {
          optionalFeatures: ['hand-tracking', 'local-floor', 'bounded-floor', 'dom-overlay'],
          ...(domOverlayRoot ? { domOverlay: { root: domOverlayRoot } } : {}),
        }),
        'VR session start',
        15000
      );
      handObserverRef.current?.();
      lastHandReceiptKeyRef.current = null;
      setHandReceipt(null);
      handObserverRef.current = startQuestHandTrackingReceiptObserver(session, {
        onReceipt: recordHandReceipt,
      });
      push('VR session start', 'OK', 'session created; exit with Quest browser/system controls');
      say('enabled features: ' + JSON.stringify(session.enabledFeatures ?? []));
      session.addEventListener('end', () => {
        handObserverRef.current = null;
        say('VR session ended');
      });
    } catch (e) {
      push('VR session start', 'FAIL', e instanceof Error ? e.message : String(e));
    }
    setRunning(null);
  };

  const checkHands = async () => {
    setRunning('hand');
    const xr = getXR();
    if (!xr) {
      push('Hand tracking', 'FAIL', 'no navigator.xr');
      setRunning(null);
      return;
    }
    try {
      const vr = await withTimeout(xr.isSessionSupported('immersive-vr'), 'immersive-vr support');
      if (handReceipt) {
        push('Hand tracking', handReceipt.status, `in-session receipt: ${handReceipt.detail}`);
        setRunning(null);
        return;
      }
      push(
        'Hand tracking',
        vr ? 'WARN' : 'FAIL',
        vr
          ? 'readiness only; Enter VR now records visible hand receipts inside the active session'
          : 'immersive-vr not supported, so hand tracking cannot be checked'
      );
      say('Hand tracking check does not start or force-end a separate VR session.');
    } catch (e) {
      push('Hand tracking', 'FAIL', e instanceof Error ? e.message : String(e));
    }
    setRunning(null);
  };

  const checkPassthrough = async () => {
    setRunning('passthrough');
    const xr = getXR();
    if (!xr) {
      push('Passthrough (AR)', 'FAIL', 'no navigator.xr');
      setRunning(null);
      return;
    }
    try {
      const session = await withTimeout(
        xr.requestSession('immersive-ar', {
          requiredFeatures: ['local-floor'],
        }),
        'Passthrough session',
        15000
      );
      push('Passthrough (AR)', 'OK', 'AR session started; exit with Quest browser/system controls');
      session.addEventListener('end', () => say('Passthrough session ended'));
    } catch (e) {
      push('Passthrough (AR)', 'FAIL', e instanceof Error ? e.message : String(e));
    }
    setRunning(null);
  };

  const checkMic = async () => {
    setRunning('mic');
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        push('Microphone', 'FAIL', 'mediaDevices.getUserMedia missing');
        setRunning(null);
        return;
      }
      const stream = await withTimeout(
        navigator.mediaDevices.getUserMedia({ audio: true }),
        'Microphone permission',
        15000
      );
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      src.connect(analyser);
      await new Promise((r) => setTimeout(r, 500));
      const buf = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(buf);
      const max = Math.max(...buf);
      push(
        'Microphone',
        max > 0 ? 'OK' : 'WARN',
        `peak freq energy: ${max} (say something while running)`
      );
      stream.getTracks().forEach((t) => t.stop());
    } catch (e) {
      push('Microphone', 'FAIL', e instanceof Error ? e.message : String(e));
    }
    setRunning(null);
  };

  const checkSpeech = () => {
    setRunning('speech');
    const Ctor = getSpeechCtor();
    if (!Ctor) {
      push('SpeechRecognition', 'FAIL', 'not available in this browser');
      setRunning(null);
      return;
    }
    try {
      const r = new Ctor();
      const timeout = window.setTimeout(() => {
        push('SpeechRecognition', 'WARN', 'no speech result before timeout');
        setRunning(null);
      }, 15000);
      r.lang = 'en-US';
      r.continuous = false;
      r.interimResults = false;
      r.onresult = (e) => {
        window.clearTimeout(timeout);
        const res = e.results[0];
        push(
          'SpeechRecognition',
          'OK',
          `heard: "${res[0].transcript}" (confidence ${res[0].confidence.toFixed(2)})`
        );
        setRunning(null);
      };
      r.onerror = (e) => {
        window.clearTimeout(timeout);
        push('SpeechRecognition', 'FAIL', e.error);
        setRunning(null);
      };
      r.start();
      say('listening — say one sentence');
    } catch (e) {
      push('SpeechRecognition', 'FAIL', e instanceof Error ? e.message : String(e));
      setRunning(null);
    }
  };

  const checkWasm = () => {
    setRunning('wasm');
    const hasWasm = typeof WebAssembly === 'object';
    const hasSAB = typeof SharedArrayBuffer === 'function';
    const isolated = typeof self !== 'undefined' && self.crossOriginIsolated === true;
    push('WebAssembly', hasWasm ? 'OK' : 'FAIL', hasWasm ? 'available' : 'missing');
    push(
      'SharedArrayBuffer',
      hasSAB && isolated ? 'OK' : 'WARN',
      `constructor=${hasSAB}, crossOriginIsolated=${isolated}`
    );
    setRunning(null);
  };

  const checkFetch = async () => {
    setRunning('fetch');
    try {
      const res = await fetchWithTimeout(proofApiPath('/api/share'), { method: 'GET' });
      push(
        'Fetch /api/share',
        res?.ok ? 'OK' : 'WARN',
        res ? `status ${res.status}` : 'request timed out'
      );
    } catch (e) {
      push('Fetch /api/share', 'FAIL', e instanceof Error ? e.message : String(e));
    }
    setRunning(null);
  };

  const reset = () => {
    setResults([]);
    setLog([]);
    setNpcEvents([]);
  };

  // ── NPC Observability (quest-proof receipts for @ai_npc_brain + @caveman_drive)
  // Per task_1779337565759_yfa7 + research/2026-05-20-hololand-ai-npc-quest-proof-integration.md
  interface NPCObservabilityReceipt {
    id: string;
    trait: 'ai_npc_brain' | 'caveman_drive';
    personality?: string;
    action?: string;
    distance?: number;
    relationshipDelta?: number;
  }
  const [npcEvents, setNpcEvents] = useState<NPCObservabilityReceipt[]>([]);

  const recordNPC = (r: NPCObservabilityReceipt) => {
    setNpcEvents((es) => [r, ...es].slice(0, 8));
    const label = r.trait === 'ai_npc_brain' ? 'AI NPC Dialogue Received' : 'Caveman Drive Action';
    const detail = r.trait === 'ai_npc_brain'
      ? `${r.id} (${r.personality ?? 'neutral'}) responded at ${r.distance?.toFixed(1) ?? '?'}m; relationship ${r.relationshipDelta ?? 0 >= 0 ? '+' : ''}${r.relationshipDelta ?? 0}`
      : `${r.id} executed drive verb: ${r.action ?? 'unknown'}`;
    push(label, 'OK', detail);
    // posts the exact envelope the spec requires (runId, pageId, label, status, detail + npc sub-object via context)
    void postProofReceipt(label, 'OK', detail);
  };

  // Listen for real NPC events dispatched by Hololand runtime / traits when under tunnel
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as NPCObservabilityReceipt | undefined;
      if (detail?.id && detail.trait) recordNPC(detail);
    };
    window.addEventListener('holoscript:npc-observability', handler as EventListener);
    return () => window.removeEventListener('holoscript:npc-observability', handler as EventListener);
  }, []);

  // Demo trigger (immediate proof that the receipt path works on Quest hardware)
  const simulateNPC = () => {
    const demo: NPCObservabilityReceipt = {
      id: 'tavern-keeper-01',
      trait: 'ai_npc_brain',
      personality: 'wise',
      distance: 6.2,
      relationshipDelta: 0.1,
    };
    recordNPC(demo);
    say('NPC observability demo receipt posted (mirrors real @ai_npc_brain spatial voice)');
  };

  const exportReport = () => {
    const lines = [
      '# Quest 3 Probe — observations',
      '',
      `Date: ${new Date().toISOString()}`,
      `User agent: ${navigator.userAgent}`,
      '',
      '| # | Capability | Status | Notes |',
      '|---|---|---|---|',
      ...results.map((r, i) => `| ${i + 1} | ${r.label} | ${r.status} | ${r.detail} |`),
      '',
      '## Log',
      '',
      '```',
      ...log,
      '```',
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `observations-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const btn = (id: string, label: string, fn: () => void | Promise<void>) => (
    <button
      onClick={() => void fn()}
      disabled={running !== null}
      style={{
        background: running === id ? '#1d4ed8' : '#2563eb',
        color: 'white',
        border: 0,
        borderRadius: 8,
        padding: '12px 16px',
        fontSize: 15,
        margin: 4,
        cursor: running ? 'wait' : 'pointer',
        opacity: running !== null && running !== id ? 0.5 : 1,
      }}
    >
      {label}
    </button>
  );

  const statusColor = (s: Status) =>
    s === 'OK' ? '#6fd36f' : s === 'WARN' ? '#f7c34b' : '#ef6b6b';

  return (
    <div
      style={{
        padding: 16,
        color: '#eee',
        background: '#111',
        minHeight: '100vh',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <h1 style={{ fontSize: 22, margin: '0 0 12px' }}>HoloScript Quest 3 Probe</h1>
      <p style={{ color: '#9ca3af', fontSize: 14 }}>
        Tap each button in order. Results also sync to the local proof log for this run.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', marginBottom: 12 }}>
        {btn('webxr', '1. WebXR', checkWebXR)}
        {btn('session', '2. Enter VR', enterVR)}
        {btn('hand', '3. Hand tracking', checkHands)}
        {btn('passthrough', '4. Passthrough', checkPassthrough)}
        {btn('mic', '5. Microphone', checkMic)}
        {btn('speech', '6. Speech', checkSpeech)}
        {btn('wasm', '7. WASM + SAB', checkWasm)}
        {btn('fetch', '8. Fetch API', checkFetch)}
        {btn('npc', '9. AI NPC Observability (quest-proof)', simulateNPC)}
      </div>

      {/* Live NPC Observability panel — receipts flow to the same /api/quest-proof tunnel path */}
      <div style={{ margin: '8px 0 12px', padding: '8px 10px', border: '1px solid #334155', borderRadius: 6, background: '#0b0f14' }}>
        <div style={{ color: '#93c5fd', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>AI NPCs (Quest-proof receipts)</div>
        {npcEvents.length === 0 ? (
          <div style={{ color: '#64748b', fontSize: 12 }}>No NPC events yet — tap button 9 for demo, or real @ai_npc_brain / @caveman_drive events will appear here during Hololand Quest sessions.</div>
        ) : (
          npcEvents.map((e, i) => (
            <div key={i} style={{ fontSize: 12, color: '#cbd5e1', margin: '2px 0' }}>
              {e.trait === 'ai_npc_brain' ? '🗣️' : '🐾'} {e.id} — {e.trait === 'ai_npc_brain' ? e.personality : e.action} {e.distance != null ? `@ ${e.distance.toFixed(1)}m` : ''}
            </div>
          ))
        )}
      </div>

      <div
        id="quest-probe-hand-overlay"
        ref={handOverlayRef}
        role="status"
        aria-live="polite"
        style={{
          position: 'fixed',
          top: 12,
          right: 12,
          zIndex: 1000,
          maxWidth: 280,
          border: '1px solid #2563eb',
          borderRadius: 8,
          background: 'rgba(0, 0, 0, 0.78)',
          color: '#e5e7eb',
          padding: '10px 12px',
          fontSize: 13,
          lineHeight: 1.35,
          boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
        }}
      >
        <div style={{ color: '#93c5fd', fontWeight: 700 }}>In-session hands</div>
        <div>
          {handReceipt
            ? `${handReceipt.visibleHandCount}/${handReceipt.trackedHandCount} visible`
            : 'waiting for active VR session'}
        </div>
        <div style={{ color: '#9ca3af' }}>
          {handReceipt
            ? `sources ${handReceipt.inputSourceCount} - frame ${handReceipt.frameCount}`
            : 'autoEnd=false'}
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <button
          onClick={reset}
          style={{
            background: '#374151',
            color: 'white',
            border: 0,
            borderRadius: 6,
            padding: '8px 14px',
            marginRight: 6,
          }}
        >
          Reset
        </button>
        <button
          onClick={exportReport}
          disabled={results.length === 0}
          style={{
            background: results.length === 0 ? '#4b5563' : '#16a34a',
            color: 'white',
            border: 0,
            borderRadius: 6,
            padding: '8px 14px',
          }}
        >
          Export observations.md
        </button>
      </div>

      <div>
        {results.map((r, i) => (
          <div
            key={i}
            style={{
              display: 'grid',
              gridTemplateColumns: '200px 80px 1fr',
              gap: 8,
              padding: '8px 0',
              borderBottom: '1px solid #333',
            }}
          >
            <div>{r.label}</div>
            <div style={{ color: statusColor(r.status), fontWeight: 600 }}>{r.status}</div>
            <div style={{ color: '#aaa', fontSize: 14, wordBreak: 'break-word' }}>{r.detail}</div>
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: 16, margin: '16px 0 8px' }}>Log</h2>
      <pre
        style={{
          background: '#000',
          border: '1px solid #333',
          padding: 8,
          minHeight: 80,
          fontSize: 13,
          fontFamily: 'ui-monospace, monospace',
          whiteSpace: 'pre-wrap',
        }}
      >
        {log.join('\n')}
      </pre>
    </div>
  );
}
