# Export Utility Functions - HoloScript Studio

## Overview

The `exporters.ts` module provides comprehensive export functionality for HoloScript Studio orchestration panels, enabling users to export workflows, behavior trees, and event logs in multiple formats.

## File Location

`packages/studio/src/lib/exporters.ts`

## Supported Export Formats

### 1. Workflow Export
- **JSON Format** - Standard JSON for data interchange
- **TypeScript Format** - Typed TypeScript module for code integration

### 2. Behavior Tree Export
- **JSON Format** - Complete behavior tree structure

### 3. Event Log Export
- **CSV Format** - Spreadsheet-compatible format for analysis
- **JSON Format** - Structured data format

## API Reference

### Core Export Functions

#### `exportWorkflow(workflow: AgentWorkflow): string`
Exports a workflow as formatted JSON string.

**Example:**
```typescript
const workflowJSON = exportWorkflow(myWorkflow);
console.log(workflowJSON);
```

#### `exportWorkflowAsTS(workflow: AgentWorkflow): string`
Exports a workflow as a TypeScript module with proper type annotations.

**Example:**
```typescript
const workflowModule = exportWorkflowAsTS(myWorkflow);
// Save to file or copy to clipboard
```

**Output:**
```typescript
import { AgentWorkflow } from '@/lib/orchestrationStore';

export const myWorkflowWorkflow: AgentWorkflow = {
  // ... workflow data
};
```

#### `exportBehaviorTree(tree: BTNode[]): string`
Exports behavior tree nodes as formatted JSON string.

**Example:**
```typescript
const btJSON = exportBehaviorTree(behaviorTreeNodes);
```

#### `exportEventsAsCSV(events: AgentEvent[]): string`
Exports events as CSV format with proper escaping for Excel/spreadsheet compatibility.

**CSV Format:**
```csv
timestamp,topic,senderId,receivedBy,payload
1772271967567,"scene.created","art-director","animator;physics","{""sceneId"":""scene_001""}"
```

**Example:**
```typescript
const eventsCSV = exportEventsAsCSV(eventLog);
```

#### `exportEventsAsJSON(events: AgentEvent[]): string`
Exports events as formatted JSON array.

**Example:**
```typescript
const eventsJSON = exportEventsAsJSON(eventLog);
```

### Download Helper Functions

#### `downloadFile(content: string, filename: string, mimeType?: string): void`
Low-level function to trigger browser file download.

**Parameters:**
- `content` - String content to download
- `filename` - Desired filename
- `mimeType` - MIME type (default: `application/json`)

**Example:**
```typescript
downloadFile(jsonContent, 'data.json', 'application/json');
```

### Convenience Wrapper Functions

#### `downloadWorkflowJSON(workflow: AgentWorkflow, filename?: string): void`
Exports and downloads workflow as JSON file.

**Example:**
```typescript
// Auto-generated filename: "Scene Pipeline-workflow_123.json"
downloadWorkflowJSON(workflow);

// Custom filename
downloadWorkflowJSON(workflow, 'my-custom-workflow.json');
```

#### `downloadWorkflowTS(workflow: AgentWorkflow, filename?: string): void`
Exports and downloads workflow as TypeScript module.

**Example:**
```typescript
// Auto-generated filename: "Scene Pipeline-workflow_123.ts"
downloadWorkflowTS(workflow);
```

#### `downloadBehaviorTreeJSON(tree: BTNode[], treeId: string, filename?: string): void`
Exports and downloads behavior tree as JSON file.

**Example:**
```typescript
downloadBehaviorTreeJSON(btNodes, 'main-tree');
// Downloads: "behavior-tree-main-tree.json"
```

#### `downloadEventsCSV(events: AgentEvent[], filename?: string): void`
Exports and downloads events as CSV file with timestamp.

**Example:**
```typescript
downloadEventsCSV(eventLog);
// Downloads: "agent-events-2026-02-28T12-30-45-000Z.csv"
```

#### `downloadEventsJSON(events: AgentEvent[], filename?: string): void`
Exports and downloads events as JSON file with timestamp.

**Example:**
```typescript
downloadEventsJSON(eventLog);
// Downloads: "agent-events-2026-02-28T12-30-45-000Z.json"
```

## Integration with Orchestration Store

### React Component Example

```typescript
import { useOrchestrationStore } from './orchestrationStore';
import { downloadWorkflowJSON, downloadEventsCSV } from './exporters';

function WorkflowExportButton() {
  const workflows = useOrchestrationStore((state) => state.workflows);
  const activeWorkflow = useOrchestrationStore((state) => state.activeWorkflow);

  const handleExport = () => {
    if (!activeWorkflow) return;
    const workflow = workflows.get(activeWorkflow);
    if (workflow) {
      downloadWorkflowJSON(workflow);
    }
  };

  return (
    <button onClick={handleExport} disabled={!activeWorkflow}>
      Export Workflow
    </button>
  );
}
```

### Event Log Export Component

```typescript
function EventLogExportButton() {
  const events = useOrchestrationStore((state) => state.events);

  return (
    <div className="export-buttons">
      <button onClick={() => downloadEventsCSV(events)}>
        Export as CSV
      </button>
      <button onClick={() => downloadEventsJSON(events)}>
        Export as JSON
      </button>
    </div>
  );
}
```

### Behavior Tree Export Component

```typescript
function BehaviorTreeExportButton() {
  const behaviorTrees = useOrchestrationStore((state) => state.behaviorTrees);
  const activeBehaviorTree = useOrchestrationStore((state) => state.activeBehaviorTree);

  const handleExport = () => {
    if (!activeBehaviorTree) return;
    const tree = behaviorTrees.get(activeBehaviorTree);
    if (tree) {
      downloadBehaviorTreeJSON(tree.nodes, activeBehaviorTree);
    }
  };

  return (
    <button onClick={handleExport} disabled={!activeBehaviorTree}>
      Export Behavior Tree
    </button>
  );
}
```

## Usage in Studio UI

### Recommended UI Patterns

1. **Export Dropdown Menu**
```typescript
<DropdownMenu>
  <DropdownMenuTrigger>Export</DropdownMenuTrigger>
  <DropdownMenuContent>
    <DropdownMenuItem onClick={() => downloadWorkflowJSON(workflow)}>
      Workflow (JSON)
    </DropdownMenuItem>
    <DropdownMenuItem onClick={() => downloadWorkflowTS(workflow)}>
      Workflow (TypeScript)
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

2. **Export Dialog with Format Selection**
```typescript
const [format, setFormat] = useState<'json' | 'ts'>('json');

<Dialog>
  <DialogTrigger>Export Workflow</DialogTrigger>
  <DialogContent>
    <Select value={format} onValueChange={setFormat}>
      <SelectItem value="json">JSON</SelectItem>
      <SelectItem value="ts">TypeScript</SelectItem>
    </Select>
    <Button onClick={() => {
      if (format === 'json') downloadWorkflowJSON(workflow);
      else downloadWorkflowTS(workflow);
    }}>
      Download
    </Button>
  </DialogContent>
</Dialog>
```

## File Naming Conventions

### Auto-Generated Filenames

- **Workflows:** `{workflow.name}-{workflow.id}.{json|ts}`
  - Example: `Scene Generation Pipeline-workflow_123.json`

- **Behavior Trees:** `behavior-tree-{treeId}.json`
  - Example: `behavior-tree-main-tree.json`

- **Events:** `agent-events-{ISO-timestamp}.{csv|json}`
  - Example: `agent-events-2026-02-28T12-30-45-000Z.csv`

### Custom Filenames

All download functions accept an optional `filename` parameter for custom naming:

```typescript
downloadWorkflowJSON(workflow, 'production-pipeline.json');
downloadEventsCSV(events, 'qa-session-events.csv');
```

## CSV Format Specification

### Header Row
```
timestamp,topic,senderId,receivedBy,payload
```

### Data Row Format
- **timestamp** - Unix timestamp (milliseconds)
- **topic** - Event topic string (quoted)
- **senderId** - Sender agent ID (quoted)
- **receivedBy** - Semicolon-separated receiver IDs (quoted)
- **payload** - JSON string with escaped quotes (quoted)

### Excel Compatibility
- All fields are properly quoted
- JSON payloads have double-escaped quotes (`""`)
- Receiver arrays use semicolon separator (Excel-friendly)

## TypeScript Module Format

Exported TypeScript modules include:
1. Proper type import from orchestrationStore
2. Named export with workflow ID prefix
3. Full type annotation for IntelliSense support
4. Pretty-printed JSON for readability

**Example Output:**
```typescript
import { AgentWorkflow } from '@/lib/orchestrationStore';

export const workflow_1234567890_abc123Workflow: AgentWorkflow = {
  "id": "workflow_1234567890_abc123",
  "name": "Scene Generation Pipeline",
  "description": "Multi-agent workflow for creating 3D scenes",
  "nodes": [...],
  "edges": [...],
  "createdAt": "2026-02-28T10:00:00.000Z",
  "updatedAt": "2026-02-28T11:30:00.000Z"
};
```

## Testing

Test file with sample data and usage examples: `exporters.test.ts`

Run tests:
```bash
npx tsx src/lib/exporters.test.ts
```

## Type Definitions

All types are imported from `orchestrationStore.ts`:
- `AgentWorkflow` - Complete workflow structure
- `BTNode` - Behavior tree node
- `AgentEvent` - Event bus event

## Browser Compatibility

Download functionality uses standard browser APIs:
- `Blob` - All modern browsers
- `URL.createObjectURL` - All modern browsers
- `document.createElement('a')` - Universal support

No external dependencies required for export functionality.

## Future Enhancements

Potential additions for Phase 2:
1. **Import Functions** - Parse and validate imported workflows
2. **XML/YAML Formats** - Additional export formats
3. **Batch Export** - Export multiple workflows at once
4. **Cloud Export** - Direct export to cloud storage
5. **Clipboard Copy** - Copy exports to clipboard
6. **Pretty Print Options** - Configurable indentation and formatting
7. **Filtering/Transformation** - Export subsets or transformed data

## Related Files

- `orchestrationStore.ts` - Type definitions and state management
- `exporters.test.ts` - Usage examples and test data
- Phase 1 roadmap documentation

## Questions or Issues

For questions or issues with export functionality, refer to:
1. This README
2. Test examples in `exporters.test.ts`
3. Type definitions in `orchestrationStore.ts`
