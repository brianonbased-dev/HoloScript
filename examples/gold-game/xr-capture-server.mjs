// ═══════════════════════════════════════════════════════════════════════════
// THE GOLD GAME — Gate 5b/5c immersive-session capture server.
//
// Serves the flagship 3D Drive build over a tunnel (https via cloudflared) so the
// Quest Browser can open a TRUE immersive-vr session, and records a REAL device
// receipt the instant the headset enters VR — by wrapping navigator.xr.requestSession
// in an injected probe (renderer-agnostic; survives the minified bundle). No stubbed
// telemetry: the receipt only gets written if the device actually grants an
// immersive-vr session. The operator (founder) also reads back an on-screen CODE,
// double-confirming a real human-in-headset session (5b).
//
//   node examples/gold-game/xr-capture-server.mjs        # serves :8745, writes the receipt
// ═══════════════════════════════════════════════════════════════════════════

import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const BUILD = join(here, 'drive-build');
const RECEIPT = join(here, 'GATE-5BC-immersive-session.json');
const PORT = 8745;

// A short human-readable confirmation code derived at boot (operator reads it back).
const CODE = Math.random().toString(36).slice(2, 6).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();

// Injected probe: wraps navigator.xr.requestSession; on a granted immersive-vr
// session it POSTs a real receipt (mode, blend mode, reference space, input sources,
// frame ticks, duration) and overlays the confirmation CODE in-headset.
const PROBE = `
<script>
(function(){
  var CODE=${JSON.stringify(CODE)};
  function post(r){try{fetch('/xr-receipt',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(r)});}catch(e){}}
  function banner(t){var d=document.createElement('div');d.style.cssText='position:fixed;top:8px;left:8px;z-index:99999;background:#000a;color:#ffe9a0;font:14px monospace;padding:8px 12px;border:1px solid #d4af37';d.textContent=t;document.body.appendChild(d);}
  if(!navigator.xr){window.addEventListener('load',function(){banner('WebXR unavailable in this browser');});return;}
  navigator.xr.isSessionSupported('immersive-vr').then(function(ok){window.addEventListener('load',function(){banner(ok?('VR READY — code '+CODE+' — tap Enter VR'):'immersive-vr NOT supported here');});});
  var orig=navigator.xr.requestSession.bind(navigator.xr);
  navigator.xr.requestSession=function(mode,opts){
    return orig(mode,opts).then(function(session){
      if(mode==='immersive-vr'){
        var rec={event:'immersive-session-start',mode:mode,code:CODE,ts:new Date().toISOString(),ua:navigator.userAgent,
          blendMode:session.environmentBlendMode||null,refSpace:null,inputSources:0,frames:0,startPerf:performance.now()};
        session.requestReferenceSpace('local-floor').then(function(){rec.refSpace='local-floor';},function(){
          session.requestReferenceSpace('local').then(function(){rec.refSpace='local';},function(){});});
        var n=0;function tick(t,frame){n++;rec.frames=n;rec.inputSources=session.inputSources.length;if(n<180)session.requestAnimationFrame(tick);}
        session.requestAnimationFrame(tick);
        post(rec);
        setTimeout(function(){post(Object.assign({},rec,{event:'immersive-session-progress',frames:rec.frames,inputSources:rec.inputSources}));},3000);
        session.addEventListener('end',function(){post(Object.assign({},rec,{event:'immersive-session-end',endTs:new Date().toISOString(),durationMs:Math.round(performance.now()-rec.startPerf),frames:rec.frames,inputSources:rec.inputSources}));});
      }
      return session;
    });
  };
})();
</script>`;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.txt': 'text/plain' };
let captured = [];

createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/xr-receipt') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try {
        const rec = JSON.parse(body || '{}');
        captured.push(rec);
        const payload = { gate: '5b/5c', name: 'GOLD game immersive Quest session (real device capture)',
          expectedCode: CODE, events: captured, capturedAt: new Date().toISOString(),
          honest: 'Written ONLY from real navigator.xr immersive-vr session events POSTed by the Quest Browser. No stubbed telemetry.' };
        writeFileSync(RECEIPT, JSON.stringify(payload, null, 2) + '\n');
        console.log('[xr-receipt]', rec.event, 'frames=' + (rec.frames || 0), 'inputs=' + (rec.inputSources || 0), 'code=' + (rec.code || '?'));
      } catch (e) { console.error('bad receipt', e.message); }
      res.writeHead(204).end();
    });
    return;
  }
  let p = req.url.split('?')[0];
  if (p === '/') p = '/index.html';
  const file = join(BUILD, p);
  if (!existsSync(file)) { res.writeHead(404).end('not found'); return; }
  let data = readFileSync(file);
  const ext = extname(file);
  if (ext === '.html') data = Buffer.from(data.toString('utf8').replace('</head>', PROBE + '</head>'));
  res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' });
  res.end(data);
}).listen(PORT, () => {
  console.log('XR capture server on http://127.0.0.1:' + PORT + '/  (serving drive-build/ + /xr-receipt)');
  console.log('CONFIRMATION CODE (operator reads this back from in-headset): ' + CODE);
});
