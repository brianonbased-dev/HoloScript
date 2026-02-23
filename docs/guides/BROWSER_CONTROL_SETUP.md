# Setting Up Browser Control - Quick Start

**Goal**: Connect AI agents to the local HoloScript MCP server to test browser control

---

## Prerequisites

✅ HoloScript MCP server built (you did this - `pnpm build` succeeded)
✅ Playwright installed (you did this - it's in package.json)
⏳ Connect MCP client to local server (do this now)

---

## Step 1: Backup Your Current Config

```bash
cp ~/.mcp/config.json ~/.mcp/config.backup-$(date +%Y%m%d).json
```

---

## Step 2: Option A - Temporary Local Config (Recommended for Testing)

**Replace** `~/.mcp/config.json` with the new config:

```bash
cp ~/.mcp/config-with-local-holoscript.json ~/.mcp/config.json
```

This changes:
- `holoscript` (Railway remote) → `holoscript-local` (local with browser tools)
- All other servers stay the same

---

## Step 3: Restart Your IDE

**Claude Code / Cursor / VSCode**:
1. Close IDE completely
2. Reopen
3. MCP servers will reconnect automatically

**Verify connection**:
```
You (in chat): "List available MCP tools"

AI should show: browser_launch, browser_execute, browser_screenshot
```

---

## Step 4: Test Browser Control

### Test 1: Launch Scene

```
You: "Launch examples/hello-world.hs in browser"

Expected:
- Browser opens automatically (Chrome)
- Shows 3D cyan cube
- AI reports session ID
```

### Test 2: Inspect Scene

```
You: "How many objects are in the scene?"

Expected:
AI uses browser_execute to count objects
Reports: "1 object (hello_cube)"
```

### Test 3: Screenshot

```
You: "Take a screenshot"

Expected:
AI uses browser_screenshot
Saves to screenshots/ folder
```

---

## Option B: Project-Specific Config (For HoloScript Work)

If you only want browser control when working in HoloScript project:

Edit: `C:/Users/josep/Documents/GitHub/HoloScript/.vscode/mcp.json`

```json
{
  "$schema": "https://modelcontextprotocol.io/schemas/mcp-config.json",
  "mcpServers": {
    "holoscript-local": {
      "command": "node",
      "args": ["dist/index.js"],
      "cwd": "C:/Users/josep/Documents/GitHub/HoloScript/packages/mcp-server",
      "description": "HoloScript with browser control (37 tools)"
    }
  }
}
```

This only activates when you open the HoloScript folder in VSCode.

---

## Troubleshooting

### "Server not found" error

**Fix**: Build the server first
```bash
cd C:/Users/josep/Documents/GitHub/HoloScript/packages/mcp-server
pnpm build
```

### "Browser won't launch"

**Fix**: Install Playwright browsers
```bash
cd C:/Users/josep/Documents/GitHub/HoloScript/packages/mcp-server
npx playwright install chromium
```

### "Tools not showing"

**Fix**: Check server logs
1. Open MCP server panel in IDE
2. Look for "holoscript-local"
3. Check for errors

**Common issue**: Node version
- Requires: Node 18+
- Check: `node --version`

---

## Reverting to Remote Server

When done testing, restore Railway config:

```bash
cp ~/.mcp/config.backup-YYYYMMDD.json ~/.mcp/config.json
```

Or manually change `holoscript-local` back to `holoscript` with Railway URL.

---

## Deploying to Railway (After Testing)

Once browser control is tested locally, deploy to Railway:

1. Commit changes:
   ```bash
   cd C:/Users/josep/Documents/GitHub/HoloScript
   git add packages/mcp-server/
   git commit -m "Add browser control tools (launch, execute, screenshot)"
   ```

2. Push to Railway (auto-deploys)
   ```bash
   git push origin main
   ```

3. Update global config back to Railway URL
   ```bash
   cp ~/.mcp/config.backup-YYYYMMDD.json ~/.mcp/config.json
   ```

4. Restart IDE

Now browser control works from anywhere (not just local).

---

## Quick Reference

**Config file**: `~/.mcp/config.json`
**Local server**: `C:/Users/josep/Documents/GitHub/HoloScript/packages/mcp-server`
**Verify build**: `ls C:/Users/josep/Documents/GitHub/HoloScript/packages/mcp-server/dist`
**Test command**: "Launch examples/hello-world.hs in browser"

---

**Next Steps**: Try Test 1 (launch scene) to verify everything works!
