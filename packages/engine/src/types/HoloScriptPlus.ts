/**
 * Minimal HoloScript+ node shape used by extracted engine scene modules.
 */

export interface HSPlusNode {
  id?: string;
  type?: string;
  properties?: Record<string, unknown>;
  traits?: Map<string, unknown>;
  children?: HSPlusNode[];
}
