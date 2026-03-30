# Quick Start Guide

Get started with `@holoscript/connector-github` in under 5 minutes.

## 1. Installation

```bash
cd your-holoscript-project
pnpm add @holoscript/connector-github
```

## 2. Authentication

Create a GitHub Personal Access Token:

1. Go to https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Select scopes:
   - `repo` (full control of private repositories)
   - `workflow` (update GitHub Action workflows)
   - `write:packages` (if using GitHub Packages)
4. Generate and copy the token

Set the token as an environment variable:

```bash
# Linux/Mac
export GITHUB_TOKEN="ghp_your_token_here"

# Windows (PowerShell)
$env:GITHUB_TOKEN="ghp_your_token_here"

# Windows (CMD)
set GITHUB_TOKEN=ghp_your_token_here
```

## 3. Basic Usage

Create a file `test-github.ts`:

```typescript
import { GitHubConnector } from '@holoscript/connector-github';

async function main() {
  // Create and connect
  const connector = new GitHubConnector();
  await connector.connect();
  console.log('✅ Connected to GitHub');

  // List your repositories
  const repos = (await connector.executeTool('github_repo_list', {
    type: 'owner',
    sort: 'updated',
    per_page: 5,
  })) as any;

  console.log('Your recent repositories:');
  for (const repo of repos.data) {
    console.log(`  - ${repo.name} (${repo.visibility})`);
  }

  // Cleanup
  await connector.disconnect();
}

main().catch(console.error);
```

Run it:

```bash
npx tsx test-github.ts
```

## 4. Add to Existing HoloScript Project

### Setup CI/CD

Copy the workflow template to your repository:

```bash
# From your project root
cp node_modules/@holoscript/connector-github/templates/.github/workflows/holoscript-ci.yml .github/workflows/

# Optional: Add agentic workflow
cp node_modules/@holoscript/connector-github/templates/.github/workflows/holoscript-agentic.yml .github/workflows/
```

### Configure Secrets

In your GitHub repository:

1. Go to Settings → Secrets and variables → Actions
2. Add the following secrets:
   - `GITHUB_TOKEN` - Automatically provided by GitHub Actions
   - `MCP_API_KEY` - Your HoloScript MCP orchestrator key (optional)
   - `ANTHROPIC_API_KEY` - For AI-powered validation (optional)

### Push and Test

```bash
git add .github/workflows/holoscript-ci.yml
git commit -m "Add HoloScript CI/CD"
git push
```

The workflow will now:

- ✅ Validate all `.holo`, `.hs`, `.hsplus` files on push
- ✅ Generate 3D previews for PRs
- ✅ Run AI-powered scene analysis
- ✅ Post results as PR comments

## 5. Common Tasks

### Create a Pull Request

```typescript
const pr = (await connector.executeTool('github_pr_create', {
  owner: 'your-username',
  repo: 'your-repo',
  title: 'Add new holographic scene',
  head: 'feature/new-scene',
  base: 'main',
  body: 'This PR adds a new water reflection scene.',
})) as any;

console.log(`PR created: #${pr.data.number}`);
```

### Validate HoloScript Files

```typescript
const validation = (await connector.executeTool('github_holoscript_validate_scene', {
  owner: 'your-username',
  repo: 'your-repo',
  ref: 'main',
})) as any;

console.log(`Valid: ${validation.summary.valid}/${validation.summary.total}`);
```

### Compile and Preview

```typescript
const preview = (await connector.executeTool('github_holoscript_compile_preview', {
  owner: 'your-username',
  repo: 'your-repo',
  ref: 'main',
  files: ['scenes/gallery.holo'],
})) as any;

if (preview.files[0]?.previewUrl) {
  console.log('Preview:', preview.files[0].previewUrl);
}
```

## 6. Integration with HoloScript CLI

Combine with HoloScript CLI for local-first workflow:

```typescript
import { GitHubConnector } from '@holoscript/connector-github';
import { execSync } from 'child_process';

async function compileAndPush(sceneFile: string) {
  // 1. Compile locally
  execSync(`hs compile ${sceneFile} --target r3f -o dist/`);
  console.log('✅ Compiled locally');

  // 2. Commit to GitHub
  const connector = new GitHubConnector();
  await connector.connect();

  const content = await fs.promises.readFile('dist/scene.html', 'utf-8');

  await connector.executeTool('github_content_create_or_update', {
    owner: 'your-username',
    repo: 'your-repo',
    path: 'dist/scene.html',
    message: 'Update compiled scene',
    content,
  });

  console.log('✅ Pushed to GitHub');
  await connector.disconnect();
}
```

## 7. Troubleshooting

### "GITHUB_TOKEN is required"

- Ensure `GITHUB_TOKEN` environment variable is set
- Check token has necessary scopes

### "Rate limit exceeded"

- GitHub API limits: 5000 requests/hour (authenticated)
- Use conditional workflows to reduce API calls
- Consider caching results

### "Unknown tool" error

- Ensure you're using the correct tool name (see [README.md](./README.md#tools))
- Check connector is connected: `await connector.connect()`

### Workflow not triggering

- Check workflow file is in `.github/workflows/`
- Ensure correct YAML syntax
- Verify event triggers match your use case

## Next Steps

- 📖 Read the [full documentation](./README.md)
- 🚀 Explore [advanced examples](./EXAMPLES.md)
- 🔧 Check the [changelog](./CHANGELOG.md) for latest features
- 💬 Join the [HoloScript Discord](https://discord.gg/holoscript)

---

**Need help?** Open an issue at https://github.com/holoscript/holoscript/issues
