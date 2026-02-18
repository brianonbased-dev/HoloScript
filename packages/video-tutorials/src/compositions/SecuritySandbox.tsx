import React from "react";
import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import { TitleCard } from "../components/TitleCard";
import { CodeStep } from "../components/CodeStep";

const STEPS = [
  {
    title: "Why a Sandbox?",
    description: "User-submitted .holo files and third-party plugins can execute arbitrary code — isolation is essential.",
    lines: [
      { content: "// Threat model: untrusted .holo code", dim: true },
      { content: "" },
      { content: "// WITHOUT a sandbox — dangerous", type: "removed" as const, highlight: true },
      { content: "const result = eval(userSubmittedCode)  // ← runs in host process", type: "removed" as const },
      { content: "" },
      { content: "// Risks of running untrusted .holo", dim: true },
      { content: "// ✗ File system access (read /etc/passwd)", type: "removed" as const },
      { content: "// ✗ Network exfiltration (fetch secrets)", type: "removed" as const },
      { content: "// ✗ CPU/memory exhaustion (infinite loops)", type: "removed" as const },
      { content: "// ✗ require('child_process').exec(...)", type: "removed" as const },
      { content: "" },
      { content: "// WITH @holoscript/security-sandbox", highlight: true },
      { content: "// ✓ Isolated V8 context via vm2", type: "added" as const },
      { content: "// ✓ Configurable resource limits", type: "added" as const },
      { content: "// ✓ Allowlist-only module access", type: "added" as const },
    ],
  },
  {
    title: "Creating a Sandbox",
    description: "Import createSandbox and configure isolation options before executing any untrusted code.",
    lines: [
      { content: 'import { createSandbox } from "@holoscript/security-sandbox"', highlight: true },
      { content: 'import type { SandboxOptions } from "@holoscript/security-sandbox"' },
      { content: "" },
      { content: "const options: SandboxOptions = {", highlight: true },
      { content: "  timeout: 5000,            // 5 s hard limit", annotation: "ms" },
      { content: "  maxMemoryMB: 128,          // 128 MB heap cap" },
      { content: "  networkAccess: false,      // no outbound requests", type: "added" as const },
      { content: "  allowedModules: ['path'],  // allowlist only", type: "added" as const },
      { content: "  allowedBuiltins: ['console', 'Math'],", type: "added" as const },
      { content: "}" },
      { content: "" },
      { content: "const sandbox = createSandbox(options)", highlight: true, annotation: "→ Sandbox" },
    ],
  },
  {
    title: "Executing in the Sandbox",
    description: "Pass untrusted .holo source or plugin code to sandbox.execute() and receive a safe result object.",
    lines: [
      { content: "const userCode = await fs.readFile('user-plugin.js', 'utf8')", highlight: true },
      { content: "" },
      { content: "try {", highlight: true },
      { content: "  const result = await sandbox.execute(userCode, {", highlight: true },
      { content: "    context: {", annotation: "injected globals" },
      { content: "      holoAPI: sandboxedHoloAPI,  // safe subset of HoloScript API" },
      { content: "    }," },
      { content: "  })" },
      { content: "" },
      { content: "  console.log(result.output)    // captured console.log calls", type: "added" as const },
      { content: "  console.log(result.returnVal) // return value of last expression", type: "added" as const },
      { content: "  console.log(result.duration)  // ms elapsed", type: "added" as const },
      { content: "" },
      { content: "} catch (err) {" },
      { content: "  if (err.code === 'SANDBOX_TIMEOUT') { /* handle timeout */ }", dim: true },
      { content: "}", dim: true },
    ],
  },
  {
    title: "Resource Limits",
    description: "Fine-tune memory, CPU, module access, and network restrictions to match your security policy.",
    lines: [
      { content: "const sandbox = createSandbox({", highlight: true },
      { content: "" },
      { content: "  // Execution limits", dim: true },
      { content: "  timeout: 3000,         // 3 s wall-clock timeout", annotation: "default: 5000" },
      { content: "  maxMemoryMB: 64,       // 64 MB heap limit" },
      { content: "  maxCPUPercent: 50,     // max 50% of one core", type: "added" as const },
      { content: "" },
      { content: "  // Module restrictions", dim: true },
      { content: "  allowedModules: [],    // no require() at all", type: "added" as const, highlight: true },
      { content: "  allowedBuiltins: ['Math', 'JSON', 'Date'],", type: "added" as const },
      { content: "" },
      { content: "  // Network", dim: true },
      { content: "  networkAccess: false,  // block fetch / XMLHttpRequest", type: "added" as const, highlight: true, annotation: "recommended" },
      { content: "" },
      { content: "  // File system", dim: true },
      { content: "  fsAccess: 'none',      // 'none' | 'read-only' | 'read-write'", type: "added" as const },
      { content: "})" },
    ],
  },
  {
    title: "Audit Logging",
    description: "Subscribe to sandbox events to build a complete audit trail of all untrusted code executions.",
    lines: [
      { content: 'import { createSandbox, SandboxEvent } from "@holoscript/security-sandbox"', highlight: true },
      { content: 'import { appendFile } from "fs/promises"' },
      { content: "" },
      { content: "const sandbox = createSandbox({ timeout: 5000, networkAccess: false })" },
      { content: "" },
      { content: "// Attach audit listeners", highlight: true },
      { content: "sandbox.on('execute', async (event: SandboxEvent) => {", highlight: true },
      { content: "  const entry = JSON.stringify({", type: "added" as const },
      { content: "    ts: new Date().toISOString(),", type: "added" as const },
      { content: "    pluginId: event.pluginId,", type: "added" as const },
      { content: "    duration: event.duration,", type: "added" as const },
      { content: "    memUsedMB: event.memUsedMB,", type: "added" as const },
      { content: "    exitCode: event.exitCode,", type: "added" as const },
      { content: "  })", type: "added" as const },
      { content: "  await appendFile('audit.log', entry + '\n')", type: "added" as const, annotation: "append to log" },
      { content: "})" },
      { content: "" },
      { content: "sandbox.on('violation', (v) => alertSecurityTeam(v))", highlight: true, annotation: "real-time alerts" },
    ],
  },
];

export const SecuritySandbox: React.FC = () => {
  const { fps } = useVideoConfig();
  const titleDuration = 3 * fps;
  const stepDuration = 5 * fps;

  return (
    <AbsoluteFill style={{ background: "#0f1117" }}>
      <Sequence from={0} durationInFrames={titleDuration}>
        <TitleCard
          title="Security Sandbox"
          subtitle="Safe execution of untrusted HoloScript code with the @holoscript/security-sandbox"
          tag="Advanced"
        />
      </Sequence>

      {STEPS.map((step, i) => (
        <Sequence
          key={i}
          from={titleDuration + i * stepDuration}
          durationInFrames={stepDuration}
        >
          <CodeStep
            stepNumber={i + 1}
            title={step.title}
            description={step.description}
            lines={step.lines}
            language="typescript"
          />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
