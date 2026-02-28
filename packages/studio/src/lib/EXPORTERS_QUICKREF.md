# Export Functions - Quick Reference

## Import Statement
```typescript
import {
  // Core Export Functions
  exportWorkflow,
  exportWorkflowAsTS,
  exportBehaviorTree,
  exportEventsAsCSV,
  exportEventsAsJSON,

  // Download Helpers
  downloadFile,
  downloadWorkflowJSON,
  downloadWorkflowTS,
  downloadBehaviorTreeJSON,
  downloadEventsCSV,
  downloadEventsJSON,
} from '@/lib/exporters';
```

## Quick Usage

### Export Workflow
```typescript
// JSON format
downloadWorkflowJSON(workflow);
downloadWorkflowJSON(workflow, 'custom-name.json');

// TypeScript module
downloadWorkflowTS(workflow);
downloadWorkflowTS(workflow, 'custom-name.ts');
```

### Export Behavior Tree
```typescript
const tree = behaviorTrees.get(treeId);
downloadBehaviorTreeJSON(tree.nodes, treeId);
downloadBehaviorTreeJSON(tree.nodes, treeId, 'custom-name.json');
```

### Export Events
```typescript
// CSV format (Excel-compatible)
downloadEventsCSV(events);
downloadEventsCSV(events, 'custom-name.csv');

// JSON format
downloadEventsJSON(events);
downloadEventsJSON(events, 'custom-name.json');
```

## React Component Example
```typescript
import { useOrchestrationStore } from '@/lib/orchestrationStore';
import { downloadWorkflowJSON } from '@/lib/exporters';

function ExportButton() {
  const workflow = useOrchestrationStore((state) =>
    state.workflows.get(state.activeWorkflow)
  );

  return (
    <button
      onClick={() => workflow && downloadWorkflowJSON(workflow)}
      disabled={!workflow}
    >
      Export Workflow
    </button>
  );
}
```

## All Functions

| Function | Purpose | Returns |
|----------|---------|---------|
| `exportWorkflow` | Workflow → JSON string | `string` |
| `exportWorkflowAsTS` | Workflow → TypeScript code | `string` |
| `exportBehaviorTree` | BT nodes → JSON string | `string` |
| `exportEventsAsCSV` | Events → CSV string | `string` |
| `exportEventsAsJSON` | Events → JSON string | `string` |
| `downloadFile` | Trigger browser download | `void` |
| `downloadWorkflowJSON` | Download workflow as JSON | `void` |
| `downloadWorkflowTS` | Download workflow as TS | `void` |
| `downloadBehaviorTreeJSON` | Download BT as JSON | `void` |
| `downloadEventsCSV` | Download events as CSV | `void` |
| `downloadEventsJSON` | Download events as JSON | `void` |

## Default Filenames

| Type | Pattern |
|------|---------|
| Workflow JSON | `{name}-{id}.json` |
| Workflow TS | `{name}-{id}.ts` |
| Behavior Tree | `behavior-tree-{treeId}.json` |
| Events CSV/JSON | `agent-events-{timestamp}.{ext}` |

## For More Details
See: `EXPORTERS_README.md`
