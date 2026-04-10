import { describe, it, expect, beforeEach } from 'vitest';
import { HoloScriptPlusParser } from '../parser/HoloScriptPlusParser';

describe('HotReloadSyntax', () => {
  let parser: HoloScriptPlusParser;

  beforeEach(() => {
    parser = new HoloScriptPlusParser();
  });

  it('should parse top-level @version and @migrate directives', () => {
    const source = `
@version(2)
@migrate from(1) {
  state.newValue = state.oldValue;
  props.newProp = props.oldProp;
  renameProperty("oldName", "newName");
}

orb cube_1 {
  position: [0, 1, 0]
}
`;
    const result = parser.parse(source);
    expect(result.success).toBe(true);
    expect(result.ast.version).toBe(2);
    expect(result.ast.migrations).toBeDefined();
    expect(result.ast.migrations.length).toBe(1);
    expect(result.ast.migrations[0].fromVersion).toBe(1);
    expect(result.ast.migrations[0].body).toContain('state . newValue = state . oldValue');
  });

  it('should parse @version and @migrate inside templates', () => {
    const source = `
template "VulnerableBot" {
  @version(3)
  @migrate from(2) {
    state.health = 100;
  }
  
  @physics
  health: 100
}
`;
    const result = parser.parse(source);
    expect(result.success).toBe(true);

    const template = result.ast.children.find((c: any) => c.type === 'template');
    expect(template).toBeDefined();
    expect(template.version).toBe(3);
    expect(template.migrations).toBeDefined();
    expect(template.migrations.length).toBe(1);
    expect(template.migrations[0].fromVersion).toBe(2);
    expect(template.migrations[0].body).toContain('state . health = 100');
  });

  it('should handle multiple migration steps', () => {
    const source = `
@version(3)
@migrate from(1) { state.v = 1; }
@migrate from(2) { state.v = 2; }

orb o {}
`;
    const result = parser.parse(source);
    expect(result.success).toBe(true);
    expect(result.ast.version).toBe(3);
    expect(result.ast.migrations.length).toBe(2);
    expect(result.ast.migrations[0].fromVersion).toBe(1);
    expect(result.ast.migrations[1].fromVersion).toBe(2);
  });
});
