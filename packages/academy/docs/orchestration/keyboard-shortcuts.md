# Keyboard Shortcuts Reference

**Power user guide to HoloScript Studio orchestration shortcuts**

Master these keyboard shortcuts to dramatically speed up your workflow design and agent orchestration. All shortcuts are globally available throughout HoloScript Studio.

---

## Table of Contents

- [Orchestration Panel Shortcuts](#orchestration-panel-shortcuts)
- [Editor Shortcuts](#editor-shortcuts)
- [Navigation Shortcuts](#navigation-shortcuts)
- [Tips for Power Users](#tips-for-power-users)
- [Customizing Shortcuts](#customizing-shortcuts)
- [Shortcut Conflicts](#shortcut-conflicts)

---

## Orchestration Panel Shortcuts

### Primary Panels

| Shortcut       | Action                         | Component                     |
| -------------- | ------------------------------ | ----------------------------- |
| `Ctrl+M`       | Toggle MCP Server Config Panel | MCPServerConfigPanel          |
| `Ctrl+Shift+W` | Toggle Workflow Editor         | AgentOrchestrationGraphEditor |
| `Ctrl+B`       | Toggle Behavior Tree Editor    | BehaviorTreeVisualEditor      |
| `Ctrl+E`       | Toggle Event Monitor           | AgentEventMonitorPanel        |
| `Ctrl+Shift+T` | Toggle Tool Call Graph         | ToolCallGraphVisualizer       |
| `Ctrl+Shift+A` | Toggle Agent Ensemble          | DesktopAgentEnsemble          |

**Note:** All shortcuts use `Ctrl` on Windows/Linux and `Cmd` on macOS.

---

### Quick Access Workflow

**Scenario:** Design a new agent workflow

1. **`Ctrl+M`** - Open MCP panel to browse available tools
2. **`Ctrl+Shift+W`** - Open Workflow editor
3. Add agent and tool nodes
4. **`Ctrl+E`** - Open Event Monitor to track execution
5. **`Ctrl+Shift+T`** - Open Tool Call Graph to monitor performance

**Time Saved:** 15-20 seconds per workflow iteration vs mouse navigation

---

## Editor Shortcuts

### Workflow Editor (Ctrl+Shift+W)

| Shortcut              | Action                    |
| --------------------- | ------------------------- |
| **Node Operations**   |
| Click + Drag          | Move node                 |
| Drag from handle      | Create connection         |
| `Delete`              | Delete selected node/edge |
| `Ctrl+Z`              | Undo last action          |
| `Ctrl+Y`              | Redo action               |
| `Ctrl+C`              | Copy selected nodes       |
| `Ctrl+V`              | Paste nodes               |
| `Ctrl+A`              | Select all nodes          |
| **Canvas Navigation** |
| Mouse wheel           | Zoom in/out               |
| Space + Drag          | Pan canvas                |
| `Ctrl+0`              | Reset zoom to 100%        |
| `Ctrl+F`              | Fit view to all nodes     |
| **Saving**            |
| `Ctrl+S`              | Save workflow             |

---

### Behavior Tree Editor (Ctrl+B)

| Shortcut            | Action               |
| ------------------- | -------------------- |
| **Node Operations** |
| Click + Drag        | Move node            |
| Drag from output    | Connect to child     |
| `Delete`            | Delete selected node |
| `Ctrl+Z`            | Undo                 |
| `Ctrl+Y`            | Redo                 |
| `Ctrl+D`            | Duplicate node       |
| **Tree Navigation** |
| Mouse wheel         | Zoom                 |
| Space + Drag        | Pan                  |
| `Ctrl+F`            | Fit view             |
| **Execution**       |
| `Ctrl+Enter`        | Test tree execution  |

---

### MCP Server Config (Ctrl+M)

| Shortcut  | Action                |
| --------- | --------------------- |
| `↑` / `↓` | Navigate server list  |
| `Enter`   | Select server         |
| `Ctrl+F`  | Focus search box      |
| `Esc`     | Clear search          |
| `Ctrl+R`  | Refresh health checks |
| `Ctrl+T`  | Test selected tool    |

---

### Event Monitor (Ctrl+E)

| Shortcut         | Action                     |
| ---------------- | -------------------------- |
| `Space`          | Pause/Resume event capture |
| `Ctrl+K`         | Clear event log            |
| `Ctrl+F`         | Focus filter input         |
| `Ctrl+E` (again) | Export events as CSV       |
| `Ctrl+Shift+E`   | Export events as JSON      |
| `↑` / `↓`        | Scroll event list          |

---

### Tool Call Graph (Ctrl+Shift+T)

| Shortcut | Action                       |
| -------- | ---------------------------- |
| `Ctrl+K` | Clear call history           |
| `Ctrl+F` | Filter by tool name          |
| `Enter`  | Expand selected call details |
| `Ctrl+E` | Export call history          |

---

### Agent Ensemble (Ctrl+Shift+A)

| Shortcut     | Action                     |
| ------------ | -------------------------- |
| Click + Drag | Move agent position        |
| `Ctrl+R`     | Reset agent positions      |
| `Ctrl+G`     | Toggle grid snap           |
| `Space`      | Pause/Resume agent updates |

---

## Navigation Shortcuts

### Panel Management

| Shortcut         | Action                           |
| ---------------- | -------------------------------- |
| `Esc`            | Close active panel               |
| `Ctrl+W`         | Close active panel (alternative) |
| `Ctrl+Tab`       | Cycle through open panels        |
| `Ctrl+Shift+Tab` | Cycle backwards                  |

**Example:** Quickly switch between panels

```
Ctrl+M       → Open MCP panel
Ctrl+Tab     → Switch to next panel
Ctrl+Tab     → Switch again
Esc          → Close current panel
```

---

### Multi-Panel Workflows

**Scenario:** Monitor agent execution across all panels

1. **`Ctrl+M`** - MCP panel (verify servers online)
2. **`Ctrl+Shift+W`** - Workflow editor (view current workflow)
3. **`Ctrl+E`** - Event monitor (track agent messages)
4. **`Ctrl+Shift+T`** - Tool call graph (monitor tool execution)
5. **`Ctrl+Tab`** - Cycle between panels as needed

**All panels visible simultaneously** for comprehensive monitoring.

---

## Tips for Power Users

### 1. Muscle Memory Shortcuts

Practice these frequently used combinations:

**Design Flow:**

```
Ctrl+Shift+W → Open workflow
Add nodes (mouse)
Ctrl+S → Save
Ctrl+E → Monitor events
```

**Debug Flow:**

```
Ctrl+E → Check events
Ctrl+Shift+T → Check tool calls
Ctrl+M → Verify server health
```

**Export Flow:**

```
Ctrl+Shift+W → Open workflow
Ctrl+Shift+E → Export as JSON
```

---

### 2. One-Hand Shortcuts

Left-hand only (while right hand on mouse):

- `Ctrl+M` - MCP panel
- `Ctrl+E` - Event monitor
- `Ctrl+B` - Behavior tree
- `Ctrl+W` - Close panel

Right hand stays on mouse for node manipulation.

---

### 3. Sequential Shortcuts

Chain shortcuts for complex workflows:

**Create & Test Workflow:**

```
1. Ctrl+Shift+W  (open editor)
2. Add nodes      (mouse)
3. Ctrl+S         (save)
4. Ctrl+E         (monitor)
5. Ctrl+Enter     (execute)
6. Ctrl+Shift+T   (check performance)
```

**Export Everything:**

```
1. Ctrl+Shift+W  (workflow)
2. Ctrl+Shift+E  (export workflow)
3. Ctrl+B        (behavior tree)
4. Ctrl+E        (export tree)
5. Ctrl+E        (events)
6. Ctrl+E        (export events)
```

---

### 4. Modifier Key Patterns

**Ctrl alone:**

- `Ctrl+M` - MCP
- `Ctrl+B` - Behavior tree
- `Ctrl+E` - Events
- `Ctrl+W` - Close

**Ctrl+Shift:**

- `Ctrl+Shift+W` - Workflow
- `Ctrl+Shift+T` - Tool calls
- `Ctrl+Shift+A` - Agent ensemble
- `Ctrl+Shift+E` - Export variants

**Pattern:** Shift = more complex/secondary panels

---

### 5. Context-Aware Shortcuts

Some shortcuts behave differently based on context:

**`Ctrl+E` behavior:**

- No panel open → Opens Event Monitor
- Event Monitor open → Exports events as CSV
- Other panel open → Toggles Event Monitor

**`Ctrl+S` behavior:**

- Workflow editor → Saves workflow
- Behavior tree editor → Saves tree
- MCP config → Saves server settings

---

## Customizing Shortcuts

### Implementation Location

Shortcuts are defined in:

```
src/hooks/useOrchestrationKeyboard.ts
```

### Adding Custom Shortcuts

Edit the keyboard hook:

```typescript
export function useOrchestrationKeyboard(callbacks: OrchestrationKeyboardCallbacks) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Add your custom shortcut
      if (e.ctrlKey && e.key === 'j') {
        e.preventDefault();
        callbacks.onToggleMyCustomPanel();
      }

      // Existing shortcuts...
      if (e.ctrlKey && e.key === 'm') {
        e.preventDefault();
        callbacks.onToggleMCP();
      }
      // ...
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [callbacks]);
}
```

### Best Practices for Custom Shortcuts

1. **Use `Ctrl+Letter`** for primary actions
2. **Use `Ctrl+Shift+Letter`** for secondary actions
3. **Avoid conflicts** with browser shortcuts (Ctrl+T, Ctrl+N, etc.)
4. **Be consistent** - Group related actions with similar modifiers
5. **Document** - Add to this file and display in UI

---

## Shortcut Conflicts

### Browser Shortcuts to Avoid

| Shortcut | Browser Action | Status                            |
| -------- | -------------- | --------------------------------- |
| `Ctrl+T` | New tab        | ⚠️ Conflicts with Tool Call Graph |
| `Ctrl+W` | Close tab      | ⚠️ Conflicts with Close Panel     |
| `Ctrl+N` | New window     | ✓ Safe (not used)                 |
| `Ctrl+R` | Reload page    | ⚠️ Used in MCP panel (refresh)    |
| `Ctrl+F` | Find in page   | ⚠️ Used for filter inputs         |

**Solution:** HoloScript Studio uses `preventDefault()` to override browser defaults when panels are open.

---

### OS Shortcuts to Avoid

**Windows:**

- `Ctrl+Alt+Delete` - Task manager (can't override)
- `Windows+D` - Show desktop (can't override)
- `Alt+Tab` - Switch apps (can't override)

**macOS:**

- `Cmd+Space` - Spotlight (can't override)
- `Cmd+Tab` - Switch apps (can't override)
- `Cmd+Q` - Quit app (can't override)

**Recommendation:** Use `Ctrl`/`Cmd` + letter combinations to avoid OS conflicts.

---

### Resolving Conflicts

**Problem:** `Ctrl+Shift+T` reopens closed browser tab

**Solution:**

```typescript
if (e.ctrlKey && e.shiftKey && e.key === 'T') {
  e.preventDefault(); // ← Prevent browser action
  e.stopPropagation(); // ← Stop event bubbling
  callbacks.onToggleToolCallGraph();
}
```

**Testing:** Open panel with shortcut, then try browser shortcut - panel should toggle instead.

---

## Quick Reference Card

Print this for desk reference:

```
┌─────────────────────────────────────────────────────┐
│         HoloScript Studio Shortcuts                 │
├─────────────────────────────────────────────────────┤
│                                                     │
│  PANELS                                             │
│  ────────────────────────────────────────────────   │
│  Ctrl+M         MCP Server Config                   │
│  Ctrl+Shift+W   Workflow Editor                     │
│  Ctrl+B         Behavior Tree Editor                │
│  Ctrl+E         Event Monitor                       │
│  Ctrl+Shift+T   Tool Call Graph                     │
│  Ctrl+Shift+A   Agent Ensemble                      │
│                                                     │
│  EDITING                                            │
│  ────────────────────────────────────────────────   │
│  Ctrl+Z         Undo                                │
│  Ctrl+Y         Redo                                │
│  Ctrl+S         Save                                │
│  Ctrl+C/V       Copy/Paste                          │
│  Delete         Delete node                         │
│                                                     │
│  NAVIGATION                                         │
│  ────────────────────────────────────────────────   │
│  Ctrl+F         Fit view / Find                     │
│  Ctrl+Tab       Next panel                          │
│  Esc            Close panel                         │
│  Space+Drag     Pan canvas                          │
│  Mouse Wheel    Zoom                                │
│                                                     │
│  EXPORT                                             │
│  ────────────────────────────────────────────────   │
│  Ctrl+Shift+E   Export current panel data           │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## Accessibility

### Screen Reader Support

Shortcuts are announced to screen readers:

```html
<button aria-label="Open MCP Panel (Ctrl+M)">MCP</button>
```

### Alternative Navigation

For users who can't use shortcuts:

1. **Mouse navigation** - All actions available via UI buttons
2. **Tab navigation** - Keyboard focus for all interactive elements
3. **Voice control** - Compatible with Dragon NaturallySpeaking
4. **Custom shortcuts** - Modify in `useOrchestrationKeyboard.ts`

---

## Performance Tips

### Shortcut Responsiveness

Shortcuts are **globally registered** for instant response:

```typescript
window.addEventListener('keydown', handleKeyDown);
```

**Typical latency:** < 10ms from keypress to panel toggle

### Debouncing

Rapid shortcuts are debounced to prevent UI jank:

```typescript
const debouncedToggle = debounce(() => {
  callbacks.onToggleMCP();
}, 100); // 100ms debounce
```

**Result:** Smooth panel transitions even with rapid keypresses

---

## Learning Path

### Beginner (Day 1)

Learn these 3 shortcuts first:

1. `Ctrl+M` - MCP panel (most used)
2. `Ctrl+Shift+W` - Workflow editor (primary design tool)
3. `Esc` - Close panel (navigation)

**Goal:** Open and close panels without mouse.

---

### Intermediate (Week 1)

Add these shortcuts:

4. `Ctrl+E` - Event monitor (debugging)
5. `Ctrl+B` - Behavior tree (alternative to workflows)
6. `Ctrl+S` - Save (workflow persistence)

**Goal:** Complete basic workflow design without mouse.

---

### Advanced (Month 1)

Master all shortcuts:

7. `Ctrl+Shift+T` - Tool call graph (performance monitoring)
8. `Ctrl+Shift+A` - Agent ensemble (spatial coordination)
9. `Ctrl+Tab` - Panel cycling (multi-panel workflows)
10. `Ctrl+Shift+E` - Export (sharing workflows)

**Goal:** Sub-1-minute workflow design from concept to export.

---

## Troubleshooting

**Problem:** Shortcut doesn't work

**Solutions:**

1. Check browser focus (click inside HoloScript Studio window)
2. Verify no modal/dialog is open (Esc to close)
3. Check browser console for errors
4. Try alternative shortcut (e.g., `Ctrl+W` instead of `Esc`)

---

**Problem:** Shortcut triggers browser action

**Solutions:**

1. Update browser to latest version
2. Check `preventDefault()` in `useOrchestrationKeyboard.ts`
3. Use alternative shortcut
4. Disable browser extension conflicts

---

**Problem:** Shortcut conflicts with OS

**Solutions:**

1. Use different modifier (Shift, Alt)
2. Customize shortcut in keyboard hook
3. Disable OS shortcut (advanced users)

---

## Next Steps

- [Create your first workflow](./workflows.md) using shortcuts
- [Design behavior trees](./behavior-trees.md) with keyboard navigation
- [Configure MCP servers](./mcp-integration.md) via shortcuts

---

**Happy Shortcutting!**
