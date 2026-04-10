import { z } from 'zod';

/**
 * Unified schema for classifying and reporting errors across the HoloScript Studio ecosystem.
 */
export const UnifiedErrorSchema = z.object({
  category: z.enum(['render', 'webgl', 'network', 'compiler', 'unknown']),
  message: z.string(),
  astPath: z.string(),
  recoverable: z.boolean(),
  suggestion: z.string(),
  rawStack: z.string().optional(),
});

export type UnifiedError = z.infer<typeof UnifiedErrorSchema>;

/**
 * Extracts a simplified AST-like path from a React componentStack.
 * React stacks look like:
 *   at MeshNode (file.tsx:10:5)
 *   at SceneContent (file.tsx:20:5)
 *
 * We convert this to: "SceneContent > MeshNode"
 */
export function extractASTPathFromStack(componentStack: string | undefined): string {
  if (!componentStack) return 'Unknown Node';

  const lines = componentStack.split('\n').filter((line) => line.trim().startsWith('at '));
  const components = lines
    .map((line) => {
      const match = line.match(/at\s+([A-Za-z0-9_]+)/);
      return match ? match[1] : null;
    })
    .filter(Boolean) as string[];

  if (components.length === 0) return 'Root';

  // The stack is deepest-first (bottom up). We reverse it to get top-down,
  // then take the last 3-4 components for a concise AST path.
  const path = components.reverse().slice(-4).join(' > ');
  return path || 'Root';
}
