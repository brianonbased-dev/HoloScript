'use client';

/**
 * QuestProbe — React version of /probe.html.
 *
 * Same eight capability checks, usable from any Studio page (e.g. /quest-probe)
 * so the founder can run it without remembering a separate URL.
 *
 * See plan: research/quest3-iphone-moment/a-quest3-feasibility-probe.md
 */

import { useState } from 'react';

type Status = 'OK' | 'WARN' | 'FAIL';

interface Result {
  label: string;
  status: Status;
  detail: string;
  at: number;
}

// Minimal WebXR type polyfill — @types/webxr isn't always present.
interface XRSystemLike {
  isSessionSupported(mode: string): Promise<boolean>;
  requestSession(
    mode: string,
    opts?: { requiredFeatures?: string[]; optionalFeatures?: string[] }
  ): Promise<XRSessionLike>;
}
interface XRSessionLike {
  enabledFeatures?: string[];
  inputSources: ReadonlyArray<{ hand?: unknown }>;
  addEventListener(type: 'end', cb: () => void): void;
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
    | ((e: {
        results: ArrayLike<{ 0: { transcript: string; confidence: number } }>;
      }) => void)
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

  const push = (label: string, status: Status, detail: string) =>
    setResults((rs) => [...rs, { label, status, detail, at: Date.now() }]);
  const say = (s: string) => setLog((l) => [...l, s]);

  const checkWebXR = async () => {
    setRunning('webxr');
    const xr = getXR();
    if (!xr) {
      push('WebXR API', 'FAIL', 'navigator.xr missing — old browser');
    } else {
      const vr = await xr.isSessionSupported('immersive-vr').catch(() => false);
      const ar = await xr.isSessionSupported('immersive-ar').catch(() => false);
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
      const session = await xr.requestSession('immersive-vr', {
        optionalFeatures: ['hand-tracking', 'local-floor', 'bounded-floor'],
      });
      push('VR session start', 'OK', 'session created');
      say('enabled features: ' + JSON.stringify(session.enabledFeatures ?? []));
      session.addEventListener('end', () => say('VR session ended'));
      setTimeout(() => void session.end(), 3000);
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
      const session = await xr.requestSession('immersive-vr', {
        requiredFeatures: ['hand-tracking'],
      });
      await new Promise((r) => setTimeout(r, 1500));
      const hands = [...session.inputSources].filter((s) => s.hand);
      push(
        'Hand tracking',
        hands.length > 0 ? 'OK' : 'WARN',
        `${hands.length} hands visible (raise hands for detection)`
      );
      void session.end();
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
      const session = await xr.requestSession('immersive-ar', {
        requiredFeatures: ['local-floor'],
      });
      push('Passthrough (AR)', 'OK', 'AR session started — you should see your room');
      setTimeout(() => void session.end(), 3000);
    } catch (e) {
      push('Passthrough (AR)', 'FAIL', e instanceof Error ? e.message : String(e));
    }
    setRunning(null);
  };

  const checkMic = async () => {
    setRunning('mic');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
      r.lang = 'en-US';
      r.continuous = false;
      r.interimResults = false;
      r.onresult = (e) => {
        const res = e.results[0];
        push(
          'SpeechRecognition',
          'OK',
          `heard: "${res[0].transcript}" (confidence ${res[0].confidence.toFixed(2)})`
        );
        setRunning(null);
      };
      r.onerror = (e) => {
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
      const res = await fetch('/api/share', { method: 'GET' });
      push('Fetch /api/share', res.ok ? 'OK' : 'WARN', `status ${res.status}`);
    } catch (e) {
      push('Fetch /api/share', 'FAIL', e instanceof Error ? e.message : String(e));
    }
    setRunning(null);
  };

  const reset = () => {
    setResults([]);
    setLog([]);
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
    <div style={{ padding: 16, color: '#eee', background: '#111', minHeight: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 22, margin: '0 0 12px' }}>HoloScript Quest 3 Probe</h1>
      <p style={{ color: '#9ca3af', fontSize: 14 }}>
        Tap each button in order. When done, click <b>Export</b> to download observations.
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
      </div>

      <div style={{ marginBottom: 12 }}>
        <button onClick={reset} style={{ background: '#374151', color: 'white', border: 0, borderRadius: 6, padding: '8px 14px', marginRight: 6 }}>
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
