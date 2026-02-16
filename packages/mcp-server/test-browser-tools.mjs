#!/usr/bin/env node
/**
 * Test script for MCP browser control tools
 * Tests browser_launch, browser_execute, browser_screenshot
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

    // Initialize
    const initResult = await this.send({
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' }
      }
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

      // Timeout after 30s
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }

  async stop() {
    this.server.kill();
  }
}

async function main() {
  const client = new MCPClient();

  try {
    await client.start();

    // 1. List tools
    console.log('📋 Listing tools...');
    const toolsResult = await client.send({
      jsonrpc: '2.0',
      method: 'tools/list',
      params: {}
    });

    const browserTools = toolsResult.result.tools.filter(t =>
      t.name.startsWith('browser_')
    );

    console.log(`\n✅ Found ${browserTools.length} browser tools:`);
    browserTools.forEach(tool => {
      console.log(`   - ${tool.name}: ${tool.description}`);
    });

    if (browserTools.length !== 3) {
      throw new Error(`Expected 3 browser tools, found ${browserTools.length}`);
    }

    // 2. Test browser_launch
    console.log('\n🌐 Testing browser_launch...');
    const launchResult = await client.send({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'browser_launch',
        arguments: {
          holoscriptFile: '../../examples/hello-world.hs',
          width: 1280,
          height: 720,
          headless: true
        }
      }
    });

    if (launchResult.result.content[0].text.includes('success')) {
      const data = JSON.parse(launchResult.result.content[0].text);
      console.log(`✅ Browser launched successfully`);
      console.log(`   Session ID: ${data.sessionId}`);
      console.log(`   URL: ${data.url}`);

      const sessionId = data.sessionId;

      // 3. Test browser_execute
      console.log('\n🔍 Testing browser_execute...');
      const executeResult = await client.send({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'browser_execute',
          arguments: {
            sessionId,
            script: 'document.title'
          }
        }
      });

      console.log('✅ JavaScript executed successfully');
      const execData = JSON.parse(executeResult.result.content[0].text);
      console.log(`   Result: ${execData.result}`);

      // 4. Test browser_screenshot
      console.log('\n📸 Testing browser_screenshot...');
      const screenshotResult = await client.send({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'browser_screenshot',
          arguments: {
            sessionId,
            outputPath: join(__dirname, 'screenshots', 'test-hello-world.png'),
            type: 'png',
            fullPage: false
          }
        }
      });

      console.log('✅ Screenshot captured successfully');
      const ssData = JSON.parse(screenshotResult.result.content[0].text);
      console.log(`   Saved to: ${ssData.outputPath}`);
      console.log(`   Size: ${(ssData.size / 1024).toFixed(1)} KB`);

      console.log('\n🎉 All browser control tools working!\n');
    } else {
      throw new Error('Browser launch failed');
    }

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  } finally {
    await client.stop();
  }
}

main();
