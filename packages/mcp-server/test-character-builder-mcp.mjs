#!/usr/bin/env node
/**
 * MCP Client script to test HoloScript Studio's Character Building and Brittney workflows
 * This script starts the local HoloScript MCP Server (which wraps Playwright)
 * and issues commands to launch http://localhost:3100, click buttons, and capture screenshots.
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class MCPClient {
  constructor() {
    this.messageId = 0;
    this.pending = new Map();
  }

  async start() {
    console.log('🚀 Starting MCP server...\n');
    this.server = spawn('node', ['dist/index.js'], {
      cwd: __dirname,
      stdio: ['pipe', 'pipe', 'inherit']
    });

    this.server.stdout.on('data', (data) => {
      const lines = data.toString().split('\n').filter(l => l.trim());
      for (const line of lines) {
        try {
          const msg = JSON.parse(line);
          if (msg.id && this.pending.has(msg.id)) {
            const { resolve } = this.pending.get(msg.id);
            this.pending.delete(msg.id);
            resolve(msg);
          }
        } catch (e) {
          // Ignore non-JSON output
        }
      }
    });

    const initResult = await this.send({
      jsonrpc: '2.0',
      method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test-client', version: '1.0.0' } }
    });
    console.log('✅ Server initialized\n');
    return initResult;
  }

  async send(message) {
    return new Promise((resolve, reject) => {
      const id = ++this.messageId;
      const msg = { ...message, id };
      this.pending.set(id, { resolve, reject });
      this.server.stdin.write(JSON.stringify(msg) + '\n');
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 60000);
    });
  }

  async stop() {
    this.server.kill();
  }
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const client = new MCPClient();
  try {
    await client.start();

    console.log('🌐 Launching Studio (http://localhost:3100)...');
    const launchResult = await client.send({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'browser_launch',
        arguments: {
          holoscriptFile: 'http://localhost:3100/create', // We misuse holoscriptFile parameter to open specific URL
          width: 1920,
          height: 1080,
          headless: false
        }
      }
    });
    
    // Check if it's an error. The API might wrap the URL in file:// accidentally based on BROWSER_CONTROL.md.
    let sessionId = null;
    let launchStr = launchResult.result.content[0].text;
    console.log('Launch reply:', launchStr);
    
    if (launchStr.includes('success')) {
      const data = JSON.parse(launchStr);
      sessionId = data.sessionId;
    } else {
      throw new Error("Failed to launch browser session");
    }

    // Wait 15 seconds for Next.js to compile and React to mount
    await sleep(15000);

    // Take screenshot of landing
    console.log('📸 Capturing studio landing...');
    await client.send({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'browser_screenshot',
        arguments: { sessionId, outputPath: join(__dirname, 'screenshots', 'character-1-landing.png'), type: 'png', fullPage: false }
      }
    });

    console.log('🖱️ Clicking Character Editor/Wizard modes...');
    const clickResult = await client.send({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'browser_execute',
        arguments: {
          sessionId,
          script: `
            (() => {
              const buttons = Array.from(document.querySelectorAll('button'));
              const characterBtn = buttons.find(b => b.innerText.includes('Add NPC') || b.textContent.includes('Add NPC'));
              if(characterBtn) characterBtn.click();
              return { 
                  found: !!characterBtn, 
                  text: characterBtn?.innerText || characterBtn?.textContent,
                  totalButtons: buttons.length,
                  allTexts: buttons.map(b => b.innerText || b.textContent).filter(Boolean),
                  bodyText: document.body.innerText.substring(0, 1000)
              };
            })();
          `
        }
      }
    });

    console.log('Execute Result (Character Mode):', clickResult.result.content[0].text);
    await sleep(2000);

    await client.send({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'browser_screenshot',
        arguments: { sessionId, outputPath: join(__dirname, 'screenshots', 'character-2-modal-open.png'), type: 'png', fullPage: false }
      }
    });

    console.log('🖱️ Iterating through Character Modal Tabs...');
    const tabs = ['AI Generate', 'Mixamo', 'VRoid Import', 'Sketchfab', 'Upload File', 'Meme Templates'];

    for (let i = 0; i < tabs.length; i++) {
        const tabName = tabs[i];
        const tabResult = await client.send({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
            name: 'browser_execute',
            arguments: {
                sessionId,
                script: `
                (() => {
                  const buttons = Array.from(document.querySelectorAll('button'));
                  const tabBtn = buttons.find(b => b.innerText.includes('${tabName}') || b.textContent.includes('${tabName}'));
                  if(tabBtn) tabBtn.click();
                  return { tab: '${tabName}', found: !!tabBtn };
                })();
                `
            }
            }
        });
        console.log('Execute Result (Tab ' + tabName + '):', tabResult.result.content[0].text);
        await sleep(1000);
        await client.send({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'browser_screenshot',
              arguments: { sessionId, outputPath: join(__dirname, 'screenshots', 'character-3-tab-' + tabName.replace(' ', '') + '.png'), type: 'png', fullPage: false }
            }
        });
    }

    console.log('🖱️ Finding Brittney features...');
    const brittneyResult = await client.send({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'browser_execute',
        arguments: {
          sessionId,
          script: `
            (() => {
              const buttons = Array.from(document.querySelectorAll('button'));
              const brittneyBtn = buttons.find(b => b.innerText === 'Talk' || b.textContent === 'Talk' || (b.title && b.title.includes('Talk')));
              if(brittneyBtn) brittneyBtn.click();
              return { found: !!brittneyBtn, text: brittneyBtn?.innerText || brittneyBtn?.title };
            })();
          `
        }
      }
    });
    console.log('Execute Result (Brittney):', brittneyResult.result.content[0].text);
    await sleep(2000);

    await client.send({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'browser_screenshot',
          arguments: { sessionId, outputPath: join(__dirname, 'screenshots', 'character-4-brittney-panel.png'), type: 'png', fullPage: false }
        }
    });

    console.log('✅ Testing complete. Screenshots saved to packages/mcp-server/screenshots/');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
  } finally {
    await client.stop();
  }
}

main();
