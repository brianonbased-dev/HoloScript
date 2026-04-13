# Troubleshooting Guide

**Common issues and solutions for HoloScript Studio orchestration**

This guide covers common problems you might encounter when working with orchestration panels, workflows, behavior trees, and MCP integration. Follow the troubleshooting steps to quickly resolve issues.

---

## Table of Contents

- [Panel Issues](#panel-issues)
- [MCP Connection Issues](#mcp-connection-issues)
- [Auto-Save and Persistence Issues](#auto-save-and-persistence-issues)
- [Export Issues](#export-issues)
- [Performance Issues](#performance-issues)
- [Keyboard Shortcut Issues](#keyboard-shortcut-issues)
- [Error Boundary Issues](#error-boundary-issues)
- [Workflow Execution Issues](#workflow-execution-issues)
- [Behavior Tree Issues](#behavior-tree-issues)
- [General Debugging](#general-debugging)

---

## Panel Issues

### Panel Won't Open

**Symptom:** Keyboard shortcut or button click doesn't open panel

**Possible Causes:**

1. Error boundary has caught an exception
2. React component failed to mount
3. JavaScript error in console
4. Browser localStorage full

**Solutions:**

**Step 1:** Check browser console (F12) for errors

```javascript
// Look for errors like:
Error: Failed to mount component
ReferenceError: X is not defined
```

**Step 2:** Clear localStorage and refresh

```javascript
// In browser console:
localStorage.clear();
location.reload();
```

**Step 3:** Check error boundary state

```javascript
// In browser console:
window.__ORCHESTRATION_STORE__.getState();
// Look for errorBoundary state
```

**Step 4:** Verify panel is registered

```typescript
// Check that useOrchestrationKeyboard is called with callback
const callbacks = {
  onToggleMCP: () => setShowMCP(!showMCP),
  // ... other callbacks
};
useOrchestrationKeyboard(callbacks);
```

**If still failing:** Restart browser, clear cache, try incognito mode

---

### Panel Opens But Shows Blank Screen

**Symptom:** Panel appears but content is empty or white

**Possible Causes:**

1. Component data not loaded
2. API call failed
3. Missing required props
4. CSS not loaded

**Solutions:**

**Step 1:** Check orchestration store state

```javascript
const state = window.__ORCHESTRATION_STORE__.getState();
console.log(state.workflows); // Should have workflows
console.log(state.mcpServers); // Should have servers
console.log(state.behaviorTrees); // Should have trees
```

**Step 2:** Initialize default data

```javascript
// For workflows
const { addWorkflow } = useOrchestrationStore();
addWorkflow({
  id: 'test_workflow',
  name: 'Test Workflow',
  description: 'Test',
  nodes: [],
  edges: [],
  createdAt: new Date(),
  updatedAt: new Date(),
});
```

**Step 3:** Check CSS rendering

- Verify Tailwind classes are applied
- Check for `className` typos
- Inspect element in DevTools

**Step 4:** Reload with hard refresh

- Windows/Linux: `Ctrl+Shift+R`
- macOS: `Cmd+Shift+R`

---

### Panel Crashes Immediately

**Symptom:** Panel opens briefly then disappears, error in console

**Possible Causes:**

1. Unhandled exception in render
2. Invalid data in store
3. Missing required dependency

**Solutions:**

**Step 1:** Check error boundary logs

```javascript
// Error boundaries log caught errors to console
// Look for:
Error caught by ErrorBoundary: [Component Name]
```

**Step 2:** Reset panel-specific state

```javascript
// For MCP panel
const { mcpServers } = useOrchestrationStore();
mcpServers.clear();

// For workflows
const { workflows } = useOrchestrationStore();
workflows.clear();
```

**Step 3:** Verify prop types

```typescript
// Check component expects correct props
interface MCPServerConfigPanelProps {
  onClose: () => void;  // ← Required
}

// Ensure prop is provided
<MCPServerConfigPanel onClose={() => setShowMCP(false)} />
```

**Step 4:** Isolate issue

- Comment out panel content
- Add back section by section
- Identify failing component

---

## MCP Connection Issues

### Server Connection Failed

**Symptom:** Red status indicator, "Connection refused: ECONNREFUSED"

**Diagnosis:**

**Step 1:** Verify orchestrator is running

```bash
curl http://localhost:5567/health

# Expected response:
{
  "status": "healthy",
  "uptime": 12345,
  "version": "1.0.0"
}
```

**Step 2:** Check port not in use

```bash
# Windows
netstat -ano | findstr :5567

# Linux/Mac
lsof -i :5567
```

**Step 3:** Verify firewall settings

- Windows Firewall: Allow port 5567
- macOS: System Preferences → Security → Firewall → Options
- Linux: `sudo ufw allow 5567`

**Solutions:**

**Start the orchestrator:**

```bash
cd C:/Users/josep/.mcp
npm start  # or your start command
```

**Use alternative port:**

```typescript
updateMCPServer('mcp-orchestrator', {
  url: 'http://localhost:5568', // Different port
});
```

**Check orchestrator logs:**

```bash
# Look for startup errors
npm start 2>&1 | tee orchestrator.log
```

---

### Server Shows Yellow/Degraded Status

**Symptom:** Yellow indicator, response time > 500ms

**Diagnosis:**

- Check server load (CPU, memory)
- Measure network latency
- Check database connection pool

**Solutions:**

**Increase timeout:**

```typescript
updateMCPServer('slow-server', {
  timeout: 30000, // 30 seconds instead of 10
  healthCheckInterval: 60000, // Check less frequently
});
```

**Optimize server performance:**

- Add database indexes
- Implement caching
- Use connection pooling
- Scale server resources

**Add retry logic:**

```typescript
const retryPolicy = {
  maxRetries: 5, // More retries
  backoffMultiplier: 2, // Exponential backoff
};
```

---

### Tool Call Fails with 401 Unauthorized

**Symptom:** Tool test shows "401 Unauthorized" error

**Diagnosis:**

**Step 1:** Verify API key

```javascript
// In browser console
localStorage.getItem('mcp-api-key');
// Should return: "YOUR_HOLOSCRIPT_API_KEY" or your key
```

**Step 2:** Check server expects key

```bash
curl -H "x-mcp-api-key: YOUR_HOLOSCRIPT_API_KEY" \
  http://localhost:5567/servers

# If 401: key is invalid
# If 200: key is correct
```

**Solutions:**

**Update API key:**

```typescript
const [apiKey, setApiKey] = useLocalStorage('mcp-api-key', 'your-key-here');
updateMCPServer('mcp-orchestrator', { apiKey });
```

**Reset to default key:**

```javascript
localStorage.setItem('mcp-api-key', 'YOUR_HOLOSCRIPT_API_KEY');
location.reload();
```

**Check orchestrator config:**

```typescript
// In orchestrator config file
{
  apiKey: process.env.HOLOSCRIPT_API_KEY || 'YOUR_HOLOSCRIPT_API_KEY';
}
```

---

### Tool Not Found Error

**Symptom:** "Tool 'xyz' not found on server 'abc'"

**Diagnosis:**

**Step 1:** List available tools

```bash
curl -H "x-mcp-api-key: YOUR_HOLOSCRIPT_API_KEY" \
  http://localhost:5567/tools

# Returns array of tools from all servers
```

**Step 2:** Check server is enabled

```javascript
const server = mcpServers.get('semantic-search-hub');
console.log(server.enabled); // Should be true
```

**Solutions:**

**Refresh tool list:**

1. Click server in MCP panel
2. Wait for tool browser to load
3. Tool should appear in list

**Verify tool registration:**

```typescript
// In server code
server.registerTool({
  name: 'search_knowledge', // ← This must match tool call
  description: '...',
  handler: async (args) => {
    /* ... */
  },
});
```

**Check spelling:**

```typescript
// Incorrect
{
  tool: 'searchKnowledge';
} // CamelCase

// Correct
{
  tool: 'search_knowledge';
} // snake_case
```

---

## Auto-Save and Persistence Issues

### Auto-Save Not Working

**Symptom:** Changes to workflows/trees are lost after refresh

**Diagnosis:**

**Step 1:** Check localStorage quota

```javascript
// Test localStorage write
try {
  localStorage.setItem('test', 'value');
  localStorage.removeItem('test');
  console.log('localStorage working');
} catch (e) {
  console.error('localStorage full or disabled:', e);
}
```

**Step 2:** Verify auto-save hook

```javascript
// Check auto-save is enabled
const { lastSaved } = useOrchestrationStore();
console.log('Last saved:', lastSaved);
// Should update every 2 seconds when editing
```

**Solutions:**

**Clear old data:**

```javascript
// Free up space
localStorage.removeItem('old-data-key');
localStorage.removeItem('unused-cache');

// Check size
console.log(JSON.stringify(localStorage).length / 1024 + 'KB');
```

**Increase auto-save interval:**

```typescript
// In useOrchestrationAutoSave.ts
const AUTO_SAVE_INTERVAL = 5000; // 5 seconds instead of 2
```

**Manual save:**

```typescript
// Force save immediately
const { workflows, saveWorkflow } = useOrchestrationStore();
const workflow = workflows.get('workflow_123');
saveWorkflow(workflow);
```

**Use export as backup:**

```typescript
// Export to JSON file as failsafe
import { downloadWorkflowJSON } from '@/lib/exporters';
downloadWorkflowJSON(workflow);
```

---

### Data Lost After Browser Close

**Symptom:** All workflows/trees disappear after closing browser

**Diagnosis:**

**Browser in private/incognito mode?**

- Incognito mode clears localStorage on close
- Use normal browser window for persistence

**localStorage disabled?**

```javascript
// Check browser settings
console.log(navigator.cookieEnabled); // Should be true
```

**Solutions:**

**Enable localStorage:**

- Chrome: Settings → Privacy → Cookies → "Allow all"
- Firefox: Preferences → Privacy → Custom → "Remember history"
- Safari: Preferences → Privacy → Uncheck "Block all cookies"

**Use session backup:**

```typescript
// Also save to sessionStorage
sessionStorage.setItem('orchestration-backup', JSON.stringify(state));

// Restore on load
const backup = sessionStorage.getItem('orchestration-backup');
if (backup && !localStorage.getItem('orchestration-state')) {
  localStorage.setItem('orchestration-state', backup);
}
```

**Regular exports:**

- Export workflows weekly: `Ctrl+Shift+E`
- Store in Git repository
- Cloud backup (Dropbox, Google Drive)

---

## Export Issues

### Export Functions Not Downloading

**Symptom:** Click export button, no file downloads

**Diagnosis:**

**Step 1:** Check browser download permissions

- Browser may block automatic downloads
- Check for popup blocker notification

**Step 2:** Check browser console

```javascript
// Look for errors like:
SecurityError: Blocked a frame from accessing a cross-origin frame.
Failed to create object URL.
```

**Solutions:**

**Allow downloads:**

- Chrome: Settings → Downloads → "Ask where to save each file before downloading"
- Click "Always allow" on popup notification

**Check download location:**

- Verify downloads folder exists and is writable
- Check disk space available

**Use alternative export:**

```javascript
// Copy to clipboard instead
const json = exportWorkflow(workflow);
navigator.clipboard.writeText(json);
console.log('Copied to clipboard!');
```

**Manual download:**

```javascript
// Right-click → Save link as
const json = exportWorkflow(workflow);
console.log(json);
// Copy console output and save manually
```

---

### Exported File is Empty or Invalid

**Symptom:** Downloaded JSON file is 0 bytes or won't parse

**Diagnosis:**

**Step 1:** Check export function

```javascript
const workflow = workflows.get('workflow_123');
const json = exportWorkflow(workflow);
console.log(json); // Should be valid JSON string
```

**Step 2:** Validate JSON

```javascript
try {
  JSON.parse(json);
  console.log('Valid JSON');
} catch (e) {
  console.error('Invalid JSON:', e);
}
```

**Solutions:**

**Verify data exists:**

```javascript
const workflow = workflows.get('workflow_123');
console.log(workflow); // Should have nodes, edges, etc.

if (!workflow) {
  console.error('Workflow not found!');
}
```

**Check for circular references:**

```javascript
// Causes JSON.stringify to fail
const node = { id: 'node1', parent: null };
node.parent = node; // ← Circular reference

// Solution: Use structured clone
const safeData = structuredClone(workflow);
```

**Use safe stringify:**

```javascript
import safeStringify from 'json-stringify-safe';

const json = safeStringify(workflow, null, 2);
```

---

### Export File Won't Import

**Symptom:** Exported workflow JSON can't be imported back

**Diagnosis:**

**Step 1:** Validate against schema

```typescript
import { AgentWorkflow } from '@/lib/orchestrationStore';

const isValid = (data: any): data is AgentWorkflow => {
  return (
    typeof data.id === 'string' &&
    typeof data.name === 'string' &&
    Array.isArray(data.nodes) &&
    Array.isArray(data.edges)
  );
};

const parsed = JSON.parse(exportedJSON);
console.log(isValid(parsed)); // Should be true
```

**Solutions:**

**Add version to exports:**

```typescript
const exportWorkflow = (workflow: AgentWorkflow) => {
  const data = {
    version: '1.0.0', // ← For compatibility checks
    workflow,
  };
  return JSON.stringify(data, null, 2);
};
```

**Implement import validation:**

```typescript
const importWorkflow = (json: string) => {
  const data = JSON.parse(json);

  // Check version
  if (data.version !== '1.0.0') {
    throw new Error('Incompatible workflow version');
  }

  // Validate schema
  if (!isValid(data.workflow)) {
    throw new Error('Invalid workflow structure');
  }

  return data.workflow;
};
```

---

## Performance Issues

### Large Workflows Cause Lag

**Symptom:** UI freezes with workflows > 100 nodes

**Diagnosis:**

**Measure render time:**

```javascript
console.time('workflow-render');
// Render workflow
console.timeEnd('workflow-render');
// Should be < 100ms for good UX
```

**Solutions:**

**Virtualize node list:**

```typescript
// Only render visible nodes
import { Virtuoso } from 'react-virtuoso';

<Virtuoso
  data={nodes}
  itemContent={(index, node) => <NodeComponent node={node} />}
/>
```

**Memoize expensive components:**

```typescript
import { memo } from 'react';

const NodeComponent = memo(({ node }) => {
  return <div>{node.label}</div>;
});
```

**Throttle updates:**

```typescript
import { throttle } from 'lodash';

const handleNodeDrag = throttle((event) => {
  updateNodePosition(event);
}, 16); // 60fps
```

**Reduce auto-save frequency:**

```typescript
// Save every 5s instead of 2s for large workflows
const AUTO_SAVE_INTERVAL = 5000;
```

---

### Event Monitor Slows Down with Many Events

**Symptom:** UI becomes sluggish with > 1000 events

**Solutions:**

**Limit displayed events:**

```typescript
const filteredEvents = events.slice(-100); // Last 100 only
```

**Implement pagination:**

```typescript
const [page, setPage] = useState(0);
const EVENTS_PER_PAGE = 50;

const displayedEvents = filteredEvents.slice(page * EVENTS_PER_PAGE, (page + 1) * EVENTS_PER_PAGE);
```

**Clear old events:**

```typescript
// Auto-clear events older than 1 hour
const clearOldEvents = () => {
  const oneHourAgo = Date.now() - 3600000;
  const recentEvents = events.filter((e) => e.timestamp > oneHourAgo);
  setEvents(recentEvents);
};
```

---

### Tool Call Graph Memory Leak

**Symptom:** Memory usage grows over time, browser becomes slow

**Diagnosis:**

**Check tool call history size:**

```javascript
const { toolCallHistory } = useOrchestrationStore.getState();
console.log(toolCallHistory.length); // Growing unbounded?
```

**Solutions:**

**Limit history size:**

```typescript
const MAX_HISTORY = 500;

const addToolCall = (call: ToolCallRecord) => {
  setToolCallHistory((prev) => {
    const updated = [...prev, call];
    return updated.slice(-MAX_HISTORY); // Keep last 500
  });
};
```

**Clear history periodically:**

```typescript
useEffect(() => {
  const interval = setInterval(() => {
    clearToolCallHistory();
  }, 600000); // Clear every 10 minutes

  return () => clearInterval(interval);
}, []);
```

---

## Keyboard Shortcut Issues

### Shortcuts Not Working

**Symptom:** Pressing `Ctrl+M` doesn't open MCP panel

**Diagnosis:**

**Step 1:** Check focus

```javascript
// Shortcuts only work when window has focus
console.log(document.hasFocus()); // Should be true
```

**Step 2:** Check for conflicts

```javascript
// Other libraries may intercept shortcuts
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'm') {
    console.log('Key event detected');
  }
});
```

**Solutions:**

**Click inside HoloScript Studio:**

- Shortcuts require focus on the application window

**Check preventDefault:**

```typescript
if (e.ctrlKey && e.key === 'm') {
  e.preventDefault(); // ← Ensures override of browser default
  callbacks.onToggleMCP();
}
```

**Use alternative shortcut:**

- Try clicking UI button instead
- Use different key combination

**Disable conflicting extensions:**

- Browser extensions may intercept shortcuts
- Test in incognito mode

---

### Shortcut Triggers Browser Action

**Symptom:** `Ctrl+T` opens new tab instead of Tool Call Graph

**Solutions:**

**Add stopPropagation:**

```typescript
if (e.ctrlKey && e.shiftKey && e.key === 'T') {
  e.preventDefault();
  e.stopPropagation(); // ← Stop event from reaching browser
  callbacks.onToggleToolCallGraph();
}
```

**Use different shortcut:**

```typescript
// Change from Ctrl+T to Ctrl+Shift+T
// Less likely to conflict with browser
```

**Check browser version:**

- Update to latest version
- Older browsers may not respect `preventDefault()`

---

## Error Boundary Issues

### Error Boundary Triggered

**Symptom:** Panel shows "Something went wrong" message

**Diagnosis:**

**Check console for error:**

```javascript
// Error boundaries log to console
console.error('Error caught:', error);
```

**Identify failing component:**

```
Error boundary caught error in:
  Component: MCPServerConfigPanel
  Stack: ...
```

**Solutions:**

**Reload component:**

- Close panel (`Esc`)
- Reopen panel (`Ctrl+M`)

**Clear corrupted state:**

```javascript
// Reset specific store section
const { resetMCPState } = useOrchestrationStore();
resetMCPState();
```

**Report bug:**

```javascript
// Copy error details
console.error('Error:', error);
console.log('Store state:', window.__ORCHESTRATION_STORE__.getState());
// Share in GitHub issue
```

---

### Entire App Crashes

**Symptom:** White screen, no panels visible

**Solutions:**

**Hard refresh:**

- `Ctrl+Shift+R` (Windows/Linux)
- `Cmd+Shift+R` (macOS)

**Clear all state:**

```javascript
localStorage.clear();
sessionStorage.clear();
location.reload();
```

**Check console:**

```javascript
// Look for fatal errors
Uncaught TypeError: Cannot read property 'X' of undefined
```

**Rollback changes:**

```bash
# If recent code change caused it
git checkout HEAD~1
npm run build
```

---

## Workflow Execution Issues

### Workflow Won't Execute

**Symptom:** Click "Run", nothing happens

**Diagnosis:**

**Check workflow validation:**

```typescript
const isValid = (workflow: AgentWorkflow) => {
  // Must have at least one node
  if (workflow.nodes.length === 0) return false;

  // Nodes must be connected
  const connectedNodes = new Set(workflow.edges.flatMap((e) => [e.source, e.target]));
  if (connectedNodes.size === 0) return false;

  return true;
};
```

**Solutions:**

**Ensure workflow has nodes:**

1. Add at least one agent or tool node
2. Connect nodes with edges
3. Save workflow

**Check agent configuration:**

```typescript
// Agent must have valid config
const agentNode = nodes.find((n) => n.type === 'agent');
console.log(agentNode.data);

// Should have:
// - agentId
// - systemPrompt
// - temperature
```

---

### Tool Calls Fail in Workflow

**Symptom:** Workflow executes but tool calls return errors

**Diagnosis:**

**Check Tool Call Graph (`Ctrl+Shift+T`):**

- Red indicators show failures
- Expand call to see error message

**Common errors:**

- Missing required parameters
- Invalid parameter types
- Server offline
- Authentication failure

**Solutions:**

**Test tool individually:**

1. Open MCP panel (`Ctrl+M`)
2. Find the failing tool
3. Click "▶" to open tester
4. Fill parameters and test
5. Fix issues then retry workflow

**Check parameter mapping:**

```typescript
// Tool node must pass correct args
{
  type: 'tool',
  data: {
    toolName: 'search_knowledge',
    server: 'semantic-search-hub',
    args: {
      query: '$input.query',  // ← Mapped from previous node
      limit: 5
    }
  }
}
```

---

## Behavior Tree Issues

### Tree Won't Execute

**Symptom:** Behavior tree doesn't run or immediately fails

**Diagnosis:**

**Check root node:**

```typescript
// Tree must have exactly one root (no incoming edges)
const roots = nodes.filter((n) => !edges.some((e) => e.target === n.id));

console.log('Root nodes:', roots.length); // Should be 1
```

**Solutions:**

**Ensure single root:**

1. Delete extra root nodes
2. Connect all nodes to single root
3. Root should be Sequence or Selector

**Validate tree structure:**

```typescript
// No cycles allowed
const hasCycle = (nodes, edges) => {
  // DFS cycle detection
  // ...
};
```

---

### Actions Don't Execute

**Symptom:** Action nodes are skipped or fail immediately

**Diagnosis:**

**Check action registration:**

```typescript
// Action IDs must be registered in runtime
const actions = {
  'move_to': (args) => { /* ... */ },
  'attack': (args) => { /* ... */ },
  'wait': (args) => { /* ... */ }
};

// Action node must use registered ID
{
  type: 'action',
  data: {
    actionId: 'move_to'  // ← Must exist in actions object
  }
}
```

**Solutions:**

**Implement action handlers:**

```typescript
// In behavior tree runtime
const executeAction = (node: BTNode) => {
  const handler = actions[node.data.actionId];
  if (!handler) {
    throw new Error(`Action '${node.data.actionId}' not found`);
  }
  return handler(node.data);
};
```

---

## General Debugging

### Enable Debug Mode

**Step 1:** Open browser console (F12)

**Step 2:** Enable verbose logging

```javascript
localStorage.setItem('orchestration-debug', 'true');
location.reload();
```

**Step 3:** View debug logs

```javascript
// Orchestration store logs all actions
[OrchestrationStore] addWorkflow: workflow_123
[OrchestrationStore] updateWorkflowNode: node_456
[OrchestrationStore] addWorkflowEdge: edge_789
```

---

### Inspect Orchestration State

```javascript
// Get full state
const state = window.__ORCHESTRATION_STORE__.getState();

console.log('Workflows:', state.workflows);
console.log('MCP Servers:', state.mcpServers);
console.log('Behavior Trees:', state.behaviorTrees);
console.log('Events:', state.events);
console.log('Tool Calls:', state.toolCallHistory);
```

---

### Reset Everything

**Nuclear option** - clears all data:

```javascript
// Clear all localStorage
localStorage.clear();

// Clear all sessionStorage
sessionStorage.clear();

// Reset Zustand store
window.__ORCHESTRATION_STORE__.getState().reset();

// Hard reload
location.reload();
```

---

## Getting Help

### Check Documentation

- [Architecture Overview](./README.md)
- [Workflow Guide](./workflows.md)
- [Behavior Tree Guide](./behavior-trees.md)
- [MCP Integration](./mcp-integration.md)
- [Keyboard Shortcuts](./keyboard-shortcuts.md)

### Gather Debug Info

Before reporting issues, collect:

1. **Error message** from console
2. **Store state** from `window.__ORCHESTRATION_STORE__.getState()`
3. **Browser version** and OS
4. **Steps to reproduce**
5. **Expected vs actual behavior**

### Report Issues

Create GitHub issue with:

```markdown
**Environment:**

- Browser: Chrome 120.0.6099.109
- OS: Windows 11
- HoloScript Studio version: 1.0.0

**Steps to Reproduce:**

1. Open Workflow Editor (Ctrl+Shift+W)
2. Add Agent node
3. Click Save
4. Panel crashes

**Error Message:**
```

TypeError: Cannot read property 'id' of undefined
at AgentOrchestrationGraphEditor.tsx:89

````

**Store State:**
```json
{
  "workflows": {},
  "mcpServers": {...}
}
````

**Expected:** Workflow saves successfully
**Actual:** Panel crashes with error

```

---

**Still stuck?** Check source code in `src/components/orchestration/` for implementation details.

---

**Happy Debugging!**
```
