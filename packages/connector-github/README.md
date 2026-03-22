# @holoscript/connector-github

GitHub MCP Connector for HoloScript Studio Integration Hub.

## Overview

`@holoscript/connector-github` bridges HoloScript Studio to GitHub's REST API, providing MCP tools for repository management, issue tracking, pull request workflows, GitHub Actions automation, and HoloScript-specific CI/CD operations.

## Features

- **Repository Operations**: Create, list, and get repository information
- **Issue Management**: Create, update, comment on issues
- **Pull Request Workflows**: Create, merge, review, and comment on PRs
- **GitHub Actions**: List, trigger, and monitor workflow runs
- **Content Operations**: Read and write files in repositories
- **HoloScript CI/CD**: Compile previews and validate scenes automatically
- **GitHub Agentic Workflows**: AI-powered scene validation and optimization

## Installation

```bash
pnpm add @holoscript/connector-github
```

## Usage

### Basic Connection

```typescript
import { GitHubConnector } from '@holoscript/connector-github';

// Set GITHUB_TOKEN environment variable
process.env.GITHUB_TOKEN = 'ghp_...';

const connector = new GitHubConnector();
await connector.connect();

// Check health
const healthy = await connector.health();

// List available tools
const tools = await connector.listTools();
```

### Repository Operations

```typescript
// Get repository info
await connector.executeTool('github_repo_get', {
  owner: 'holoscript',
  repo: 'holoscript'
});

// Create repository
await connector.executeTool('github_repo_create', {
  name: 'my-holoscript-project',
  description: 'A HoloScript VR experience',
  private: false,
  auto_init: true
});

// List repositories
await connector.executeTool('github_repo_list', {
  type: 'owner',
  sort: 'updated'
});
```

### Issue Management

```typescript
// Create issue
await connector.executeTool('github_issue_create', {
  owner: 'holoscript',
  repo: 'holoscript',
  title: 'Bug: Trait not rendering',
  body: 'The @holographic_sprite trait is not rendering correctly...',
  labels: ['bug', 'trait'],
  assignees: ['username']
});

// Add comment
await connector.executeTool('github_issue_comment', {
  owner: 'holoscript',
  repo: 'holoscript',
  issue_number: 123,
  body: 'Fixed in PR #456'
});
```

### Pull Request Workflows

```typescript
// Create PR
await connector.executeTool('github_pr_create', {
  owner: 'holoscript',
  repo: 'holoscript',
  title: 'Add holographic water effect',
  body: 'Implements @volumetric_water trait with GPU particle simulation',
  head: 'feature/water-effect',
  base: 'main',
  draft: false
});

// Add PR comment
await connector.executeTool('github_pr_comment', {
  owner: 'holoscript',
  repo: 'holoscript',
  pull_number: 456,
  body: '## Preview\n[View 3D Preview](https://preview.holoscript.net/pr-456)'
});

// Review PR
await connector.executeTool('github_pr_review', {
  owner: 'holoscript',
  repo: 'holoscript',
  pull_number: 456,
  body: 'LGTM! Great work on the water simulation.',
  event: 'APPROVE'
});

// Merge PR
await connector.executeTool('github_pr_merge', {
  owner: 'holoscript',
  repo: 'holoscript',
  pull_number: 456,
  merge_method: 'squash'
});
```

### GitHub Actions Automation

```typescript
// List workflows
await connector.executeTool('github_workflow_list', {
  owner: 'holoscript',
  repo: 'holoscript'
});

// Trigger workflow
await connector.executeTool('github_workflow_run', {
  owner: 'holoscript',
  repo: 'holoscript',
  workflow_id: 'holoscript-ci.yml',
  ref: 'main',
  inputs: {
    environment: 'production',
    target: 'r3f'
  }
});

// List workflow runs
await connector.executeTool('github_workflow_runs_list', {
  owner: 'holoscript',
  repo: 'holoscript',
  status: 'completed'
});
```

### HoloScript-Specific Operations

```typescript
// Compile HoloScript files and generate preview links
const result = await connector.executeTool('github_holoscript_compile_preview', {
  owner: 'holoscript',
  repo: 'my-vr-gallery',
  ref: 'main',
  files: ['scenes/main.holo', 'components/gallery.holo']
});

console.log(result);
// {
//   ref: 'main',
//   files: [
//     { file: 'scenes/main.holo', success: true, previewUrl: 'https://...' },
//     { file: 'components/gallery.holo', success: true, previewUrl: 'https://...' }
//   ],
//   summary: { total: 2, successful: 2, failed: 0 }
// }

// Validate HoloScript scenes
const validation = await connector.executeTool('github_holoscript_validate_scene', {
  owner: 'holoscript',
  repo: 'my-vr-gallery',
  ref: 'feature/new-scene'
});

console.log(validation);
// {
//   ref: 'feature/new-scene',
//   files: [
//     { file: 'scenes/main.holo', valid: true, errors: [], warnings: [] }
//   ],
//   summary: { total: 1, valid: 1, invalid: 0, totalErrors: 0, totalWarnings: 0 }
// }
```

## GitHub Actions CI/CD

The connector includes a comprehensive GitHub Actions workflow template for automating HoloScript compilation, validation, and deployment.

### Setup

1. Copy the workflow template to your repository:

```bash
cp node_modules/@holoscript/connector-github/templates/.github/workflows/holoscript-ci.yml .github/workflows/
```

2. Configure secrets in your GitHub repository settings:
   - `GITHUB_TOKEN` (automatically provided)
   - `MCP_API_KEY` (for HoloScript MCP access)
   - `ANTHROPIC_API_KEY` (for AI-powered validation)
   - `RAILWAY_TOKEN` (optional, for preview deployments)

### Workflow Features

The `holoscript-ci.yml` workflow provides:

1. **Validation Job**
   - Validates syntax of all `.holo`, `.hs`, `.hsplus` files
   - Runs embedded `@test` blocks

2. **Compile & Preview Job** (PRs only)
   - Compiles changed files to Three.js
   - Generates preview links via HoloScript MCP
   - Posts preview links as PR comments

3. **Quality Check Job**
   - Runs quality analysis on all files
   - Generates trait suggestions using Brittney AI
   - Uploads suggestions as artifacts

4. **Deploy Preview Job** (non-draft PRs)
   - Packages compiled scenes
   - Deploys to preview environment
   - Links preview URL to PR

5. **Agentic Validation Job** (PRs only)
   - AI-powered scene validation using Claude
   - Semantic analysis of scene composition
   - Performance and optimization suggestions
   - Posts validation report as PR comment

### Example PR Comment

When a PR is opened, the workflow automatically posts:

```markdown
## 🎨 HoloScript Preview Links

- [scenes/main.holo](https://preview.holoscript.net/abc123)
- [components/gallery.holo](https://preview.holoscript.net/def456)

---
*Generated by [HoloScript CI/CD](https://github.com/holoscript/holoscript)*

## 🤖 AI-Powered Scene Validation

### scenes/main.holo
```json
{
  "valid": true,
  "warnings": [
    "Consider adding @spatial_audio trait to ambient_sound object"
  ],
  "suggestions": [
    "Use @holographic_sprite for improved performance",
    "Add @occlusion_culling to reduce overdraw"
  ]
}
```

---
*Powered by [HoloScript MCP](https://mcp.holoscript.net) & [Claude](https://claude.ai)*
```

## GitHub Agentic Workflows

The connector supports GitHub's Agentic Workflow integration for advanced automation:

### Use Cases

1. **Automated Scene Optimization**
   - AI analyzes scene complexity and suggests trait optimizations
   - Automatically applies performance improvements
   - Opens PR with optimized scenes

2. **Trait Recommendation Engine**
   - Scans existing scenes and identifies missing traits
   - Suggests semantic enhancements (lighting, audio, interactions)
   - Generates upgrade PRs

3. **Cross-Reality Compatibility**
   - Validates scenes across multiple export targets
   - Identifies platform-specific issues
   - Suggests fallback implementations

4. **Semantic Scene Understanding**
   - Analyzes spatial relationships between objects
   - Suggests physics constraints and collision meshes
   - Recommends accessibility improvements

### Configuration

Enable agentic workflows by adding to `.github/workflows/holoscript-agentic.yml`:

```yaml
name: HoloScript Agentic Workflows

on:
  schedule:
    - cron: '0 0 * * 0' # Weekly
  workflow_dispatch:

jobs:
  optimize-scenes:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
      - name: Run agentic optimizer
        uses: holoscript/agentic-optimizer-action@v1
        with:
          mcp-api-key: ${{ secrets.MCP_API_KEY }}
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          mode: 'optimize'
          auto-pr: true
```

## Environment Variables

- `GITHUB_TOKEN` - GitHub personal access token (required)
- `MCP_API_KEY` - HoloScript MCP orchestrator API key (optional, for enhanced features)
- `ANTHROPIC_API_KEY` - Anthropic API key (optional, for agentic validation)

## MCP Registration

The connector automatically registers with the HoloScript MCP orchestrator at `https://mcp-orchestrator-production-45f9.up.railway.app` when connected.

Registered as: `holoscript-github`

## API Reference

### Tools

See [tools.ts](./src/tools.ts) for the complete list of 23 MCP tools.

### GitHubConnector

**Methods:**
- `connect(): Promise<void>` - Authenticate and connect to GitHub
- `disconnect(): Promise<void>` - Disconnect and cleanup
- `health(): Promise<boolean>` - Check connection health
- `listTools(): Promise<Tool[]>` - List available MCP tools
- `executeTool(name: string, args: object): Promise<unknown>` - Execute an MCP tool

## Examples

### Automated PR Workflow

```typescript
import { GitHubConnector } from '@holoscript/connector-github';

const connector = new GitHubConnector();
await connector.connect();

// Create feature branch
const branch = 'feature/new-hologram';

// Compile and validate locally
const validation = await connector.executeTool('github_holoscript_validate_scene', {
  owner: 'myorg',
  repo: 'myproject',
  ref: branch
});

if (validation.summary.valid === validation.summary.total) {
  // Create PR
  const pr = await connector.executeTool('github_pr_create', {
    owner: 'myorg',
    repo: 'myproject',
    title: 'Add new holographic water effect',
    head: branch,
    base: 'main'
  });

  // Add preview comment
  const preview = await connector.executeTool('github_holoscript_compile_preview', {
    owner: 'myorg',
    repo: 'myproject',
    ref: branch
  });

  await connector.executeTool('github_pr_comment', {
    owner: 'myorg',
    repo: 'myproject',
    pull_number: pr.data.number,
    body: `Preview: ${preview.files[0].previewUrl}`
  });
}
```

## License

MIT

## Related Packages

- `@holoscript/connector-core` - Base connector interfaces
- `@holoscript/connector-railway` - Railway deployment connector
- `@holoscript/mcp-server` - HoloScript MCP server
- `@holoscript/cli` - HoloScript command-line tools
