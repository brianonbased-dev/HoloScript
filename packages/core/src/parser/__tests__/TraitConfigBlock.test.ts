import { describe, expect, it } from 'vitest';
import { HoloCompositionParser } from '../HoloCompositionParser';

describe('Trait Config Block Parsing', () => {
  it('should parse block-style trait config in object before the body', () => {
    const source = `
      composition "test" {
        object "my_obj" @text { variant: "h1", content: "Hello", size: 42 } {
        }
      }
    `;
    const parser = new HoloCompositionParser();
    const result = parser.parse(source);
    expect(result.success).toBe(true);

    const obj = result.ast!.objects[0];
    expect(obj.traits).toBeDefined();
    expect(obj.traits[0].name).toBe('text');
    expect(obj.traits[0].config).toEqual({
      variant: 'h1',
      content: 'Hello',
      size: 42,
    });
  });

  it('should parse colon block-style trait config in object body', () => {
    const source = `
      composition "test" {
        object "my_obj" {
          @role: { name: "guide", priority: 2 }
        }
      }
    `;
    const parser = new HoloCompositionParser();
    const result = parser.parse(source);
    expect(result.success).toBe(true);

    const obj = result.ast!.objects[0];
    expect(obj.traits).toBeDefined();
    expect(obj.traits[0].name).toBe('role');
    expect(obj.traits[0].config).toEqual({
      name: 'guide',
      priority: 2,
    });
  });

  it('should parse colon scalar trait config as positional value', () => {
    const source = `
      composition "test" {
        object "my_obj" {
          @billboard: true
        }
      }
    `;
    const parser = new HoloCompositionParser();
    const result = parser.parse(source);
    expect(result.success).toBe(true);

    const obj = result.ast!.objects[0];
    expect(obj.traits[0].name).toBe('billboard');
    expect(obj.traits[0].config).toEqual({
      _arg0: true,
    });
  });

  it('should keep no-config pre-body traits distinct from object bodies', () => {
    const source = `
      composition "test" {
        object "my_obj" @collidable {
          color: "red"
        }
      }
    `;
    const parser = new HoloCompositionParser();
    const result = parser.parse(source);
    expect(result.success).toBe(true);

    const obj = result.ast!.objects[0];
    expect(obj.traits[0].name).toBe('collidable');
    expect(obj.traits[0].config).toEqual({});
    expect(obj.properties[0]).toMatchObject({
      key: 'color',
      value: 'red',
    });
  });

  it('should parse block-style trait config in template', () => {
    const source = `
      composition "test" {
        template "my_tmpl" {
          @ui_panel { width: 500, height: 300, responsive: true }
        }
      }
    `;
    const parser = new HoloCompositionParser();
    const result = parser.parse(source);
    expect(result.success).toBe(true);

    const tmpl = result.ast!.templates[0];
    expect(tmpl.traits).toBeDefined();
    expect(tmpl.traits[0].name).toBe('ui_panel');
    expect(tmpl.traits[0].config).toEqual({
      width: 500,
      height: 300,
      responsive: true,
    });
  });

  it('should parse parenthesized trait configs identically', () => {
    const source = `
      composition "test" {
        object "my_obj" @text(variant: "h1", content: "Hello", size: 42) {
        }
      }
    `;
    const parser = new HoloCompositionParser();
    const result = parser.parse(source);
    expect(result.success).toBe(true);

    const obj = result.ast!.objects[0];
    expect(obj.traits).toBeDefined();
    expect(obj.traits[0].name).toBe('text');
    expect(obj.traits[0].config).toEqual({
      variant: 'h1',
      content: 'Hello',
      size: 42,
    });
  });
});
