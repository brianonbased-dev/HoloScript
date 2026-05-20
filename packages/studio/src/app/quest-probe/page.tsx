import { QuestProbe } from '../../components/quest/QuestProbe';

export const metadata = {
  title: 'Quest 3 Probe — HoloScript Studio',
  description:
    "Capability probe for the Quest 3 browser: WebXR, hand tracking, passthrough, voice, WASM, and Studio reachability.",
};

const fallbackScript = String.raw`
(() => {
  if (window.__questProbeFallbackInstalled) return;
  window.__questProbeFallbackInstalled = true;

  const statusColor = { OK: '#6fd36f', WARN: '#f7c34b', FAIL: '#ef6b6b' };
  const results = [];
  let running = false;
  let handReceipt = null;
  let handObserverStop = null;

  function prefix(path) {
    const tunnel = window.location.pathname.match(/^\/t\/[^/]+/);
    if (tunnel) return tunnel[0] + path;
    if (window.location.pathname.startsWith('/live/')) return '/live' + path;
    return path;
  }

  function runId() {
    return new URLSearchParams(window.location.search).get('runId') ||
      new Date().toISOString().slice(0, 10) + '-quest-proof';
  }

  function resultHost() {
    let host = document.getElementById('quest-probe-fallback-results');
    if (!host) {
      host = document.createElement('div');
      host.id = 'quest-probe-fallback-results';
      const logTitle = [...document.querySelectorAll('h2')].find((h) => h.textContent?.trim() === 'Log');
      (logTitle?.parentElement || document.body).insertBefore(host, logTitle || null);
    }
    return host;
  }

  function log(message) {
    const pre = document.querySelector('pre');
    if (pre) pre.textContent = [pre.textContent, message].filter(Boolean).join('\n');
  }

  function handOverlay() {
    let overlay = document.getElementById('quest-probe-hand-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'quest-probe-hand-overlay';
      overlay.setAttribute('role', 'status');
      overlay.setAttribute('aria-live', 'polite');
      overlay.style.cssText = 'position:fixed;top:12px;right:12px;z-index:1000;max-width:280px;border:1px solid #2563eb;border-radius:8px;background:rgba(0,0,0,.78);color:#e5e7eb;padding:10px 12px;font-size:13px;line-height:1.35;box-shadow:0 10px 30px rgba(0,0,0,.35)';
      document.body.appendChild(overlay);
    }
    return overlay;
  }

  function handEntries(hand) {
    if (!hand) return [];
    try {
      if (typeof hand.values === 'function') return Array.from(hand.values());
    } catch {}
    try {
      if (typeof hand[Symbol.iterator] === 'function') {
        return Array.from(hand).map((entry) => Array.isArray(entry) && entry.length >= 2 ? entry[1] : entry);
      }
    } catch {}
    return [];
  }

  function handJointCount(hand) {
    if (!hand) return 0;
    if (typeof hand.size === 'number') return hand.size;
    try {
      if (typeof hand.keys === 'function') return Array.from(hand.keys()).length;
    } catch {}
    return handEntries(hand).length;
  }

  function buildHandReceipt(session, eventName, frame, referenceSpace, frameCount) {
    const sources = Array.from(session.inputSources || []);
    const hands = sources.map((source) => {
      const entries = handEntries(source.hand);
      let posed = 0;
      if (frame?.getJointPose && referenceSpace && source.hand) {
        for (const joint of entries) {
          try {
            if (frame.getJointPose(joint, referenceSpace)) posed += 1;
          } catch {}
        }
      }
      const poseAware = Boolean(frame?.getJointPose && referenceSpace);
      return {
        handedness: source.handedness || 'unknown',
        hasHand: source.hand != null,
        jointCount: handJointCount(source.hand),
        posedJointCount: posed,
        visible: source.hand != null && (poseAware ? posed > 0 : true),
      };
    });
    const tracked = hands.filter((hand) => hand.hasHand).length;
    const visible = hands.filter((hand) => hand.visible).length;
    const posedJoints = hands.reduce((sum, hand) => sum + hand.posedJointCount, 0);
    const handList = hands.filter((hand) => hand.hasHand).map((hand) => {
      const posed = hand.posedJointCount > 0 ? ', ' + hand.posedJointCount + ' posed' : '';
      return hand.handedness + ':' + hand.jointCount + ' joints' + posed;
    }).join('; ') || 'no hand input sources';
    return {
      label: 'In-session hand tracking',
      status: visible > 0 ? 'OK' : 'WARN',
      event: eventName,
      inputSourceCount: sources.length,
      trackedHandCount: tracked,
      visibleHandCount: visible,
      posedJointCount: posedJoints,
      frameCount,
      detail: visible + '/' + tracked + ' visible hands; inputSources=' + sources.length + '; posedJoints=' + posedJoints + '; frame=' + frameCount + '; autoEnd=false; ' + handList,
    };
  }

  function handReceiptKey(receipt) {
    return [
      receipt.visibleHandCount,
      receipt.trackedHandCount,
      receipt.inputSourceCount,
      receipt.posedJointCount,
      receipt.event === 'end' ? 'end' : 'active',
    ].join(':');
  }

  function renderHandOverlay() {
    const overlay = handOverlay();
    const summary = handReceipt
      ? handReceipt.visibleHandCount + '/' + handReceipt.trackedHandCount + ' visible'
      : 'waiting for active VR session';
    const meta = handReceipt
      ? 'sources ' + handReceipt.inputSourceCount + ' - frame ' + handReceipt.frameCount
      : 'autoEnd=false';
    overlay.innerHTML =
      '<div style="color:#93c5fd;font-weight:700">In-session hands</div>' +
      '<div>' + summary + '</div>' +
      '<div style="color:#9ca3af">' + meta + '</div>';
  }

  function startHandObserver(session) {
    if (handObserverStop) handObserverStop();
    let disposed = false;
    let referenceSpace = null;
    let frameCount = 0;
    let rafHandle = null;
    let lastFrameEmit = -Infinity;
    let lastReceiptKey = null;

    function record(receipt) {
      handReceipt = receipt;
      renderHandOverlay();
      const key = handReceiptKey(receipt);
      if (key === lastReceiptKey && receipt.event !== 'end') return;
      lastReceiptKey = key;
      push(receipt.label, receipt.status, receipt.detail);
    }

    function emit(eventName, frame, time) {
      if (disposed) return;
      if (eventName === 'frame' && typeof time === 'number' && time - lastFrameEmit < 750) return;
      if (eventName === 'frame' && typeof time === 'number') lastFrameEmit = time;
      record(buildHandReceipt(session, eventName, frame, referenceSpace, frameCount));
    }

    function scheduleFrame() {
      if (disposed || typeof session.requestAnimationFrame !== 'function') return;
      rafHandle = session.requestAnimationFrame((time, frame) => {
        if (disposed) return;
        frameCount += 1;
        emit('frame', frame, time);
        scheduleFrame();
      });
    }

    function onSourcesChange() {
      emit('inputsourceschange');
    }

    function cleanup() {
      disposed = true;
      if (rafHandle != null && typeof session.cancelAnimationFrame === 'function') session.cancelAnimationFrame(rafHandle);
      session.removeEventListener?.('inputsourceschange', onSourcesChange);
      session.removeEventListener?.('end', onEnd);
      if (handObserverStop === cleanup) handObserverStop = null;
    }

    function onEnd() {
      emit('end');
      cleanup();
    }

    session.addEventListener?.('inputsourceschange', onSourcesChange);
    session.addEventListener?.('end', onEnd);
    if (typeof session.requestReferenceSpace === 'function') {
      session.requestReferenceSpace('local-floor')
        .catch(() => session.requestReferenceSpace?.('viewer'))
        .then((space) => {
          referenceSpace = space || null;
          emit('reference-space');
        })
        .catch(() => emit('reference-space-unavailable'));
    }
    emit('session-start');
    scheduleFrame();
    handObserverStop = cleanup;
  }

  function render() {
    const host = resultHost();
    host.innerHTML = '';
    for (const item of results) {
      const row = document.createElement('div');
      row.style.cssText = 'display:grid;grid-template-columns:200px 80px 1fr;gap:8px;padding:8px 0;border-bottom:1px solid #333;';
      row.innerHTML =
        '<div>' + item.label + '</div>' +
        '<div style="color:' + statusColor[item.status] + ';font-weight:600">' + item.status + '</div>' +
        '<div style="color:#aaa;font-size:14px;word-break:break-word">' + item.detail + '</div>';
      host.appendChild(row);
    }
    const exportButton = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Export observations.md');
    if (exportButton) {
      exportButton.disabled = results.length === 0;
      exportButton.style.background = results.length === 0 ? '#4b5563' : '#16a34a';
    }
    renderHandOverlay();
  }

  function push(label, status, detail) {
    results.push({ label, status, detail });
    render();
    const query = new URLSearchParams({
      record: '1',
      runId: runId(),
      pageId: 'quest-probe',
      label,
      status,
      detail,
      url: window.location.href,
      userAgent: navigator.userAgent,
    });
    fetch(prefix('/api/quest-proof') + '?' + query.toString(), { cache: 'no-store' }).catch(() => {});
  }

  function timeout(promise, label, ms = 15000) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(label + ' timed out after ' + ms + 'ms')), ms)),
    ]);
  }

  function xr() {
    return navigator.xr || null;
  }

  async function checkWebXR() {
    if (!xr()) {
      push('WebXR API', 'FAIL', 'navigator.xr missing');
      return;
    }
    const vr = await timeout(xr().isSessionSupported('immersive-vr'), 'immersive-vr support', 12000).catch(() => false);
    const ar = await timeout(xr().isSessionSupported('immersive-ar'), 'immersive-ar support', 12000).catch(() => false);
    push('WebXR immersive-vr', vr ? 'OK' : 'FAIL', vr ? 'supported' : 'not supported');
    push('WebXR immersive-ar', ar ? 'OK' : 'FAIL', ar ? 'supported' : 'not supported');
  }

  async function enterVR() {
    if (!xr()) {
      push('VR session', 'FAIL', 'no navigator.xr');
      return;
    }
    try {
      const overlay = handOverlay();
      const session = await timeout(xr().requestSession('immersive-vr', {
        optionalFeatures: ['hand-tracking', 'local-floor', 'bounded-floor', 'dom-overlay'],
        domOverlay: { root: overlay },
      }), 'VR session start');
      startHandObserver(session);
      push('VR session start', 'OK', 'session created; exit with Quest browser/system controls');
      log('enabled features: ' + JSON.stringify(session.enabledFeatures || []));
      session.addEventListener?.('end', () => log('VR session ended'));
    } catch (error) {
      push('VR session start', 'FAIL', error?.message || String(error));
    }
  }

  async function hands() {
    if (!xr()) {
      push('Hand tracking', 'FAIL', 'no navigator.xr');
      return;
    }
    try {
      const vr = await timeout(xr().isSessionSupported('immersive-vr'), 'immersive-vr support', 12000);
      if (handReceipt) {
        push('Hand tracking', handReceipt.status, 'in-session receipt: ' + handReceipt.detail);
        return;
      }
      push(
        'Hand tracking',
        vr ? 'WARN' : 'FAIL',
        vr
          ? 'readiness only; Enter VR now records visible hand receipts inside the active session'
          : 'immersive-vr not supported, so hand tracking cannot be checked'
      );
      log('Hand tracking check does not start or force-end a separate VR session.');
    } catch (error) {
      push('Hand tracking', 'FAIL', error?.message || String(error));
    }
  }

  async function passthrough() {
    if (!xr()) {
      push('Passthrough (AR)', 'FAIL', 'no navigator.xr');
      return;
    }
    try {
      const session = await timeout(xr().requestSession('immersive-ar', { requiredFeatures: ['local-floor'] }), 'Passthrough session');
      push('Passthrough (AR)', 'OK', 'AR session started; exit with Quest browser/system controls');
      session.addEventListener?.('end', () => log('Passthrough session ended'));
    } catch (error) {
      push('Passthrough (AR)', 'FAIL', error?.message || String(error));
    }
  }

  async function mic() {
    if (!navigator.mediaDevices?.getUserMedia) {
      push('Microphone', 'FAIL', 'mediaDevices.getUserMedia missing');
      return;
    }
    try {
      const stream = await timeout(navigator.mediaDevices.getUserMedia({ audio: true }), 'Microphone permission');
      const context = new AudioContext();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      source.connect(analyser);
      await new Promise((resolve) => setTimeout(resolve, 500));
      const buf = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(buf);
      const peak = Math.max(...buf);
      push('Microphone', peak > 0 ? 'OK' : 'WARN', 'peak freq energy: ' + peak);
      stream.getTracks().forEach((track) => track.stop());
      context.close?.();
    } catch (error) {
      push('Microphone', 'FAIL', error?.message || String(error));
    }
  }

  function speech() {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) {
      push('SpeechRecognition', 'FAIL', 'not available in this browser');
      return;
    }
    try {
      const recognition = new Ctor();
      const timer = setTimeout(() => {
        push('SpeechRecognition', 'WARN', 'no speech result before timeout');
        running = false;
      }, 15000);
      recognition.lang = 'en-US';
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.onresult = (event) => {
        clearTimeout(timer);
        const heard = event.results[0]?.[0]?.transcript || '';
        push('SpeechRecognition', 'OK', 'heard: "' + heard + '"');
      };
      recognition.onerror = (event) => {
        clearTimeout(timer);
        push('SpeechRecognition', 'FAIL', event.error || 'speech error');
      };
      recognition.start();
      log('listening - say one sentence');
    } catch (error) {
      push('SpeechRecognition', 'FAIL', error?.message || String(error));
    }
  }

  function wasm() {
    const hasWasm = typeof WebAssembly === 'object';
    const hasSAB = typeof SharedArrayBuffer === 'function';
    const isolated = self.crossOriginIsolated === true;
    push('WebAssembly', hasWasm ? 'OK' : 'FAIL', hasWasm ? 'available' : 'missing');
    push('SharedArrayBuffer', hasSAB && isolated ? 'OK' : 'WARN', 'constructor=' + hasSAB + ', crossOriginIsolated=' + isolated);
  }

  async function fetchApi() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(prefix('/api/share'), { method: 'GET', signal: controller.signal });
      push('Fetch /api/share', response.ok ? 'OK' : 'WARN', 'status ' + response.status);
    } catch (error) {
      push('Fetch /api/share', 'FAIL', error?.message || String(error));
    } finally {
      clearTimeout(timer);
    }
  }

  function reset() {
    results.splice(0);
    const pre = document.querySelector('pre');
    if (pre) pre.textContent = '';
    render();
  }

  function exportReport() {
    const lines = [
      '# Quest 3 Probe observations',
      '',
      'Date: ' + new Date().toISOString(),
      'User agent: ' + navigator.userAgent,
      '',
      '| # | Capability | Status | Notes |',
      '|---|---|---|---|',
      ...results.map((r, i) => '| ' + (i + 1) + ' | ' + r.label + ' | ' + r.status + ' | ' + r.detail + ' |'),
    ];
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/markdown' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'observations-' + new Date().toISOString().slice(0, 10) + '.md';
    link.click();
    URL.revokeObjectURL(url);
  }

  const handlers = new Map([
    ['1. WebXR', checkWebXR],
    ['2. Enter VR', enterVR],
    ['3. Hand tracking', hands],
    ['4. Passthrough', passthrough],
    ['5. Microphone', mic],
    ['6. Speech', speech],
    ['7. WASM + SAB', wasm],
    ['8. Fetch API', fetchApi],
    ['Reset', reset],
    ['Export observations.md', exportReport],
  ]);

  document.addEventListener('click', async (event) => {
    const button = event.target?.closest?.('button');
    if (!button) return;
    const handler = handlers.get(button.textContent?.trim());
    if (!handler) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (button.textContent?.trim() !== 'Reset' && running) return;
    running = true;
    try {
      await handler();
    } finally {
      running = false;
    }
  }, true);
  render();
})();
`;

export default function QuestProbePage() {
  return (
    <>
      <QuestProbe />
      <script dangerouslySetInnerHTML={{ __html: fallbackScript }} />
    </>
  );
}
