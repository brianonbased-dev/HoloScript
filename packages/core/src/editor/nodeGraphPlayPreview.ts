/**
 * Emit a minimal HoloScript+ preview string from a {@link NodeGraphPanel.executeGraph} result.
 * Used by Studio's node graph execution bridge when the graph maps to core evaluators.
 */

import type { NodeGraph } from '../logic/NodeGraph';
import type { NodeGraphExecutionResult } from './NodeGraphPanel';

export function emitPreviewHoloScriptFromNodeGraphExecution(
  execution: NodeGraphExecutionResult,
  graph: NodeGraph
): string {
  const lines: string[] = [
    '// HoloScript+ preview emitted from NodeGraph execution',
    `// graph_id: ${graph.id}`,
    `// node_order: ${execution.nodeOrder.join(' -> ')}`,
  ];

  let n = 0;
  const maxRows = 24;
  for (const [nodeId, rec] of execution.outputs) {
    if (n >= maxRows) {
      lines.push(`// ... outputs truncated (${execution.outputs.size} total)`);
      break;
    }
    lines.push(`// out ${nodeId}: ${JSON.stringify(rec)}`);
    n++;
  }

  lines.push('');
  lines.push('object "nodegraph_preview" {');
  lines.push('  @transform(position: [0, 0, 0])');
  lines.push('}');
  return lines.join('\n');
}
