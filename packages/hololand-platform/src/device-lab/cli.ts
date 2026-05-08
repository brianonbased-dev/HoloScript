#!/usr/bin/env node

import {
  defaultReceiptPath,
  runDeviceLabProbe,
  writeDeviceLabReceipt,
  type DeviceLabOptions,
} from './index';

interface CliOptions {
  out?: string;
  cwd?: string;
  taskId?: string;
  headsetReportPath?: string;
  replayPath?: string;
  webgpuReportPath?: string;
  skipWebGpu: boolean;
  json: boolean;
  strict: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    skipWebGpu: false,
    json: false,
    strict: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (!value) throw new Error(`Missing value for ${arg}`);
      return value;
    };

    if (arg === '--out') options.out = next();
    else if (arg === '--cwd') options.cwd = next();
    else if (arg === '--task') options.taskId = next();
    else if (arg === '--headset-report') options.headsetReportPath = next();
    else if (arg === '--replay') options.replayPath = next();
    else if (arg === '--webgpu-report') options.webgpuReportPath = next();
    else if (arg === '--skip-webgpu') options.skipWebGpu = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--strict') options.strict = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`HoloLand device-lab probe

Usage:
  hololand-device-lab [options]
  pnpm --filter @holoscript/hololand-platform run device-lab -- [options]

Options:
  --out <path>              Receipt JSON path (default: .holoscript/device-lab/...)
  --cwd <path>              Repository root for scripts/probe-webgpu.mjs lookup
  --task <task_id>          Board task id to embed in the receipt
  --headset-report <path>   QuestProbe observations.md export to attach
  --replay <path>           Replay, trace, or validation receipt to hash
  --webgpu-report <path>    Pre-captured scripts/probe-webgpu.mjs JSON report
  --skip-webgpu             Skip browser WebGPU smoke
  --strict                  Exit non-zero on WARN as well as FAIL
  --json                    Print the full receipt JSON
  --help                    Show this help
`);
}

function toRunnerOptions(cli: CliOptions, command: string): DeviceLabOptions {
  return {
    cwd: cli.cwd,
    taskId: cli.taskId,
    command,
    skipWebGpu: cli.skipWebGpu,
    webgpuReportPath: cli.webgpuReportPath,
    headsetReportPath: cli.headsetReportPath,
    replayPath: cli.replayPath,
  };
}

function main(): void {
  const cli = parseArgs(process.argv.slice(2));
  const command = ['hololand-device-lab', ...process.argv.slice(2)].join(' ');
  const now = new Date().toISOString();
  const cwd = cli.cwd ?? process.cwd();
  const receipt = runDeviceLabProbe({
    ...toRunnerOptions(cli, command),
    now,
    cwd,
  });
  const out = writeDeviceLabReceipt(receipt, cli.out ?? defaultReceiptPath(cwd, now));

  if (cli.json) {
    console.log(JSON.stringify({ receiptPath: out, receipt }, null, 2));
  } else {
    console.log(`HoloLand device-lab receipt: ${out}`);
    console.log(`Status: ${receipt.overallStatus.toUpperCase()} (${receipt.receiptId})`);
    for (const check of receipt.checks) {
      console.log(`- ${check.status.toUpperCase().padEnd(7)} ${check.label}: ${check.detail}`);
    }
    if (receipt.gotchas.length > 0) {
      console.log('Gotchas:');
      for (const gotcha of receipt.gotchas) {
        console.log(`- ${gotcha.id} [${gotcha.severity}]: ${gotcha.summary}`);
      }
    }
  }

  if (receipt.overallStatus === 'fail' || (cli.strict && receipt.overallStatus === 'warn')) {
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
