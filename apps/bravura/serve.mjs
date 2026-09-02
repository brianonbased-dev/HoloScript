/**
 * Static server for the Bravura room (port 4174; the probe keeps 4173).
 * WebXR needs a secure context: on Quest use `adb reverse tcp:4174 tcp:4174`
 * and open http://localhost:4174 in the Quest browser (see RUN.md).
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { networkInterfaces } from 'node:os';

const root = import.meta.dirname;
const port = Number(process.env.PORT ?? 4174);
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.map': 'application/json',
  '.json': 'application/json',
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://x');
    let path = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
    if (path === '' || path === '.') path = 'index.html';
    const file = join(root, path);
    if (!file.startsWith(root)) throw new Error('outside root');
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': mime[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
}).listen(port, () => {
  console.log(`Bravura room serving:`);
  console.log(`  http://localhost:${port}  (this machine, and Quest via adb reverse)`);
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal)
        console.log(`  http://${a.address}:${port}  (LAN — page loads, VR needs the localhost path)`);
    }
  }
});
