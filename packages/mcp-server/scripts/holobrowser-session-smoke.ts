import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { browserPool } from '../src/browser/BrowserPool';
import { browserSession } from '../src/browser/browser-tools';

const outIndex = process.argv.indexOf('--out');
const outPath = resolve(
  outIndex >= 0 && process.argv[outIndex + 1]
    ? process.argv[outIndex + 1]
    : '../../.scratch/holobrowser-session-smoke.json'
);

async function main() {
  const opened = await browserSession({
    operation: 'open',
    ownerId: 'holobrowser-laptop-smoke',
    url: 'data:text/html,<button id="go">ready</button><input id="name">',
    width: 800,
    height: 600,
    headless: false,
    leaseTtlMs: 60_000,
  });
  if (!('leaseToken' in opened)) throw new Error('browser_session open returned no lease');

  const sessionId = opened.session.sessionId;
  const leaseToken = opened.leaseToken;
  try {
    await browserSession({
      operation: 'act',
      sessionId,
      leaseToken,
      action: { type: 'fill', selector: '#name', value: 'HoloBrowser' },
    });
    const screenshot = await browserSession({
      operation: 'screenshot',
      sessionId,
      leaseToken,
      type: 'png',
      quality: 90,
      fullPage: false,
    });
    const takeover = await browserSession({ operation: 'takeover', sessionId, leaseToken });
    const resumed = await browserSession({
      operation: 'resume',
      sessionId,
      leaseToken,
      expectedControlEpoch: takeover.session.controlEpoch,
    });
    const closed = await browserSession({ operation: 'close', sessionId, leaseToken });
    const receipt = {
      schema: 'holoscript.browser-laptop-smoke.v1',
      generatedAt: new Date().toISOString(),
      platform: process.platform,
      sessionId,
      screenshotBytes:
        'image' in screenshot ? Buffer.from(screenshot.image.split(',')[1], 'base64').length : 0,
      takeoverMode: takeover.session.controlMode,
      resumeMode: resumed.session.controlMode,
      controlEpoch: resumed.session.controlEpoch,
      closed: closed.closed,
      residue: closed.residue,
      activeSessionsAfter: browserPool.getStats().activeSessions,
      ok: closed.closed && !closed.residue && browserPool.getStats().activeSessions === 0,
    };
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
    process.stdout.write(`${JSON.stringify({ ...receipt, receiptPath: outPath })}\n`);
    if (!receipt.ok) process.exitCode = 1;
  } finally {
    await browserPool.destroyAll();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
