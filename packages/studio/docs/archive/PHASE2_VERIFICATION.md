# Phase 2 Verification & Testing Guide

**Date:** 2026-02-28
**Status:** ✅ Implementation Complete - Ready for Testing

---

## Implementation Summary

### ✅ Task 4: Undo/Redo for All Editors (COMPLETE)

**Files Created:**

- ✅ `src/hooks/useOrchestrationHistory.ts` (200 lines)

**Files Modified:**

- ✅ `src/components/orchestration/AgentOrchestrationGraphEditor.tsx` (undo/redo integration)
- ✅ `src/components/orchestration/BehaviorTreeVisualEditor.tsx` (undo/redo integration)

**Features Implemented:**

- Snapshot-based history (max 50 snapshots)
- Debounced snapshots (500ms to prevent excessive history during drag operations)
- Keyboard shortcuts: `Ctrl+Z` (undo), `Ctrl+Shift+Z` (redo), `Ctrl+Y` (redo)
- Visual undo/redo buttons with disabled states
- History position tracking

### ✅ Task 5: Analytics Integration (COMPLETE)

**Files Created:**

- ✅ `src/lib/analytics/orchestration.ts` (400 lines)

**Files Modified:**

- ✅ `src/components/orchestration/AgentOrchestrationGraphEditor.tsx` (analytics tracking)
- ✅ `src/components/orchestration/BehaviorTreeVisualEditor.tsx` (analytics tracking)
- ✅ `src/components/orchestration/AgentEventMonitorPanel.tsx` (analytics tracking)

**Events Tracked:**

- Panel open/close with duration
- Workflow node additions, saves
- Behavior tree node additions
- Undo/redo operations
- Event monitor operations (open, filter, clear)
- MCP server operations (connect, disconnect, tool calls)
- Template usage
- Error tracking

---

## Verification Checklist

### 1. File Integrity

**Check all files exist:**

```bash
# Phase 2 Task 4 files
ls -la src/hooks/useOrchestrationHistory.ts

# Phase 2 Task 5 files
ls -la src/lib/analytics/orchestration.ts

# Modified components
ls -la src/components/orchestration/AgentOrchestrationGraphEditor.tsx
ls -la src/components/orchestration/BehaviorTreeVisualEditor.tsx
ls -la src/components/orchestration/AgentEventMonitorPanel.tsx
```

**Expected Result:** All files should exist and have recent modification timestamps.

---

### 2. TypeScript Compilation

**Run type check:**

```bash
cd packages/studio
pnpm run type-check
```

**Expected Result:** No TypeScript errors related to Phase 2 changes.

**Known Issues:**

- ⚠️ Pre-existing error in `SceneGraphPanel.tsx` (Icon type inference) - not related to Phase 2

---

### 3. Import/Export Verification

**Check useOrchestrationHistory exports:**

```typescript
// Expected exports from useOrchestrationHistory.ts
export interface HistoryState<T>
export function useOrchestrationHistory<T>
export function useOrchestrationKeyboardShortcuts
```

**Check analytics exports:**

```typescript
// Expected exports from orchestration.ts
export function trackOrchestrationEvent
export function trackPanelOpened
export function trackPanelClosed
export function trackWorkflowNodeAdded
export function trackWorkflowSaved
export function trackBehaviorTreeNodeAdded
export function trackUndoPerformed
export function trackRedoPerformed
export function trackEventMonitorOpened
export function trackEventMonitorFiltered
export function trackEventMonitorCleared
// ... and 20+ more tracking functions
```

---

## Manual Testing Plan

### Test 1: Undo/Redo in Workflow Editor

**Prerequisites:**

- Start HoloScript Studio dev server
- Open workflow editor (click Workflow button in toolbar)

**Test Steps:**

1. Add an Agent node
2. Add a Decision node
3. Connect them with an edge
4. **Test Undo:**
   - Press `Ctrl+Z` → Edge should disappear
   - Press `Ctrl+Z` → Decision node should disappear
   - Press `Ctrl+Z` → Agent node should disappear
5. **Test Redo:**
   - Press `Ctrl+Shift+Z` → Agent node should reappear
   - Press `Ctrl+Shift+Z` → Decision node should reappear
   - Press `Ctrl+Shift+Z` → Edge should reappear
6. **Test Undo/Redo Buttons:**
   - Click undo button → Last action should be undone
   - Verify undo button is disabled when at start of history
   - Click redo button → Last action should be redone
   - Verify redo button is disabled when at end of history

**Expected Result:**

- All undo/redo operations work correctly
- Buttons show disabled state appropriately
- Keyboard shortcuts work
- No console errors

---

### Test 2: Undo/Redo in Behavior Tree Editor

**Prerequisites:**

- Open behavior tree editor (click BT button in toolbar)

**Test Steps:**

1. Add a Sequence node
2. Add an Inverter node
3. Add a Repeat node
4. Connect them
5. **Test Undo/Redo:**
   - Use `Ctrl+Z` to undo all actions
   - Use `Ctrl+Shift+Z` to redo all actions
   - Test `Ctrl+Y` for redo (Windows convention)

**Expected Result:**

- All operations undo/redo correctly
- Tree structure is preserved
- No console errors

---

### Test 3: Analytics Tracking - Workflow Operations

**Prerequisites:**

- Open browser DevTools console
- Set up console filter for "[Analytics]"

**Test Steps:**

1. Open workflow editor
   - **Expected Log:** `[Analytics] panel_opened { panel_name: 'workflow_editor', timestamp: ... }`
2. Add Agent node
   - **Expected Log:** `[Analytics] workflow_node_added { workflow_id: 'default', node_type: 'agent' }`
3. Add Decision node
   - **Expected Log:** `[Analytics] workflow_node_added { workflow_id: 'default', node_type: 'decision' }`
4. Add Loop node
   - **Expected Log:** `[Analytics] workflow_node_added { workflow_id: 'default', node_type: 'loop' }`
5. Click Save button
   - **Expected Log:** `[Analytics] workflow_saved { workflow_id: 'default', node_count: 3, edge_count: 0 }`
6. Press `Ctrl+Z`
   - **Expected Log:** `[Analytics] undo_performed { context: 'workflow_editor', history_position: ... }`
7. Press `Ctrl+Shift+Z`
   - **Expected Log:** `[Analytics] redo_performed { context: 'workflow_editor', history_position: ... }`
8. Close panel
   - **Expected Log:** `[Analytics] panel_closed { panel_name: 'workflow_editor', duration_ms: ... }`

**Expected Result:**

- All events are logged to console in development mode
- Event properties match expected values
- No errors or warnings

---

### Test 4: Analytics Tracking - Behavior Tree Operations

**Test Steps:**

1. Open behavior tree editor
   - **Expected:** `panel_opened` event
2. Add various node types (Sequence, Inverter, Repeat, Retry, Guard, Timeout)
   - **Expected:** `behavior_tree_node_added` event for each
3. Test undo/redo
   - **Expected:** `undo_performed` and `redo_performed` events
4. Close panel
   - **Expected:** `panel_closed` event with duration

**Expected Result:**

- All BT-specific events tracked correctly
- Duration calculated accurately

---

### Test 5: Analytics Tracking - Event Monitor

**Test Steps:**

1. Open event monitor panel
   - **Expected:** `[Analytics] event_monitor_opened { event_count: 0 }`
2. Type in filter box (e.g., "test")
   - **Expected:** `[Analytics] event_monitor_filtered { filter_type: 'topic', filter_value: 'test' }`
3. Add test events (via browser console):
   ```javascript
   useOrchestrationStore.getState().addEvent({
     id: 'test1',
     topic: 'test.event',
     payload: { message: 'Hello' },
     senderId: 'test-agent',
     timestamp: Date.now(),
     receivedBy: [],
   });
   ```
4. Click Clear button
   - **Expected:** `[Analytics] event_monitor_cleared { event_count_cleared: 1 }`
5. Close panel
   - **Expected:** `[Analytics] panel_closed`

**Expected Result:**

- All event monitor operations tracked
- Event counts accurate

---

### Test 6: Debounced Snapshot Behavior

**Purpose:** Verify that dragging nodes doesn't create excessive history snapshots

**Test Steps:**

1. Open workflow editor
2. Add an Agent node
3. Rapidly drag the node around for 3-5 seconds
4. Stop dragging and wait 1 second
5. Press `Ctrl+Z` once
6. **Observe:** Node should return to its position from ~500ms ago, NOT every intermediate position

**Expected Result:**

- Only one snapshot per 500ms during drag operations
- History size remains manageable
- Undo behavior is smooth and predictable

---

### Test 7: History Size Limit

**Purpose:** Verify max 50 snapshots limit

**Test Steps:**

1. Open workflow editor
2. Add 60 nodes one by one (simulating 60 operations)
3. Verify history state:
   ```javascript
   // Browser console
   console.log('History length:', history.historyLength);
   console.log('Can undo 50 times?');
   ```
4. Try to undo 51 times
   - **Expected:** Can only undo up to 50 operations

**Expected Result:**

- History capped at 50 snapshots
- Oldest snapshots are discarded
- No memory leaks

---

### Test 8: Cross-Editor Independence

**Purpose:** Verify workflow and BT editors have separate history

**Test Steps:**

1. Open workflow editor
2. Add 3 nodes
3. Close workflow editor
4. Open behavior tree editor
5. Add 2 nodes
6. **Test:** Undo in BT editor
   - **Expected:** Only BT nodes should undo, workflow history unaffected
7. Close BT editor
8. Reopen workflow editor
9. **Test:** Undo in workflow editor
   - **Expected:** Workflow nodes should still be in history

**Expected Result:**

- Each editor maintains independent history
- History persists across panel close/open (within same session)

---

## Integration Testing

### Test 9: Full Workflow - Create, Edit, Undo, Analytics

**Combined Test:**

1. Open workflow editor (track panel_opened)
2. Add 5 different node types (track each node_added)
3. Connect nodes with edges
4. Save workflow (track workflow_saved)
5. Undo 3 times (track undo_performed × 3)
6. Redo 2 times (track redo_performed × 2)
7. Add 1 more node (track node_added)
8. Save again (track workflow_saved)
9. Close panel (track panel_closed with accurate duration)

**Expected Analytics Events (in order):**

```
1. panel_opened
2. workflow_node_added (×5)
3. workflow_saved
4. undo_performed (×3)
5. redo_performed (×2)
6. workflow_node_added
7. workflow_saved
8. panel_closed
```

**Expected Result:**

- All events fire in correct order
- No duplicate events
- No missing events
- Duration calculated correctly (difference between open and close)

---

## Performance Testing

### Test 10: Large History Performance

**Test:**

```javascript
// Browser console - simulate 50 rapid operations
for (let i = 0; i < 50; i++) {
  // Add node
  // Wait 600ms (longer than debounce)
}
// Measure memory usage
console.log(performance.memory);
```

**Expected Result:**

- Memory usage remains stable
- Undo/redo remain responsive
- No performance degradation

---

### Test 11: Analytics Overhead

**Test:**

```javascript
// Disable analytics
const startTime = performance.now();
// Perform 100 operations
const endTime = performance.now();
console.log('Time without analytics:', endTime - startTime);

// Enable analytics
const startTime2 = performance.now();
// Perform 100 operations
const endTime2 = performance.now();
console.log('Time with analytics:', endTime2 - startTime2);
```

**Expected Result:**

- Analytics overhead < 5% of operation time
- No noticeable lag during normal usage

---

## Error Handling Testing

### Test 12: Invalid History State

**Test Steps:**

1. Manually corrupt history state:
   ```javascript
   // Browser console
   history.pushSnapshot(null);
   history.pushSnapshot(undefined);
   history.pushSnapshot({});
   ```
2. Try to undo/redo
   - **Expected:** Graceful degradation, no crashes

**Expected Result:**

- Errors caught and handled
- UI remains functional
- Console shows helpful error message

---

### Test 13: Analytics Failure Resilience

**Test Steps:**

1. Simulate gtag unavailable:
   ```javascript
   // Browser console
   delete window.gtag;
   ```
2. Perform tracked operations
   - **Expected:** No errors, operations continue normally

**Expected Result:**

- Analytics failures don't break functionality
- Fallback to console-only logging
- No error spam in console

---

## Browser Console Testing Scripts

### Script 1: Verify Analytics Integration

```javascript
// Run in browser console after opening workflow editor

// Check analytics functions exist
console.log('trackWorkflowNodeAdded:', typeof trackWorkflowNodeAdded);
console.log('trackPanelOpened:', typeof trackPanelOpened);

// Monitor analytics events
const originalGtag = window.gtag;
const events = [];
window.gtag = function (type, event, props) {
  events.push({ type, event, props });
  console.log('📊 Analytics Event:', event, props);
  if (originalGtag) originalGtag.apply(this, arguments);
};

// After performing some actions:
console.log('Total events tracked:', events.length);
console.log('Events:', events);
```

### Script 2: Test History State

```javascript
// Run in browser console in workflow editor

// Access history (if exposed or via React DevTools)
// Check current state
console.log('History length:', history.historyLength);
console.log('Current index:', history.currentIndex);
console.log('Can undo?', history.canUndo);
console.log('Can redo?', history.canRedo);

// Test undo
history.undo();
console.log('After undo - Current index:', history.currentIndex);

// Test redo
history.redo();
console.log('After redo - Current index:', history.currentIndex);
```

### Script 3: Trigger Test Events

```javascript
// Add test events to event monitor

const store = useOrchestrationStore.getState();

// Add 5 test events
for (let i = 0; i < 5; i++) {
  store.addEvent({
    id: `test${i}`,
    topic: `test.topic${i % 2}`,
    payload: { iteration: i, message: `Test event ${i}` },
    senderId: `agent${i % 3}`,
    timestamp: Date.now() + i,
    receivedBy: [`receiver${i % 2}`],
  });
}

console.log('Added 5 test events');
console.log('Total events:', store.events.length);
```

---

## Known Issues & Limitations

### Pre-Existing Issues (Not Phase 2 Related)

1. ⚠️ **SceneGraphPanel.tsx** - Icon type inference error (line 154)
   - **Status:** Unrelated to Phase 2, blocking build
   - **Impact:** Does not affect orchestration features
   - **Next Step:** Requires separate fix

### Phase 2 Limitations

1. **History persistence:** History is not persisted to localStorage (session-only)
   - **Future:** Phase 1 auto-save will add persistence
2. **Analytics backend:** Only logs to console in dev mode (gtag integration passive)
   - **Future:** Production deployment will enable full analytics

---

## Success Criteria

**Phase 2 is considered VERIFIED if:**

- [ ] All manual tests pass without errors
- [ ] Undo/redo works in both workflow and BT editors
- [ ] Keyboard shortcuts (Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y) function correctly
- [ ] Undo/redo buttons show correct disabled states
- [ ] All analytics events fire with correct properties
- [ ] Panel duration tracking is accurate
- [ ] Debouncing prevents excessive snapshots
- [ ] History cap of 50 snapshots is enforced
- [ ] No performance degradation with large histories
- [ ] No console errors during normal operation
- [ ] Analytics failures don't break functionality

---

## Next Steps After Verification

1. **If all tests pass:**
   - Mark Phase 2 as ✅ VERIFIED
   - Update roadmap status
   - Consider starting Phase 3 or Phase 1 remaining tasks

2. **If tests fail:**
   - Document failures in detail
   - Create bug reports with reproduction steps
   - Fix issues before proceeding

3. **Optional enhancements:**
   - Add unit tests for useOrchestrationHistory
   - Add unit tests for analytics functions
   - Create E2E test suite with Playwright/Cypress

---

## Quick Start Testing Commands

```bash
# Start dev server
cd packages/studio
pnpm dev

# Open browser to http://localhost:3100/create

# Open DevTools console

# Run manual tests from this document

# Check for analytics events (filter console for "[Analytics]")

# Test undo/redo with Ctrl+Z / Ctrl+Shift+Z

# Verify no errors in console
```

---

**Last Updated:** 2026-02-28
**Verified By:** _[Your name]_
**Status:** 🔄 Ready for Testing
