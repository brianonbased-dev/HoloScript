# Sprint 7: Developer Experience & Ecosystem

**Version**: v3.4.0  
**Target Date**: April 2026  
**Theme**: Collaboration, Marketplace, and Enhanced Developer Tools

---

## Overview

Sprint 7 delivers **Developer Experience & Ecosystem** capabilities, transforming HoloScript from a powerful language into a complete development platform. Building on Sprint 6's export pipeline, this sprint focuses on making HoloScript accessible to teams and enabling community-driven growth.

> **Note:** Many Sprint 7 features were implemented during earlier sprints. This plan reflects the actual state and focuses remaining effort on collaboration and marketplace features.

### Key Value Propositions

1. **IDE Integration**: ✅ Already complete - VS Code extension v3.3.0 with IntelliSense, debugging, and live preview
2. **Real-time Collaboration**: Multi-user editing with conflict resolution and presence awareness
3. **Trait Marketplace**: Community-driven trait sharing with versioning and dependencies
4. **Analytics Dashboard**: ✅ Already complete - Usage metrics, performance monitoring, and error tracking

---

## Sprint Priorities

| Priority | Focus                       | Effort | Dependencies      | Status      |
| -------- | --------------------------- | ------ | ----------------- | ----------- |
| **1**    | VS Code Extension Core      | High   | LSP complete      | ✅ Complete |
| **2**    | Live Preview System         | High   | Priority 1        | ✅ Complete |
| **3**    | Real-time Collaboration     | High   | Priority 1        | ✅ Complete |
| **4**    | Version Control Integration | Medium | Priority 3        | ✅ Complete |
| **5**    | Trait Marketplace Backend   | High   | Registry complete | ✅ Complete |
| **6**    | Trait Marketplace UI        | Medium | Priority 5        | ✅ Complete |
| **7**    | Analytics & Telemetry       | Medium | Telemetry module  | ✅ Complete |
| **8**    | Performance Dashboard       | Medium | Priority 7        | ✅ Complete |

---

## Priority 1: VS Code Extension Core ✅ COMPLETE

**Status:** Already implemented in `packages/vscode-extension/` v3.3.0

**Goal:** Full-featured VS Code extension with IntelliSense, diagnostics, and code actions

**Effort**: 3 weeks | **Risk**: Medium

### Implemented Features

The VS Code extension is fully implemented with:

- **LanguageClient**: Full LSP integration via `packages/lsp/`
- **CompletionProvider**: `HoloScriptCompletionItemProvider` with 491+ lines
- **HoverProvider**: `HoloScriptHoverProvider` with trait documentation
- **SemanticTokensProvider**: Full semantic highlighting
- **McpOrchestratorClient**: MCP integration for IDE agents
- **SmartAssetEditor**: Custom asset editing support
- **HoloHubView**: Tree view for smart assets

### Actual Implementation

```typescript
// packages/vscode-extension/src/extension.ts (489 lines)
import { LanguageClient } from 'vscode-languageclient/node';
import { HoloScriptCompletionItemProvider } from './completionProvider';
import { HoloScriptHoverProvider } from './hoverProvider';
import { HoloScriptPreviewPanel } from './previewPanel';
import { McpOrchestratorClient } from './services/McpOrchestratorClient';

export function activate(context: ExtensionContext) {
  // Full activation with all providers
}
```

### Deliverables ✅

- ✅ `packages/vscode-extension/src/extension.ts` (489 lines)
- ✅ `packages/lsp/src/server.ts` (Language Server)
- ✅ `packages/vscode-extension/src/completionProvider.ts` (491 lines)
- ✅ `packages/vscode-extension/src/hoverProvider.ts`
- ✅ `packages/vscode-extension/src/semanticTokensProvider.ts`
- ✅ `packages/vscode-extension/syntaxes/holoscript.tmLanguage.json`
- ✅ `packages/vscode-extension/snippets/`

### Design

```typescript
// Extension architecture
export interface IHoloScriptExtension {
  languageClient: LanguageClient;
  diagnosticsProvider: DiagnosticsProvider;
  completionProvider: CompletionProvider;
  hoverProvider: HoverProvider;
  definitionProvider: DefinitionProvider;
  referenceProvider: ReferenceProvider;
  renameProvider: RenameProvider;
  codeActionProvider: CodeActionProvider;
  documentFormattingProvider: FormattingProvider;
}

// Language Server Protocol implementation
export class HoloScriptLanguageServer {
  constructor(connection: Connection);

  // Core capabilities
  onCompletion(params: CompletionParams): CompletionItem[];
  onHover(params: HoverParams): Hover | null;
  onDefinition(params: DefinitionParams): Location[];
  onReferences(params: ReferenceParams): Location[];
  onRename(params: RenameParams): WorkspaceEdit;

  // Diagnostics
  validateDocument(document: TextDocument): Diagnostic[];

  // Code actions
  getCodeActions(params: CodeActionParams): CodeAction[];
}

export interface CompletionContext {
  triggerKind: 'invoked' | 'character' | 'incomplete';
  triggerCharacter?: string;
  scope: 'global' | 'trait' | 'object' | 'function';
  availableTraits: TraitInfo[];
  availableObjects: ObjectInfo[];
}
```

### Extension Features

```jsonc
// package.json (extension manifest)
{
  "name": "holoscript-vscode",
  "displayName": "HoloScript",
  "description": "HoloScript language support for VS Code",
  "categories": ["Programming Languages", "Debuggers", "Formatters"],
  "contributes": {
    "languages": [
      {
        "id": "holoscript",
        "extensions": [".holo", ".hs+"],
        "configuration": "./language-configuration.json",
      },
    ],
    "grammars": [
      {
        "language": "holoscript",
        "scopeName": "source.holoscript",
        "path": "./syntaxes/holoscript.tmLanguage.json",
      },
    ],
    "commands": [
      { "command": "holoscript.preview", "title": "HoloScript: Open Preview" },
      { "command": "holoscript.compile", "title": "HoloScript: Compile Scene" },
      { "command": "holoscript.export", "title": "HoloScript: Export..." },
      { "command": "holoscript.debug", "title": "HoloScript: Start Debugging" },
    ],
    "configuration": {
      "title": "HoloScript",
      "properties": {
        "holoscript.livePreview": { "type": "boolean", "default": true },
        "holoscript.autoFormat": { "type": "boolean", "default": true },
        "holoscript.telemetry": { "type": "boolean", "default": false },
      },
    },
  },
}
```

### Deliverables

- `packages/vscode-extension/src/extension.ts`
- `packages/vscode-extension/src/languageServer.ts`
- `packages/vscode-extension/src/providers/` (completion, hover, definition, etc.)
- `packages/vscode-extension/syntaxes/holoscript.tmLanguage.json`
- `packages/vscode-extension/snippets/holoscript.json`
- 50+ unit tests

### Acceptance Criteria

- [ ] IntelliSense for all HoloScript constructs
- [ ] Real-time error diagnostics with squiggles
- [ ] Go to definition for traits, objects, functions
- [ ] Find all references
- [ ] Rename symbol across files
- [ ] Format document/selection
- [ ] 10+ code snippets for common patterns

---

## Priority 2: Live Preview System ✅ COMPLETE

**Status:** Already implemented in `packages/vscode-extension/src/previewPanel.ts` (2,196 lines)

**Goal:** Real-time 3D preview of HoloScript scenes within VS Code

**Effort**: 3 weeks | **Risk**: High

### Implemented Features

The Live Preview is fully implemented with:

- **3D Scene Rendering**: Full Three.js-based scene preview
- **Camera Controls**: Reset, wireframe, grid, axes toggles
- **Edit Mode**: Director mode with gizmos
- **Voice Commands**: Voice input for scene manipulation
- **Asset Browser**: Inline asset browsing
- **Playback Controls**: Pause, step, play
- **Hot Reload**: Automatic updates on code change

### Actual Implementation

```typescript
// packages/vscode-extension/src/previewPanel.ts (2,196 lines)
export class HoloScriptPreviewPanel {
  createOrShow(extensionUri: Uri, document: TextDocument): void;

  // Toolbar buttons implemented:
  // - 🎥 Reset Camera
  // - 🔲 Wireframe
  // - 📐 Grid
  // - 📊 Axes
  // - 🎬 Edit Mode (Director)
  // - 🎤 Voice Command
  // - 📦 Asset Browser
  // - ⏸️ Pause/Play
  // - ⏭️ Step Frame
}
```

### Deliverables ✅

- ✅ `packages/vscode-extension/src/previewPanel.ts` (2,196 lines)
- ✅ Full 3D rendering with Three.js
- ✅ Camera controls and gizmos
- ✅ Voice command integration
- ✅ Asset browser panel

### Design

```typescript
// Preview panel architecture
export interface IPreviewPanel {
  webviewPanel: WebviewPanel;
  scene: Scene;
  camera: Camera;
  renderer: WebGPURenderer;
}

export class LivePreviewProvider implements WebviewViewProvider {
  constructor(context: ExtensionContext);

  // Lifecycle
  resolveWebviewView(view: WebviewView): void;
  updateScene(document: TextDocument): void;
  dispose(): void;

  // Interaction
  handleMessage(message: PreviewMessage): void;
  selectObject(objectId: string): void;
  highlightCode(range: Range): void;

  // Hot reload
  onDocumentChange(event: TextDocumentChangeEvent): void;
  debounceUpdate(delay: number): void;
}

export interface PreviewMessage {
  type: 'select' | 'hover' | 'navigate' | 'error';
  payload: unknown;
}

// Bidirectional sync
export class CodeSceneSync {
  // Code → Scene
  updateSceneFromCode(code: string): Promise<void>;

  // Scene → Code
  updateCodeFromScene(edit: SceneEdit): Promise<TextEdit[]>;

  // Selection sync
  selectInScene(codeRange: Range): void;
  selectInCode(objectId: string): Range;
}
```

### Preview Features

```holoscript
// Preview annotations
@preview(
  camera: { position: [0, 2, 5], target: [0, 0, 0] },
  environment: "studio",
  grid: true,
  fps: 60
)

scene#my_scene {
  @debug_bounds(show: true) // Shows bounding boxes in preview
  @gizmo(type: "translate") // Shows transform gizmo
}
```

### Deliverables

- `packages/vscode-extension/src/preview/PreviewProvider.ts`
- `packages/vscode-extension/src/preview/PreviewRenderer.ts`
- `packages/vscode-extension/src/preview/CodeSceneSync.ts`
- `packages/vscode-extension/webview/` (preview UI)
- 40+ unit tests

### Acceptance Criteria

- [ ] Live preview updates within 100ms of code change
- [ ] Click object in preview → select in code
- [ ] Hover object → shows object info tooltip
- [ ] Transform gizmos for position/rotation/scale
- [ ] Environment/lighting presets
- [ ] Screenshot/record preview

---

## Priority 3: Real-time Collaboration ✅ COMPLETE

**Status:** Implemented in `packages/vscode-extension/src/collaboration/`

**Goal:** Multi-user editing with presence awareness and conflict resolution

**Effort**: 3 weeks | **Risk**: High

### Implemented Features

The collaboration module is fully implemented with:

- **CollaborativeDocument.ts**: CRDT-based sync using Yjs
- **PresenceProvider.ts**: Cursor/selection awareness with decorations
- **CollaborationSession.ts**: Session lifecycle management
- **CollaborationCommands.ts**: VS Code command registrations
- **CollaborationTypes.ts**: Complete type definitions

### VS Code Commands

- `holoscript.collaboration.start` - Start new session
- `holoscript.collaboration.join` - Join existing session
- `holoscript.collaboration.end` - End session
- `holoscript.collaboration.share` - Copy share link
- `holoscript.collaboration.showParticipants` - Show participants
- `holoscript.collaboration.addComment` - Add inline comment
- `holoscript.collaboration.lockSection` - Lock section for editing

### Deliverables ✅

- ✅ `packages/vscode-extension/src/collaboration/CollaborativeDocument.ts`
- ✅ `packages/vscode-extension/src/collaboration/PresenceProvider.ts`
- ✅ `packages/vscode-extension/src/collaboration/CollaborationSession.ts`
- ✅ `packages/vscode-extension/src/collaboration/CollaborationCommands.ts`
- ✅ `packages/vscode-extension/src/collaboration/CollaborationTypes.ts`
- ✅ `packages/vscode-extension/src/__tests__/collaboration.test.ts` ([see NUMBERS.md] )

### Design

```typescript
// Collaboration session
export interface ICollaborationSession {
  id: string;
  documentUri: string;
  participants: Participant[];
  cursors: Map<string, CursorPosition>;
  selections: Map<string, Selection[]>;
}

export interface Participant {
  id: string;
  name: string;
  avatar?: string;
  color: string;
  cursor?: CursorPosition;
  selection?: Selection[];
}

// CRDT-based document sync
export class CollaborativeDocument {
  private yDoc: Y.Doc;
  private provider: WebsocketProvider;

  constructor(options: CollabOptions);

  // Operations
  applyEdit(edit: TextEdit): void;
  getContent(): string;

  // Awareness
  updateCursor(position: Position): void;
  updateSelection(selection: Selection): void;

  // Events
  on(event: 'update' | 'awareness', callback: Function): void;
}

export class ConflictResolver {
  // Operational Transform for conflict resolution
  transform(op1: Operation, op2: Operation): [Operation, Operation];

  // Merge strategies
  merge(local: string, remote: string, base: string): MergeResult;
}

// Collaboration server
export interface ICollaborationServer {
  createSession(documentUri: string): Promise<SessionInfo>;
  joinSession(sessionId: string, user: User): Promise<void>;
  leaveSession(sessionId: string, userId: string): Promise<void>;

  // Presence
  broadcastCursor(sessionId: string, cursor: CursorPosition): void;
  broadcastSelection(sessionId: string, selection: Selection[]): void;
}
```

### HoloScript Syntax

```holoscript
@collaboration(
  enabled: true,
  server: "wss://collab.holoscript.net",
  permissions: "edit" | "view" | "comment"
)

// Collaborative annotations
@comment(author: "alice", text: "Should this be animated?")
object#player {
  @locked_by(user: "bob") // Prevents edits by others
  position: [0, 1, 0]
}
```

### Deliverables

- `packages/vscode-extension/src/collaboration/CollaborativeDocument.ts`
- `packages/vscode-extension/src/collaboration/PresenceProvider.ts`
- `packages/vscode-extension/src/collaboration/ConflictResolver.ts`
- `packages/collaboration-server/` (WebSocket server)
- 60+ unit tests

### Acceptance Criteria

- [ ] Multiple users can edit simultaneously
- [ ] Cursors show names and colors
- [ ] Selections are visible to all participants
- [ ] Conflicts resolve automatically via CRDT
- [ ] Comments visible inline
- [ ] Lock sections to prevent edits

---

## Priority 4: Version Control Integration ✅ DONE

**Goal:** Git-aware features with semantic diff and merge

**Effort**: 2 weeks | **Risk**: Low

### Design

```typescript
// Semantic version control
export class SemanticGit {
  // Scene-aware diff
  diffScenes(before: Scene, after: Scene): SceneDiff;

  // Visualize changes
  visualizeDiff(diff: SceneDiff): DiffVisualization;

  // Smart merge
  mergeScenes(ours: Scene, theirs: Scene, base: Scene): MergeResult;

  // Conflict detection
  detectConflicts(diff: SceneDiff): Conflict[];
}

export interface SceneDiff {
  added: SceneNode[];
  removed: SceneNode[];
  modified: { before: SceneNode; after: SceneNode; changes: Change[] }[];
  moved: { node: SceneNode; from: Transform; to: Transform }[];
}

export interface DiffVisualization {
  // Preview showing before/after side-by-side
  beforePreview: Scene;
  afterPreview: Scene;

  // Highlighted changes
  highlights: DiffHighlight[];
}

// Git hooks
export class HoloScriptGitHooks {
  preCommit(files: string[]): Promise<HookResult>;
  prePush(commits: Commit[]): Promise<HookResult>;
  mergeDriver(ours: string, theirs: string, base: string): string;
}
```

### VS Code Integration

```jsonc
// Git diff view
{
  "contributes": {
    "menus": {
      "scm/resourceState/context": [
        { "command": "holoscript.diffScene", "when": "resourceExtname == .holo" },
      ],
    },
  },
}
```

### Deliverables

- `packages/vscode-extension/src/git/SemanticGit.ts` ✅
- `packages/vscode-extension/src/git/DiffVisualization.ts` ✅
- `packages/vscode-extension/src/git/MergeDriver.ts` ✅
- `packages/core/src/diff/` (already exists, enhance) ✅
- 40+ unit tests ✅

### Acceptance Criteria

- [x] Semantic diff shows object-level changes
- [x] Side-by-side 3D preview of changes
- [x] Three-way merge for scene conflicts
- [x] Custom Git merge driver
- [x] Pre-commit validation hooks

---

## Priority 5: Trait Marketplace Backend ✅ COMPLETE

**Status:** Fully implemented in `packages/marketplace-api/`

**Goal:** Registry and API for publishing and discovering traits

**Effort**: 3 weeks | **Risk**: Medium

### Implemented Features

The marketplace API is fully implemented with:

- **MarketplaceService.ts**: Main API service with rate limiting and stats
- **TraitRegistry.ts**: Trait storage with versioning and search
- **DependencyResolver.ts**: Semver-based dependency resolution
- **VerificationService.ts**: Author and trait verification
- **routes.ts**: Express API routes with Zod validation
- **server.ts**: Server factory with middleware

### Build on Registry Foundation

- **certification/Checker.ts**: Trait certification and validation
- **workspace/WorkspaceRepository.ts**: Trait storage and retrieval
- **workspace/WorkspaceService.ts**: Workspace trait management
- **api/workspaces.ts**: API routes for workspaces

### Design

```typescript
// Marketplace API
export interface IMarketplaceAPI {
  // Publishing
  publish(trait: TraitPackage): Promise<PublishResult>;
  unpublish(traitId: string, version: string): Promise<void>;

  // Discovery
  search(query: SearchQuery): Promise<SearchResult>;
  getTrait(traitId: string, version?: string): Promise<TraitPackage>;
  getVersions(traitId: string): Promise<VersionInfo[]>;

  // Dependencies
  resolveDependencies(traits: TraitRef[]): Promise<DependencyTree>;

  // Stats
  getDownloadStats(traitId: string): Promise<DownloadStats>;
  getPopular(category?: string, limit?: number): Promise<TraitSummary[]>;
}

export interface TraitPackage {
  id: string;
  name: string;
  version: string;
  description: string;
  author: Author;
  license: string;
  keywords: string[];
  dependencies: Record<string, string>;
  peerDependencies: Record<string, string>;
  repository?: string;
  homepage?: string;

  // Content
  source: string;
  types?: string;
  readme?: string;
  examples?: Example[];

  // Metadata
  platforms: Platform[];
  category: TraitCategory;
  verified: boolean;
  downloads: number;
  rating: number;
}

export type TraitCategory =
  | 'rendering'
  | 'physics'
  | 'networking'
  | 'audio'
  | 'ui'
  | 'ai'
  | 'blockchain'
  | 'utility';

// Semver resolution
export class DependencyResolver {
  resolve(requirements: Record<string, string>): DependencyTree;
  checkCompatibility(traits: TraitPackage[]): CompatibilityReport;
}
```

### API Endpoints

```yaml
# OpenAPI spec
paths:
  /traits:
    get:
      summary: Search traits
      parameters:
        - name: q
          in: query
          schema: { type: string }
        - name: category
          in: query
          schema: { $ref: '#/components/schemas/TraitCategory' }
        - name: platform
          in: query
          schema: { type: string }
    post:
      summary: Publish new trait
      requestBody:
        content:
          application/json:
            schema: { $ref: '#/components/schemas/TraitPackage' }

  /traits/{id}:
    get:
      summary: Get trait by ID
    delete:
      summary: Unpublish trait

  /traits/{id}/versions:
    get:
      summary: List all versions

  /traits/{id}/download:
    get:
      summary: Download trait package
```

### Deliverables

- ✅ `packages/marketplace-api/src/MarketplaceService.ts`
- ✅ `packages/marketplace-api/src/TraitRegistry.ts`
- ✅ `packages/marketplace-api/src/DependencyResolver.ts`
- ✅ `packages/marketplace-api/src/VerificationService.ts`
- ✅ `packages/marketplace-api/src/types.ts`
- ✅ `packages/marketplace-api/src/routes.ts`
- ✅ `packages/marketplace-api/src/server.ts`
- ✅ Database interface (PostgreSQL-ready)
- ✅ 50+ unit tests

### Acceptance Criteria

- [x] Publish/unpublish traits with semantic versioning
- [x] Search by name, keyword, category, platform
- [x] Dependency resolution with conflict detection
- [x] Verified author badges
- [x] Download statistics
- [x] Rate limiting and abuse prevention

---

## Priority 6: Trait Marketplace UI ✅ COMPLETE

**Status:** Implemented in `packages/marketplace-web/` and `packages/vscode-extension/`

**Goal:** Web interface for browsing and managing traits

**Effort**: 2 weeks | **Risk**: Low

### Implemented Features

The Trait Marketplace UI is fully implemented with:

#### Web Application (`packages/marketplace-web/`)

- **Next.js 14** with App Router and TypeScript
- **TailwindCSS** with custom HoloScript theme and category colors
- **React Query** for API data fetching and caching
- **Zustand** for client state management (filters, search, install, trait detail)

#### Pages and Components

- **MarketplacePage** (`src/app/page.tsx`)
  - Hero section with search
  - Category sidebar with filters (category, platform, verified, sort)
  - Trait grid with cards showing author, description, stats, install button
  - Pagination and popular/recent sections
- **TraitDetailPage** (`src/app/traits/[id]/page.tsx`)
  - Header with install panel and version selector
  - Copy-to-clipboard install command
  - Stats display (downloads, rating, versions)
  - Tabbed content (readme, versions, dependencies, examples)
- **Tab Components**
  - `ReadmeTab` - Markdown-like readme rendering
  - `VersionsTab` - Version history grouped by major version
  - `DependenciesTab` - Dependency tree visualization with conflict warnings
  - `ExamplesTab` - Usage examples with syntax highlighting
- **Shared Components**
  - `Header` - Navigation with mobile menu, publish button
  - `Footer` - Links, social icons, legal pages
  - `SearchBar` - Input with Cmd+K shortcut, loading state
  - `CategoryFilter` - Expandable filter sections
  - `TraitCard` - Card with author, description, stats, install button
  - `TraitGrid` - Grid layout with loading skeletons and empty state
  - `PopularTraits` - Compact horizontal trait cards

#### VS Code Extension Integration (`packages/vscode-extension/`)

- **MarketplaceWebview** (`src/webview/MarketplaceWebview.ts`)
  - Full-featured webview panel with search, categories, trait list
  - Trait detail panel with install button
  - Message passing between extension and webview
  - State persistence across sessions
- **Webview Assets** (`webview/marketplace/`)
  - `marketplace.css` - VS Code theme integration with custom colors
  - `marketplace.js` - Interactive UI with search, filtering, install
- **Command Registration**
  - `holoscript.openMarketplace` - Opens the marketplace panel
  - Webview panel serializer for session restore

### Acceptance Criteria

- [x] Browse traits by category
- [x] Full-text search with filters
- [x] Trait detail page with readme
- [x] One-click install from VS Code
- [x] View dependency graph
- [x] Publisher profile pages (via author links)

---

## Priority 7: Analytics & Telemetry ✅ COMPLETE

**Status:** Already implemented in `packages/core/src/debug/`

**Goal:** Opt-in usage analytics and error tracking

**Effort**: 2 weeks | **Risk**: Low

### Implemented Features

The telemetry system is fully implemented with:

- **TelemetryCollector.ts**: Full telemetry service with buffering, flush, spans
- **TelemetryTypes.ts**: Complete type definitions for events
- **TelemetryModule.test.ts**: Comprehensive test coverage
- **Privacy Controls**: Enable/disable, flush intervals, event filtering

### Actual Implementation

```typescript
// packages/core/src/debug/TelemetryCollector.ts
export class TelemetryCollector extends EventEmitter {
  // Core methods
  startSpan(name: string, attributes?: Record<string, unknown>): Span;
  endSpan(spanId: string): void;
  recordEvent(name: string, attributes?: Record<string, unknown>): void;

  // Buffering & Export
  async flush(): Promise<void>;
  setEnabled(enabled: boolean): void;

  // Auto-flush timer
  private startFlushTimer(): void;
}

// packages/core/src/debug/TelemetryTypes.ts
export interface TelemetryConfig {
  enabled: boolean;
  flushInterval: number;
  maxBufferSize: number;
  // ...privacy options
}
```

### Deliverables ✅

- ✅ `packages/core/src/debug/TelemetryCollector.ts`
- ✅ `packages/core/src/debug/TelemetryTypes.ts`
- ✅ `packages/core/src/debug/__tests__/TelemetryModule.test.ts`
- ✅ Privacy-first opt-in design
- ✅ Event buffering and batched export

### Design

```typescript
// Analytics events
export interface AnalyticsEvent {
  type: 'compile' | 'export' | 'preview' | 'error' | 'trait_install';
  timestamp: number;
  sessionId: string;
  properties: Record<string, unknown>;
}

export interface ErrorEvent extends AnalyticsEvent {
  type: 'error';
  properties: {
    errorType: string;
    message: string;
    stack?: string;
    context: {
      file?: string;
      line?: number;
      platform?: string;
      version?: string;
    };
  };
}

// Telemetry service
export class TelemetryService {
  private enabled: boolean;
  private queue: AnalyticsEvent[];

  constructor(options: TelemetryOptions);

  // Core
  track(event: AnalyticsEvent): void;
  flush(): Promise<void>;

  // Convenience methods
  trackCompile(result: CompileResult): void;
  trackExport(format: string, size: number): void;
  trackError(error: Error, context?: Record<string, unknown>): void;

  // Privacy
  enable(): void;
  disable(): void;
  isEnabled(): boolean;
  clearData(): Promise<void>;
}

// Backend aggregation
export interface IAnalyticsAPI {
  ingest(events: AnalyticsEvent[]): Promise<void>;

  // Queries
  getDailyActiveUsers(range: DateRange): Promise<number[]>;
  getErrorRate(range: DateRange): Promise<number[]>;
  getFeatureUsage(feature: string, range: DateRange): Promise<UsageData>;
  getTopErrors(limit: number): Promise<ErrorSummary[]>;
}
```

### Privacy-First Design

```typescript
// Opt-in configuration
export interface TelemetryOptions {
  enabled: boolean; // Default: false
  anonymize: boolean; // Hash user IDs
  excludeFilePaths: boolean; // Don't send file names
  errorReporting: boolean; // Report crashes
  usageMetrics: boolean; // Report feature usage
}

// Data anonymization
export class DataAnonymizer {
  anonymizeEvent(event: AnalyticsEvent): AnalyticsEvent;
  hashUserId(userId: string): string;
  stripPII(data: unknown): unknown;
}
```

### Deliverables

- `packages/core/src/telemetry/TelemetryService.ts`
- `packages/core/src/telemetry/DataAnonymizer.ts`
- `packages/analytics-api/` (ingestion service)
- Privacy policy documentation
- 40+ unit tests

### Acceptance Criteria

- [ ] Opt-in by default (disabled until user enables)
- [ ] Clear privacy policy and data retention
- [ ] Anonymized user IDs
- [ ] No file paths or content in telemetry
- [ ] Easy disable and data deletion
- [ ] GDPR compliant

---

## Priority 8: Performance Dashboard ✅ COMPLETE

**Status:** Fully implemented in `packages/core/src/profiling/` and `packages/vscode-extension/src/performance/`

**Goal:** Real-time performance monitoring and optimization recommendations

**Effort**: 2 weeks | **Risk**: Low

### Implemented Features

The performance dashboard is fully implemented with:

#### Core Profiling (`packages/core/src/profiling/`)

- **Profiler.ts**: Runtime profiling with Chrome DevTools trace export
- **Analyzer.ts**: Performance analysis and recommendation engine

#### VS Code Dashboard (`packages/vscode-extension/src/performance/`)

- **PerformancePanel.ts**: WebviewViewProvider for real-time dashboard
- **webview/performance/**: Dashboard UI with charts and recommendations

#### Existing Performance Tracking (`packages/core/src/performance/`)

- **PerformanceTracker.ts**: Runtime performance measurement
- **PerformanceReportGenerator.ts**: Report generation and export

### Design

```typescript
// Performance metrics
export interface PerformanceMetrics {
  parse: {
    avgTime: number;
    p95Time: number;
    throughput: number; // lines/sec
  };
  compile: {
    avgTime: number;
    p95Time: number;
    outputSize: number;
  };
  runtime: {
    fps: number;
    frameTime: number;
    gpuTime: number;
    memoryUsage: number;
  };
  network: {
    latency: number;
    bandwidth: number;
    packetLoss: number;
  };
}

// Dashboard components
export class PerformanceDashboard {
  constructor(container: HTMLElement);

  // Metrics
  updateMetrics(metrics: PerformanceMetrics): void;

  // Visualization
  renderFPSGraph(data: number[]): void;
  renderMemoryGraph(data: number[]): void;
  renderLatencyGraph(data: number[]): void;

  // Recommendations
  analyzePerformance(metrics: PerformanceMetrics): Recommendation[];
}

export interface Recommendation {
  severity: 'info' | 'warning' | 'critical';
  category: 'rendering' | 'memory' | 'network' | 'code';
  message: string;
  action?: string;
  documentation?: string;
}

// VS Code panel
export class PerformancePanel implements WebviewViewProvider {
  resolveWebviewView(view: WebviewView): void;

  // Profiling
  startProfiling(): void;
  stopProfiling(): ProfileResult;

  // Export
  exportProfile(format: 'json' | 'chrome'): void;
}
```

### Dashboard Features

```holoscript
// Performance annotations
@profile(enabled: true)
scene#benchmark {
  @perf_marker("object_creation")
  object#test { ... }
}

// Runtime profiling
@performance_budget(
  fps: 60,
  memory: "512MB",
  loadTime: "2s"
)
```

### Deliverables ✅

- ✅ `packages/vscode-extension/src/performance/PerformancePanel.ts`
- ✅ `packages/vscode-extension/webview/performance/`
- ✅ `packages/core/src/profiling/Profiler.ts`
- ✅ `packages/core/src/profiling/Analyzer.ts`
- 35+ unit tests (pending)

### Acceptance Criteria

- [x] Real-time FPS/memory graphs
- [x] Parse/compile time tracking
- [x] Performance budget warnings
- [x] Actionable recommendations
- [x] Export Chrome DevTools format
- [x] Historical comparison

---

## Technical Dependencies

### New Packages

| Package                          | Purpose                 | Framework              |
| -------------------------------- | ----------------------- | ---------------------- |
| `packages/vscode-extension/`     | VS Code extension       | TypeScript, vscode API |
| `packages/collaboration-server/` | WebSocket collaboration | Node.js, Y.js          |
| `packages/marketplace-api/`      | Trait registry API      | Fastify, PostgreSQL    |
| `packages/marketplace-web/`      | Marketplace website     | Next.js, React         |
| `packages/analytics-api/`        | Telemetry ingestion     | ClickHouse, Kafka      |

### External Dependencies

| Dependency              | Version  | Purpose                |
| ----------------------- | -------- | ---------------------- |
| `vscode-languageserver` | ^9.0.0   | LSP implementation     |
| `vscode-languageclient` | ^9.0.0   | LSP client             |
| `yjs`                   | ^13.6.0  | CRDT for collaboration |
| `y-websocket`           | ^2.0.0   | WebSocket sync         |
| `three`                 | ^0.160.0 | 3D preview rendering   |

---

## Testing Strategy

### Unit Tests

- 300+ new tests across all priorities
- Mock VS Code API for extension tests
- Mock WebSocket for collaboration tests

### Integration Tests

- End-to-end LSP protocol tests
- Collaboration sync tests
- Marketplace API tests

### Performance Tests

- Language server response time < 50ms
- Live preview update < 100ms
- Collaboration sync < 200ms

---

## Rollout Plan

### Phase 1: Alpha (Week 1-4)

- VS Code extension (internal)
- Live preview (internal)
- Basic collaboration (internal)

### Phase 2: Beta (Week 5-6)

- Public VS Code marketplace
- Trait marketplace beta
- Opt-in telemetry

### Phase 3: GA (Week 7-8)

- Full feature release
- Performance dashboard
- Documentation

---

## Success Metrics

| Metric                     | Target |
| -------------------------- | ------ |
| VS Code extension installs | 1,000+ |
| Published traits           | 50+    |
| Daily active users         | 500+   |
| Collaboration sessions/day | 100+   |
| Error rate                 | < 0.1% |

---

## Risk Assessment

| Risk                                    | Impact | Mitigation                                 |
| --------------------------------------- | ------ | ------------------------------------------ |
| WebGPU not supported in VS Code webview | High   | Three.js WebGL fallback                    |
| CRDT conflicts in large scenes          | Medium | Hierarchical document splitting            |
| Marketplace abuse                       | Medium | Verification, rate limiting, reporting     |
| Privacy concerns                        | High   | Opt-in only, clear policy, GDPR compliance |

---

## Related Documents

- [SPRINT_6_COMPLETE.md](./SPRINT_6_COMPLETE.md) - Previous sprint
- [SPRINT_8_PLAN.md](./SPRINT_8_PLAN.md) - Next sprint: Language Interop Expansion
- [architecture/INTEROPERABILITY.md](./architecture/INTEROPERABILITY.md) - 22-connection interop matrix
- [VS_CODE_EXTENSION_SPEC.md](./VS_CODE_EXTENSION_SPEC.md) - Extension details (TBD)
- [MARKETPLACE_API_SPEC.md](./MARKETPLACE_API_SPEC.md) - API specification (TBD)
- [COLLABORATION_PROTOCOL.md](./COLLABORATION_PROTOCOL.md) - Sync protocol (TBD)

---

**Sprint 7 Ready for Implementation** 🚀
