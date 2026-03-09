import { browserTools } from './browser/browser-tools.js';
import { browserPool } from './browser/BrowserPool.js';
import path from 'path';
import fs from 'fs';

async function run() {
  console.log('--- Verifying Browser Tools ---');

  // Ensure examples exist
  const examplePath = path.resolve('examples/hello-world.hs');
  if (!fs.existsSync(examplePath)) {
    console.error('Example file not found:', examplePath);
    process.exit(1);
  }

  // 1. Launch
  console.log('1. Launching browser...');
  const launchResult = await browserTools.browser_launch.handler({
    holoscriptFile: examplePath,
    headless: true, // Keep it headless for CI/test environment unless debugging
    width: 1280,
    height: 720,
  });

  if (launchResult.isError) {
    console.error('Launch failed raw:', launchResult.content[0].text);
    const errorData = JSON.parse(launchResult.content[0].text);
    console.error('Error details:', errorData.error);
    process.exit(1);
  }

  const launchData = JSON.parse(launchResult.content[0].text);
  const sessionId = launchData.sessionId;
  console.log('Launch successful. Session:', sessionId);

  // 2. Execute
  console.log('2. Executing script...');
  // Wait a bit for scene to load
  await new Promise((resolve) => setTimeout(resolve, 3000));

  const execResult = await browserTools.browser_execute.handler({
    sessionId,
    script: 'JSON.stringify({ title: document.title, url: window.location.href })',
    captureConsole: true,
  });

  const execData = JSON.parse(execResult.content[0].text);
  console.log('Execute result:', execData);

  if (!execData.result) {
    console.error('Execution failed or returned empty');
  }

  // 3. Screenshot
  console.log('3. Taking screenshot...');
  const screenPath = path.resolve('test-screenshot.png');
  const screenResult = await browserTools.browser_screenshot.handler({
    sessionId,
    outputPath: screenPath,
  });

  const screenData = JSON.parse(screenResult.content[0].text);
  console.log('Screenshot saved to:', screenData.outputPath);

  if (fs.existsSync(screenPath)) {
    console.log('Screenshot file verified.');
    // Clean up screenshot
    fs.unlinkSync(screenPath);
  } else {
    console.error('Screenshot file missing!');
  }

  // Cleanup
  console.log('Cleaning up session...');
  await browserPool.destroySession(sessionId);
  console.log('Done.');
  process.exit(0);
}

run().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
