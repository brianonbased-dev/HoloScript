#!/usr/bin/env node
import { spawn } from 'child_process';

const server = spawn('node', ['dist/index.js'], {
  cwd: 'C:/Users/josep/Documents/GitHub/HoloScript/packages/mcp-server',
  stdio: ['pipe', 'pipe', 'inherit']
});

let messageId = 0;
const pending = new Map();

server.stdout.on('data', (data) => {
  const lines = data.toString().split('\n').filter(l => l.trim());
  lines.forEach(line => {
    try {
      const msg = JSON.parse(line);
      if (msg.id && pending.has(msg.id)) {
        const { resolve } = pending.get(msg.id);
        pending.delete(msg.id);
        resolve(msg);
      }
    } catch (e) {}
  });
});

function send(method, params = {}) {
  return new Promise((resolve) => {
    const id = ++messageId;
    pending.set(id, { resolve });
    server.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        resolve({ error: 'timeout' });
      }
    }, 30000);
  });
}

async function test() {
  // Initialize
  await send('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'test', version: '1.0.0' }
  });

  console.log('Testing browser_launch...\n');

  const result = await send('tools/call', {
    name: 'browser_launch',
    arguments: {
      holoscriptFile: 'examples/hello-world.hs',
      width: 800,
      height: 600,
      headless: true
    }
  });

  console.log('RAW RESPONSE:');
  console.log(JSON.stringify(result, null, 2));

  if (result.result?.content?.[0]?.text) {
    console.log('\nPARSED TEXT:');
    console.log(JSON.parse(result.result.content[0].text));
  }

  server.kill();
}

test();
