# (a) Quest 3 Browser Feasibility Probe

**Purpose:** Verify every capability the iPhone-moment plan depends on, from Joseph's Quest 3 browser, in a single 20-minute session. Produces a scoring sheet that decides which of Path A's gaps are engineering tasks vs. research tasks.

**Time:** ~20 minutes in the headset. One attempt.
**Hardware:** Meta Quest 3, latest Horizon OS. Wi-Fi connected.
**Deliverable:** `observations.md` with GREEN/YELLOW/RED for each capability.

---

## Setup (one-time, 2 minutes)

1. On desktop: save `probe.html` (contents below) somewhere publicly reachable. Options:
   - **Fastest:** copy it into `packages/studio/public/probe.html`, run `pnpm dev`, note your machine's local IP (`ipconfig`).
   - **Portable:** `npx serve .` in any folder, ngrok if Quest can't reach LAN.
   - **Simplest:** push the file to a gist.githack.com URL; just works.
2. On Quest 3: open Meta Browser, navigate to the URL.
3. Grant permissions as they pop up (microphone, camera, VR).

---

## Probe HTML — `probe.html`

Paste this exactly. Zero build step, zero dependencies, no framework. Loads three.js from CDN. Everything is feature-detected; nothing crashes if something is missing — each capability reports its own status.

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>HoloScript Quest 3 Probe</title>
  <style>
    body { margin: 0; font: 16px system-ui, sans-serif; color: #eee; background: #111; padding: 16px; }
    h1 { font-size: 22px; margin: 0 0 12px; }
    .row { display: grid; grid-template-columns: 200px 80px 1fr; gap: 8px; padding: 8px 0; border-bottom: 1px solid #333; }
    .ok { color: #6fd36f; font-weight: 600; }
    .warn { color: #f7c34b; font-weight: 600; }
    .fail { color: #ef6b6b; font-weight: 600; }
    .detail { color: #aaa; font-size: 14px; word-break: break-word; }
    button { background: #2563eb; color: #fff; border: 0; border-radius: 8px; padding: 12px 20px; font-size: 16px; margin: 4px; cursor: pointer; }
    #log { background: #000; border: 1px solid #333; padding: 8px; min-height: 80px; font: 13px ui-monospace; }
  </style>
</head>
<body>
  <h1>HoloScript Quest 3 Feasibility Probe</h1>
  <p class="detail">Tap each button in order. Report the result colors. Nothing here is persistent — refresh resets.</p>

  <div id="results"></div>

  <div style="margin-top: 16px;">
    <button id="btn-webxr">1. Check WebXR</button>
    <button id="btn-session">2. Enter VR</button>
    <button id="btn-hand">3. Hand tracking</button>
    <button id="btn-passthrough">4. Passthrough</button>
    <button id="btn-mic">5. Microphone</button>
    <button id="btn-speech">6. Speech recognition</button>
    <button id="btn-wasm">7. WASM + SharedArrayBuffer</button>
    <button id="btn-fetch">8. Fetch studio.holoscript.net</button>
  </div>

  <h2 style="margin-top:16px;font-size:16px;">Log</h2>
  <pre id="log"></pre>

  <script type="module">
    const results = document.getElementById('results');
    const log = document.getElementById('log');
    const row = (label, status, detail) => {
      const cls = status === 'OK' ? 'ok' : status === 'WARN' ? 'warn' : 'fail';
      const el = document.createElement('div');
      el.className = 'row';
      el.innerHTML = `<div>${label}</div><div class="${cls}">${status}</div><div class="detail">${detail}</div>`;
      results.appendChild(el);
    };
    const say = (s) => { log.textContent += s + '\n'; };

    // 1. WebXR present?
    document.getElementById('btn-webxr').onclick = async () => {
      if (!('xr' in navigator)) return row('WebXR API', 'FAIL', 'navigator.xr missing — old browser');
      const vr = await navigator.xr.isSessionSupported('immersive-vr').catch(() => false);
      const ar = await navigator.xr.isSessionSupported('immersive-ar').catch(() => false);
      row('WebXR immersive-vr', vr ? 'OK' : 'FAIL', vr ? 'supported' : 'not supported');
      row('WebXR immersive-ar', ar ? 'OK' : 'FAIL', ar ? 'supported (passthrough possible)' : 'not supported');
    };

    // 2. Actually enter a VR session
    document.getElementById('btn-session').onclick = async () => {
      try {
        const session = await navigator.xr.requestSession('immersive-vr', {
          optionalFeatures: ['hand-tracking', 'local-floor', 'bounded-floor'],
        });
        row('VR session start', 'OK', 'session created');
        say('session features granted: ' + JSON.stringify(session.enabledFeatures || []));
        setTimeout(() => session.end(), 3000);
        session.addEventListener('end', () => say('VR session ended after 3s'));
      } catch (e) {
        row('VR session start', 'FAIL', e.message);
      }
    };

    // 3. Hand tracking — try to enter a session with hand tracking, read inputSources
    document.getElementById('btn-hand').onclick = async () => {
      try {
        const session = await navigator.xr.requestSession('immersive-vr', {
          requiredFeatures: ['hand-tracking'],
        });
        await new Promise((r) => setTimeout(r, 1500));
        const hands = [...session.inputSources].filter((s) => s.hand);
        row('Hand tracking', hands.length > 0 ? 'OK' : 'WARN',
          `${hands.length} hands visible; needs hands raised for detection`);
        say('inputSources: ' + session.inputSources.length + ', with hand: ' + hands.length);
        session.end();
      } catch (e) {
        row('Hand tracking', 'FAIL', e.message);
      }
    };

    // 4. Passthrough (AR session)
    document.getElementById('btn-passthrough').onclick = async () => {
      try {
        const session = await navigator.xr.requestSession('immersive-ar', {
          requiredFeatures: ['local-floor'],
        });
        row('Passthrough (AR)', 'OK', 'AR session started — you should see your room');
        setTimeout(() => session.end(), 3000);
      } catch (e) {
        row('Passthrough (AR)', 'FAIL', e.message);
      }
    };

    // 5. Microphone
    document.getElementById('btn-mic').onclick = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const ctx = new AudioContext();
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        src.connect(analyser);
        const buf = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(buf);
        const max = Math.max(...buf);
        row('Microphone', max > 0 ? 'OK' : 'WARN',
          `peak freq energy: ${max} (say something)`);
        stream.getTracks().forEach((t) => t.stop());
      } catch (e) {
        row('Microphone', 'FAIL', e.message);
      }
    };

    // 6. Web Speech API (critical for voice authoring)
    document.getElementById('btn-speech').onclick = () => {
      const R = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!R) return row('SpeechRecognition', 'FAIL', 'not available in this browser');
      try {
        const r = new R();
        r.lang = 'en-US';
        r.continuous = false;
        r.interimResults = false;
        r.onresult = (e) => row('SpeechRecognition', 'OK',
          `heard: "${e.results[0][0].transcript}" (confidence ${e.results[0][0].confidence.toFixed(2)})`);
        r.onerror = (e) => row('SpeechRecognition', 'FAIL', e.error);
        r.start();
        say('listening — say something');
      } catch (e) {
        row('SpeechRecognition', 'FAIL', e.message);
      }
    };

    // 7. WASM + SharedArrayBuffer (compiler-wasm requires it)
    document.getElementById('btn-wasm').onclick = () => {
      const hasWasm = typeof WebAssembly === 'object';
      const hasSAB = typeof SharedArrayBuffer === 'function';
      row('WebAssembly', hasWasm ? 'OK' : 'FAIL', hasWasm ? 'available' : 'missing');
      row('SharedArrayBuffer', hasSAB ? 'OK' : 'WARN',
        hasSAB ? 'available (needs COOP/COEP headers)' : 'needs cross-origin isolation');
    };

    // 8. Reach studio.holoscript.net
    document.getElementById('btn-fetch').onclick = async () => {
      try {
        const res = await fetch('https://studio-production-a071.up.railway.app/api/share', { method: 'GET' });
        row('Fetch studio API', res.ok ? 'OK' : 'WARN', `status ${res.status}`);
      } catch (e) {
        row('Fetch studio API', 'FAIL', e.message);
      }
    };
  </script>
</body>
</html>
```

---

## Observation protocol

Run each button in order. For each, write one line:

| # | Capability | Result | Notes (what you saw) |
|---|---|---|---|
| 1 | WebXR API | GREEN / YELLOW / RED | |
| 2 | VR session start | | |
| 3 | Hand tracking | | did you need to raise your hands? |
| 4 | Passthrough (immersive-ar) | | could you see your room? |
| 5 | Microphone | | peak value when you talked? |
| 6 | Web Speech API | | transcript accuracy on a sentence |
| 7 | WASM + SharedArrayBuffer | | SAB needs COOP/COEP — probably YELLOW |
| 8 | Studio fetch | | CORS issues likely — note them |

**Also note (anything the HTML can't auto-measure):**
- How many minutes into the session does the Meta Browser throttle / crash?
- Does switching between 2D Browser and VR session preserve state?
- Can you paste the probe URL from your phone via Casting/Companion?
- Does voice recognition work INSIDE a VR session (can you get a SpeechRecognition result while in `immersive-vr`)? This is the question.
- Does the browser let you install the probe as a PWA (Add to Home Screen)?

## Verdict rubric

- **≥6 GREEN:** Path A is an engineering project, not research. Commit the plan.
- **3–5 GREEN:** Path A is viable but needs a specific workaround (usually: host a proxy with COOP/COEP headers). Still commit but add one research spike.
- **<3 GREEN:** Path A is premature on Quest 3's current browser. Consider Path B (native app) as primary bet or wait for Meta Horizon OS v76 which is rumored to add [capability X] — verify that rumor first.

## Known likely failures and what they mean

- **SAB = YELLOW** on first run — normal. Studio's deploy needs `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp` headers. This is a Railway config fix, not an engineering project.
- **SpeechRecognition = FAIL on Meta Browser** — plausible. Meta Browser is Chromium but may have the feature disabled. Workaround: ship a small wasm whisper.cpp bundle, record audio → transcribe in-browser. Adds ~30MB but works offline. Decision point.
- **Hand tracking = YELLOW** — expected if hands weren't visible to the cameras during test. Retest with hands up.
- **Studio fetch = FAIL** — CORS. Cheap fix on the server side.

## After the probe

Commit `observations.md` to `research/quest3-iphone-moment/observations-<date>.md` and we pick the Path A work items to schedule from the rubric.
