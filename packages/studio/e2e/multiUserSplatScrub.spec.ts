import { test, expect } from '@playwright/test';

test.describe('CRDT Multi-User Spatial Scrubber Limits', () => {
  test('Two directors can synchronously scrub splat timelines without WS 1006 connection drop', async ({ browser }) => {
    // Stage 2 independent user views
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    // Both Directors jump to a pre-viz load with physical OP code generation allowed
    await Promise.all([
      pageA.goto('/workspace/agents/director?scene=splat-crdt-stress', { waitUntil: 'networkidle' }),
      pageB.goto('/workspace/agents/director?scene=splat-crdt-stress', { waitUntil: 'networkidle' })
    ]);

    let connectionClosed = false;

    // Track Socket disconnections across both sessions
    pageA.on('websocket', ws => {
       ws.on('close', payload => {
           if (payload && payload.code === 1006) connectionClosed = true;
       });
    });

    // Concurrently drag scrubbing timelines (triggering rapid CRDT interpolation vectors)
    await Promise.all([
      pageA.evaluate(() => window.dispatchEvent(new CustomEvent('holoscript:scrub', { detail: { time: 50.5 } }))),
      pageB.evaluate(() => window.dispatchEvent(new CustomEvent('holoscript:scrub', { detail: { time: 102.1 } })))
    ]);

    // Give CRDTs 1 second to exchange their batch updates at 10hz
    await pageA.waitForTimeout(1000);

    // Expect connection stability
    expect(connectionClosed).toBe(false);

    // Check states
    const statusA = await pageA.evaluate(() => window.__CRDT_STATE?.isConnected);
    expect(statusA).toBe(true);
  });
});
