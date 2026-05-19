#!/usr/bin/env node

/**
 * hololand-headset-share CLI
 *
 * Start an owned headset share transport that produces a Quest Browser
 * HTTPS URL without relying on ngrok or any third-party tunnel.
 *
 * Usage:
 *   hololand-headset-share [options]
 *   hololand-headset-share --code <file-or-string> --transport lan-https
 *   hololand-headset-share --code scene.hs --transport usb-adb --port 8420
 *   hololand-headset-share --code scene.hs --transport holomesh-relay
 *
 * task_1778964942978_iuct
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  startHeadsetShareServer,
  type HeadsetShareOptions,
  type HeadsetTransportKind,
  detectLanIp,
  detectAllLanIps,
  adbAvailable,
  adbListDevices,
  defaultCommandRunner,
  DEFAULT_HEADSET_SHARE_OUTPUT_DIR,
} from './index';

const VALID_TRANSPORTS: HeadsetTransportKind[] = [
  'hololand-share',
  'holomesh-relay',
  'lan-https',
  'usb-adb',
  'ngrok-https',
];

interface CliOptions {
  code?: string;
  codeFile?: string;
  name: string;
  author: string;
  transport: HeadsetTransportKind;
  port: number;
  host?: string;
  apiKey?: string;
  holomeshHost: string;
  customDomain?: string;
  taskId?: string;
  json: boolean;
  listIps: boolean;
  checkAdb: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    name: 'Untitled',
    author: 'Anonymous',
    transport: 'lan-https',
    port: 0,
    holomeshHost: 'https://mcp.holoscript.net',
    json: false,
    listIps: false,
    checkAdb: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = (): string => {
      const value = argv[++i];
      if (!value) throw new Error(`Missing value for ${arg}`);
      return value;
    };

    if (arg === '--code') options.code = next();
    else if (arg === '--code-file') options.codeFile = next();
    else if (arg === '--name') options.name = next();
    else if (arg === '--author') options.author = next();
    else if (arg === '--transport') {
      const transport = next();
      if (!VALID_TRANSPORTS.includes(transport as HeadsetTransportKind)) {
        throw new Error(`Invalid transport: ${transport}. Valid: ${VALID_TRANSPORTS.join(', ')}`);
      }
      options.transport = transport as HeadsetTransportKind;
    }
    else if (arg === '--port') options.port = parseInt(next(), 10);
    else if (arg === '--host') options.host = next();
    else if (arg === '--api-key') options.apiKey = next();
    else if (arg === '--holomesh-host') options.holomeshHost = next();
    else if (arg === '--custom-domain') options.customDomain = next();
    else if (arg === '--task') options.taskId = next();
    else if (arg === '--json') options.json = true;
    else if (arg === '--list-ips') options.listIps = true;
    else if (arg === '--check-adb') options.checkAdb = true;
    else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`HoloLand headset share — owned HTTPS transport for Quest proof

Usage:
  hololand-headset-share [options]

Options:
  --code <string>           HoloScript scene code to share
  --code-file <path>       Read HoloScript scene code from file
  --name <string>           Scene name (default: Untitled)
  --author <string>         Author name (default: Anonymous)
  --transport <kind>        Transport: lan-https, usb-adb, holomesh-relay (default: lan-https)
  --port <number>           Port for local server (default: auto-assign)
  --host <ip>               Host IP for LAN server (default: auto-detect)
  --api-key <key>           HoloMesh API key (for holomesh-relay)
  --holomesh-host <url>     HoloMesh relay host (default: https://mcp.holoscript.net)
  --custom-domain <domain>  Custom domain for share URLs
  --task <task-id>          Board task ID to embed in receipt
  --json                    Print full receipt JSON
  --list-ips                List detected LAN IPs and exit
  --check-adb               Check ADB availability and connected devices
  --help                    Show this help

Transports:
  lan-https       Start a local HTTP server accessible on the LAN.
                  Quest Browser can access http://<lan-ip>:<port>/s/<id>
                  Best for: same-network Quest headsets.

  usb-adb         Forward a local port via ADB reverse.
                  Quest Browser accesses https://localhost:<port>/s/<id>
                  Best for: USB-connected Quest headsets.

  holomesh-relay  Upload scene to HoloMesh cloud relay.
                  Returns a public HTTPS URL accessible anywhere.
                  Best for: remote headsets, production use.

  hololand-share  Alias for lan-https (local owned share).

Examples:
  # Share a scene file on LAN
  hololand-headset-share --code-file scene.hs --name "My Scene"

  # Share via ADB for USB-connected Quest
  hololand-headset-share --code-file scene.hs --transport usb-adb

  # Share via HoloMesh relay for remote access
  hololand-headset-share --code "ball { position 0 1 0 }" --transport holomesh-relay

  # List LAN IPs
  hololand-headset-share --list-ips

  # Check ADB connectivity
  hololand-headset-share --check-adb
`);
}

async function main(): Promise<void> {
  const cli = parseArgs(process.argv.slice(2));

  if (cli.help) {
    printHelp();
    process.exit(0);
  }

  // Utility: list LAN IPs
  if (cli.listIps) {
    const ips = detectAllLanIps();
    const primary = detectLanIp();
    console.log('Detected LAN IPs:');
    for (const ip of ips) {
      const marker = ip === primary ? ' (primary)' : '';
      console.log(`  ${ip}${marker}`);
    }
    process.exit(0);
  }

  // Utility: check ADB
  if (cli.checkAdb) {
    const available = adbAvailable();
    if (!available) {
      console.log('ADB: not available (install Android SDK Platform Tools)');
      process.exitCode = 1;
      return;
    }
    console.log('ADB: available');
    const devices = adbListDevices();
    if (devices.length === 0) {
      console.log('Devices: none connected');
      console.log('Connect Quest via USB and enable USB debugging in Quest settings.');
      process.exitCode = 1;
      return;
    }
    console.log(`Devices: ${devices.length}`);
    for (const serial of devices) {
      console.log(`  ${serial}`);
    }
    return;
  }

  // Get code from arg or file
  let code = cli.code;
  if (!code && cli.codeFile) {
    const filePath = resolve(cli.codeFile);
    if (!existsSync(filePath)) {
      console.error(`Error: code file not found: ${filePath}`);
      process.exitCode = 1;
      return;
    }
    code = readFileSync(filePath, 'utf8');
  }
  if (!code) {
    console.error('Error: --code or --code-file is required');
    process.exitCode = 1;
    return;
  }

  const options: HeadsetShareOptions = {
    code,
    name: cli.name,
    author: cli.author,
    transport: cli.transport,
    port: cli.port || undefined,
    host: cli.host,
    apiKey: cli.apiKey,
    holomeshHost: cli.holomeshHost,
    customDomain: cli.customDomain,
    taskId: cli.taskId,
  };

  let server;
  try {
    server = await startHeadsetShareServer(options);
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
    return;
  }

  console.log(`\n  HoloLand Headset Share`);
  console.log(`  Transport: ${server.transport}`);
  console.log(`  Share ID:  ${server.shareId}`);
  console.log(`  URL:        ${server.url}`);
  console.log(`  Host:       ${server.host}:${server.port}`);
  console.log(`\n  Open this URL in Quest Browser to view the scene.`);
  console.log(`  Press Ctrl+C to stop.\n`);

  if (cli.json) {
    // Print receipt details
    const receiptDir = `${DEFAULT_HEADSET_SHARE_OUTPUT_DIR}`;
    console.log(JSON.stringify({
      shareId: server.shareId,
      url: server.url,
      transport: server.transport,
      host: server.host,
      port: server.port,
    }, null, 2));
  }

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\nShutting down headset share server...');
    await server.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});