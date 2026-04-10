import { describe, it, expect } from 'vitest';
import { HoloScriptPlusParser } from './HoloScriptPlusParser';

describe('Reproduction - Validation Failures', () => {
  const parser = new HoloScriptPlusParser({ strict: false });

  it('Parses Lyra the Ranger correctly', () => {
    const source = `npc "Lyra the Ranger" {
      type: "companion",
      model: "human_female_ranger",
      geometry: { type: "humanoid", height: 1.68, width: 0.45, depth: 0.35 },
      material: {
        skinColor: "#c9a872",
        hair: { color: "#8B4513", style: "ponytail" },
        armor: {
          color: "#2d4a2d",
          roughness: 0.7,
        }
      }
    }`;
    const result = parser.parse(source);
    if (!result.success) {
      console.error(result.errors);
    }
    expect(result.success).toBe(true);
  });
});
