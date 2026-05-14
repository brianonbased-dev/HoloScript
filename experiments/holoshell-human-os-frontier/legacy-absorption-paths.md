# HoloShell Legacy App Absorption Paths

> **Scope**: General archetype classification for local program/workflow absorption into HoloShell.  
> **Rule**: No private local inventory is recorded here. All examples are archetypes, not system scans.  
> **Authority**: `experiments/holoshell-human-os-frontier/manifest.json` — canonical format `.hsplus` + `.md`.  
> **Audience**: Agents building the HoloShell human-OS frontier.

## 1. Absorption Path Taxonomy

HoloShell absorbs legacy apps through four ordered paths. The path chosen for a given archetype depends on what surface the legacy app exposes, what permissions the user has granted, and whether a deterministic receipt can be produced.

| Path | Trigger | Mechanism | Receipt Quality | Trust Floor |
|---|---|---|---|---|
| **Native API / MCP** | App exposes a programmatic surface (REST, SDK, MCP server, COM, WMI). | Call the API directly via HoloScript `@connector` traits or MCP tool dispatch. | Structured, signed, replayable. | `verified` |
| **CLI / PowerShell** | App ships a command-line interface or is reachable through OS shell primitives. | HoloScript `.hs` pipeline invokes `exec` / `Start-Process` with argument validation and stdout/stderr capture. | Exit-code + stdout/stderr + artifact hash. | `known` |
| **Browser Automation** | App is a web service with no local API, but a browser can drive it. | Playwright/Chrome agent behind a HoloScript policy envelope. DOM state + screenshot as evidence. | Screenshot + network log + cookie/session audit. | `external` |
| **UI Automation / Vision Fallback** | App is GUI-only, closed, or opaque. No API, no CLI, no web surface. | OS accessibility tree + pixel-level vision model. Slowest, least deterministic, highest risk. | Before/after screenshot + bounding-box trace + confidence score. | `untrusted` |

Path selection is **not** permanent. As a legacy app gains a better surface (e.g., a vendor ships an MCP server), HoloShell reclassifies the archetype and migrates active workflows to the higher-trust path.

## 2. Archetype Classifications

Each archetype is modeled as a HoloScript capability object. The object shape composites `AgentCapability` (from `@holoscript/framework/agents`) with trust state, permission grants, receipt schema, and a sovereign replacement roadmap.

### 2.1 Package Manager / Build Orchestrator

**Description**: Dependency installation, compilation, test execution, and artifact packaging.  
**Examples (archetypal)**: npm, pnpm, cargo, poetry, make, MSBuild.

```hsplus
capability "PackageManagerOrchestrator" {
  @agent { type: "holoshell"; source: "cli" }

  trustState: "known"
  // Can be elevated to "verified" if the package manager exposes
  // a structured lockfile and SBOM surface that HoloScript can audit.

  permissions: [
    { with: "holoscript://fs/node_modules", can: "fs/write", nb: { scoped: true, dryRun: false } }
    { with: "holoscript://fs/package-lock", can: "fs/read" }
    { with: "holoscript://process/exec", can: "process/spawn", nb: { allowedBinaries: ["npm", "pnpm", "cargo", "make"] } }
    { with: "holoscript://network/registry", can: "net/fetch", nb: { maxBytes: 1_000_000_000, allowedHosts: ["registry.npmjs.org", "crates.io"] } }
  ]

  receiptExpectation: {
    schema: "holoshell-receipt-v1"
    requiredArtifacts: ["exitCode", "stdout", "stderr", "lockfileDiff", "buildArtifactHash"]
    lifecycle: ["plan", "spawn", "stream", "finalize", "verify"]
    rollbackTrigger: "exitCode != 0 || buildArtifactHash mismatch"
  }

  replacementPath: "Sovereign `@holoscript/package-manager` trait with deterministic Nix-style sandbox + HoloScript-native dependency graph."
}
```

**Primary Path**: CLI / PowerShell  
**Fallback Path**: Native API / MCP (when registry exposes signed metadata endpoints).  
**Why This Archetype First**: It is the highest-frequency local workflow for developers and the most dangerous to leave opaque. A failed build without a receipt is a daily occurrence.

---

### 2.2 Cloud Document / Mail Client

**Description**: Reading, composing, organizing, and syncing documents or messages hosted by a cloud provider.  
**Examples (archetypal)**: Gmail, Google Drive, OneDrive, Dropbox, Notion web.

```hsplus
capability "CloudDocumentClient" {
  @agent { type: "holoshell"; source: "browser" }

  trustState: "external"
  // Elevates to "verified" only when the provider ships a first-party
  // MCP server with OAuth2 + PKCE and scoped capability tokens.

  permissions: [
    { with: "holoscript://browser/session", can: "browser/automate", nb: { domains: ["mail.google.com", "drive.google.com", "notion.so"], headless: false, userVisible: true } }
    { with: "holoscript://fs/downloads", can: "fs/write", nb: { maxBytes: 100_000_000, fileTypes: [".pdf", ".docx", ".md"] } }
    { with: "holoscript://identity/oauth", can: "identity/delegate", nb: { provider: "google", scopes: ["readonly", "drive.file"] } }
  ]

  receiptExpectation: {
    schema: "holoshell-receipt-v1"
    requiredArtifacts: ["screenshotBefore", "screenshotAfter", "networkLog", "cookieAudit", "downloadHash"]
    lifecycle: ["plan", "authenticate", "navigate", "act", "capture", "verify"]
    rollbackTrigger: "downloadHash missing || screenshot diff shows unexpected state"
  }

  replacementPath: "Native `@holoscript/connector-google` / `@holoscript/connector-notion` with UCAN capability tokens and deterministic sync primitives."
}
```

**Primary Path**: Browser Automation  
**Fallback Path**: Native API / MCP (if provider exposes structured endpoints).  
**Why This Archetype Matters**: Non-technical users spend most of their computer time here. Wrapping it in a deterministic HoloScript plan is the highest human-impact win.

---

### 2.3 System Diagnostic / Monitor

**Description**: Querying CPU, memory, disk, GPU, network, thermal, and process state to explain performance or failures.  
**Examples (archetypal)**: Task Manager, Resource Monitor, `Get-Process`, `nvidia-smi`, `wmic`.

```hsplus
capability "SystemDiagnostic" {
  @agent { type: "holoshell"; source: "native-api" }

  trustState: "local"
  // Reads local-only state; no network. Highest trust because the data
  // never leaves the machine and the APIs are OS-native.

  permissions: [
    { with: "holoscript://os/process", can: "os/read", nb: { fields: ["pid", "name", "cpu", "memory", "io"] } }
    { with: "holoscript://os/gpu", can: "os/read", nb: { vendor: "any", fields: ["utilization", "memory", "temperature"] } }
    { with: "holoscript://os/storage", can: "os/read", nb: { pathPrefixes: ["C:\\", "D:\\"] } }
    { with: "holoscript://os/network", can: "os/read", nb: { interfaces: ["Ethernet", "Wi-Fi"] } }
  ]

  receiptExpectation: {
    schema: "holoshell-receipt-v1"
    requiredArtifacts: ["snapshotJson", "baselineDiff", "thresholdBreachLog"]
    lifecycle: ["plan", "sample", "aggregate", "compare", "report"]
    rollbackTrigger: "N/A — read-only operation; no mutation to roll back."
  }

  replacementPath: "Sovereign `@holoscript/system-monitor` trait that ships structured telemetry directly to the HoloScript runtime without WMI/PowerShell intermediaries."
}
```

**Primary Path**: Native API / MCP (PowerShell/WMI on Windows, `procfs`/`sysfs` on Linux).  
**Fallback Path**: UI Automation / Vision (for GPU tools that only render charts, e.g., MSI Afterburner).  
**Why This Archetype Matters**: The "Slow Computer Clinic" idea seed depends on it. Non-technical users need visibility into hardware state without learning `wmic` or `ps`.

---

### 2.4 Office / Document Editor

**Description**: Creating, editing, formatting, and converting documents, spreadsheets, or presentations.  
**Examples (archetypal)**: Microsoft Word, Excel, PowerPoint, local Notion desktop, LibreOffice.

```hsplus
capability "DocumentEditor" {
  @agent { type: "holoshell"; source: "ui-automation" }

  trustState: "untrusted"
  // GUI automation is the least deterministic path. Elevates to "known"
  // if the app exposes an accessibility tree (UIA on Windows, AX on macOS)
  // that HoloScript can parse structurally rather than by pixel.

  permissions: [
    { with: "holoscript://ui/automation", can: "ui/interact", nb: { targets: ["ribbon", "documentSurface", "dialog"], forbid: ["systemModal", "uacPrompt"] } }
    { with: "holoscript://fs/documents", can: "fs/read+write", nb: { allowedExtensions: [".docx", ".xlsx", ".pdf", ".md"], maxSize: 50_000_000 } }
    { with: "holoscript://vision/screen", can: "vision/capture", nb: { regions: ["documentViewport"], onDiff: "warn" } }
  ]

  receiptExpectation: {
    schema: "holoshell-receipt-v1"
    requiredArtifacts: ["beforeScreenshot", "afterScreenshot", "accessibilityTreeDiff", "savedFileHash"]
    lifecycle: ["plan", "focus", "navigate-ui", "edit", "save", "capture", "verify"]
    rollbackTrigger: "savedFileHash missing || accessibilityTreeDiff shows unexpected dialog"
    confidenceThreshold: 0.85
    // Vision fallback receipts carry a confidence score. Below 0.85,
    // HoloShell pauses for human approval instead of auto-committing.
  }

  replacementPath: "Native `@holoscript/document-engine` that edits .docx/.xlsx via deterministic OpenXML/HoloScript transforms, eliminating GUI automation entirely."
}
```

**Primary Path**: UI Automation / Vision Fallback  
**Elevated Path**: Native API / MCP (if the editor exposes a COM/JS API, e.g., Word VBA, Excel JavaScript API).  
**Why This Archetype Matters**: Document workflows are common but currently opaque. A human cannot see what an AI "typed into Word" without screenshots.

---

### 2.5 Communication Hub

**Description**: Sending, receiving, and organizing messages across chat, email, or video platforms.  
**Examples (archetypal)**: Slack, Discord, Microsoft Teams, WhatsApp desktop, Telegram.

```hsplus
capability "CommunicationHub" {
  @agent { type: "holoshell"; source: "browser" }

  trustState: "external"
  // Elevates to "verified" if the platform ships an official MCP server
  // with scoped OAuth and message-sandboxing.

  permissions: [
    { with: "holoscript://browser/session", can: "browser/automate", nb: { domains: ["app.slack.com", "discord.com", "teams.microsoft.com"], headless: false } }
    { with: "holoscript://identity/oauth", can: "identity/delegate", nb: { scopes: ["chat:read", "chat:write:bot"], neverScopes: ["admin", "billing"] } }
    { with: "holoscript://notification/dispatch", can: "notify/send", nb: { maxRate: 1, requireReceipt: true } }
  ]

  receiptExpectation: {
    schema: "holoshell-receipt-v1"
    requiredArtifacts: ["messageId", "timestamp", "recipientHash", "screenshotAfter"]
    lifecycle: ["plan", "authenticate", "compose", "review", "send", "confirm"]
    rollbackTrigger: "messageId missing || screenshot diff shows send-failure banner"
    humanApprovalGate: true
    // Communication mutations always require human approval in the current
    // HoloShell policy envelope. The receipt is produced *after* approval.
  }

  replacementPath: "Native `@holoscript/connector-slack` / `@holoscript/connector-discord` with real-time WebHook + CRDT message sync, removing browser automation."
}
```

**Primary Path**: Browser Automation  
**Elevated Path**: Native API / MCP (if platform exposes bot APIs or WebSockets).  
**Why This Archetype Matters**: Communication is high-stakes. A wrong send is irreversible. The receipt must be explicit, and the human approval gate is non-negotiable.

## 3. Cross-Cutting Rules

### 3.1 Permission Grants Are Capability Tokens
Every permission in the `permissions:` array is a UCAN `Capability` (`with`, `can`, `nb`). HoloShell stores them in the agent's local capability token cache. The user grants them through a HoloLand permissions room, not through opaque OS dialogs.

### 3.2 Receipts Are Source of Truth
A legacy-app action without a receipt did not happen in the HoloShell model. Receipts include:
- **Lifecycle events** (plan, spawn/authenticate/navigate, act, verify)
- **Artifact hashes** (stdout, screenshots, file hashes, diff outputs)
- **Rollback triggers** (conditions that auto-queue a compensating action)
- **Confidence scores** (for vision/UIA fallbacks)

### 3.3 Replacement Path Is Not Optional
Every legacy absorption must name the sovereign HoloScript primitive that eventually replaces it. If no replacement exists, the archetype is a **substrate gap** and must file a task against `packages/core` or `packages/holoshell-agent`.

### 3.4 Trust Floor by Path
| Path | Default Trust | Elevation Condition |
|---|---|---|
| Native API / MCP | `verified` | API returns structured, signed responses |
| CLI / PowerShell | `known` | Binary is in a signed package manager lockfile |
| Browser Automation | `external` | Domain is in user's allowlist + OAuth scope is narrow |
| UI Automation / Vision | `untrusted` | Accessibility tree is parseable and matches vision model output |

### 3.5 No Private Inventory
This document contains no list of Joseph's installed programs, no system paths, no local file trees, and no personally identifiable workflow data. All examples are archetypes. If an agent needs to map this classification to a specific machine, it performs a local scan at runtime and binds archetypes to concrete binaries through the `holoshell-human-os-frontier` automation loop (see `README.md`).

## 4. Next Steps

1. **Wire the archetypes to the HoloMesh board** as seed tasks under the `holoshell-human-os-frontier` experiment.
2. **Build the CLI adapter** (`PackageManagerOrchestrator`) first — it has the highest developer frequency and the clearest receipt surface.
3. **Design the HoloLand permissions room** where users grant/revoke capability tokens for each archetype visually.
4. **File substrate gaps**: `DocumentEditor` and `CommunicationHub` need deterministic document/message transforms before GUI automation can be retired.
