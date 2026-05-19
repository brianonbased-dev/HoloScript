#!/usr/bin/env node
/**
 * HoloTunnel CLI — forward a local port to a public relay URL.
 *
 *   npx holo-tunnel --port 3000
 *   node dist/holo-tunnel/cli.js --port 8080 --relay https://custom-relay.example.com
 */
import { startHoloTunnel } from './index.js';

const args = process.argv.slice(2);
const get = (flag: string) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : undefined; };

const localPort = parseInt(get('--port') ?? get('-p') ?? '3000', 10);
const relayBase = get('--relay');

if (isNaN(localPort) || localPort < 1 || localPort > 65535) {
  console.error('Usage: holo-tunnel --port <port> [--relay <relay-base-url>]');
  process.exit(1);
}

console.log(`[HoloTunnel] connecting to relay, forwarding localhost:${localPort} ...`);

startHoloTunnel({
  localPort,
  ...(relayBase ? { relayBase } : {}),
  onReady: (url, tunnelId) => {
    console.log('\n╔═══════════════════════════════════════════════════════╗');
    console.log('║            HoloTunnel — Active                       ║');
    console.log('╠═══════════════════════════════════════════════════════╣');
    console.log(`║  Public URL : ${url}`);
    console.log(`║  Tunnel ID  : ${tunnelId}`);
    console.log(`║  Forwarding : localhost:${localPort}`);
    console.log('║');
    console.log('║  Open the URL on Quest 3 to connect wirelessly.');
    console.log('║  Ctrl+C to close the tunnel.');
    console.log('╚═══════════════════════════════════════════════════════╝\n');
  },
  onRequest: (method, path) => {
    console.log(`  → ${method} ${path}`);
  },
}).catch((err) => {
  console.error('[HoloTunnel] failed to connect:', err.message);
  process.exit(1);
});

process.on('SIGINT', () => { console.log('\n[HoloTunnel] closed.'); process.exit(0); });
