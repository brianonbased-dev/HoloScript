import { MaterialEditor } from './MaterialEditor';

/**
 * Names of built-in PBR presets from {@link MaterialEditor.getPresets}.
 *
 * Use these for Studio “one-click” material chips: each entry is a full `MaterialDef`
 * archetype (metal, glass, emissive, etc.). Trait-visual catalogs under
 * `traits/visual/presets` are separate semantic overlays and are not listed here.
 */
export function listMaterialEditorQuickPickPresetNames(): readonly string[] {
  return MaterialEditor.getPresets().map((p) => p.name);
}

/** Group quick-pick preset names by editor category (Metal, Transparent, …). */
export function listMaterialEditorQuickPickPresetsByCategory(): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const p of MaterialEditor.getPresets()) {
    const list = m.get(p.category) ?? [];
    list.push(p.name);
    m.set(p.category, list);
  }
  return m;
}
