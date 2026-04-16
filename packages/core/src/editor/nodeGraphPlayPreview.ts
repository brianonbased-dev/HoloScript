/**
 * Emit minimal HoloScript preview text from a evaluated logic graph so
 * PlayModeController.executeGeneratedScript uses the same path as Copilot.
 */
import type { NodeGraph } from '../logic/NodeGraph';
import type { NodeGraphExecutionResult } from './NodeGraphPanel';

function slug(s: string, max = 48): string {
  let t = s.replace(/[^\w]+/g, '_').replace(/^_|_$/g, '') || 'Graph';
  if (t.length > max) t = t.slice(0, max);
  if (!/^[A-Za-z_]/.test(t)) t = `g_${t}`;
  return t;
}

/**
 * Builds a tiny parseable composition that exercises the same preview pipeline
 * as AI-generated HoloScript. Execution metadata is not executed as code;
 * it is only reflected in stable naming for logs/debugging.
 */
export function emitPreviewHoloScriptFromNodeGraphExecution(
  execution: NodeGraphExecutionResult,
  graph: NodeGraph
): string {
  const order = execution.nodeOrder.join('__');
  const name = slug(`Preview_${graph.id}_${order}`, 56);
  return `composition "NodeGraph_${name}" {\n  object "RunMarker_${name}" {\n    position: [0, 1.45, -0.8]\n  }\n}\n`;
}
