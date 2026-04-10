import { describe, it, expect } from 'vitest';
import { HoloScriptPlusParser } from '../parser/HoloScriptPlusParser';

describe('HoloScript+ NPC & Dialog System', () => {
  const parser = new HoloScriptPlusParser();

  it('Parses @npc directive with properties', () => {
    const source = `
      @npc "TownGuide" {
        model: "robot_v2"
        idle_anim: "wave"
        interaction_range: 5.0
        start_dialog: "welcome"
      }
    `;
    const result = parser.parse(source);
    expect(result.success).toBe(true);

    // Assert structure
    const directives = (result.ast.root.directives || result.ast.body) as any[];
    const npc = directives.find((d: any) => d.type === 'npc');
    expect(npc).toBeDefined();
    expect(npc.name).toBe('TownGuide');
    expect(npc.props.model).toBe('robot_v2');
    expect(npc.props.interaction_range).toBe(5.0);
  });

  it('Parses @dialog directive with options', () => {
    const source = `
      @dialog "welcome" {
        text: "Hello traveler!"
        option "Hi there" -> "intro"
        option "Bye" -> @close
      }
    `;
    const result = parser.parse(source);
    expect(result.success).toBe(true);

    const directives = (result.ast.root.directives || result.ast.body) as any[];
    const dialog = directives.find((d: any) => d.type === 'dialog');
    expect(dialog).toBeDefined();
    expect(dialog.props.text).toBe('Hello traveler!');
    expect(dialog.options.length).toBe(2);
    expect(dialog.options[0].target).toBe('intro');
  });
});
