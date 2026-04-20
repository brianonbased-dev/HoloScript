import { describe, it, expect } from 'vitest';
import {
  getMaterialEditorBuiltinPresets,
  listMaterialEditorQuickPickPresetNames,
  listMaterialEditorQuickPickPresetsByCategory,
} from '../materialPresetQuickPick';

describe('materialPresetQuickPick', () => {
  it('getMaterialEditorBuiltinPresets matches getPresets length', () => {
    expect(getMaterialEditorBuiltinPresets().length).toBe(
      listMaterialEditorQuickPickPresetNames().length
    );
  });

  it('exposes all MaterialEditor presets as quick-pick names', () => {
    const names = listMaterialEditorQuickPickPresetNames();
    expect(names.length).toBeGreaterThanOrEqual(10);
    expect(names).toContain('Glass');
    expect(names).toContain('Metal');
    expect(names).toContain('Neon');
  });

  it('groups presets by category for toolbar columns', () => {
    const byCat = listMaterialEditorQuickPickPresetsByCategory();
    expect(byCat.get('Metal')?.length).toBeGreaterThanOrEqual(1);
    expect(byCat.get('Transparent')?.join(',')).toContain('Glass');
  });
});
