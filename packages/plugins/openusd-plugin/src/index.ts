/**
 * @holoscript/openusd-plugin — OpenUSD interop stub.
 *
 * Targets the paper-12 "OpenUSD proxy LOC" bucket by providing a real USDA
 * export from a .holo composition tree. Current scope: stub interface + single
 * canonical USDA template emitted. Replaces the static OPENUSD_EQUIVALENT_PROXY
 * string in packages/comparative-benchmarks/src/paper12PluginProbe.ts.
 *
 * Status: STUB. Round-trip parity + pxr binding are future work.
 * Research: ai-ecosystem/research/2026-04-23_openusd-holoscript-robotics-frontend.md
 * Paper:    memory/paper-12-plugin-openusd-probe.md
 */

export interface UsdaExportInput {
  name: string;
  stage?: 'world' | 'anim' | 'look';
  primitives?: Array<{
    kind: 'xform' | 'mesh' | 'light';
    path: string;
    attrs?: Record<string, string | number | number[]>;
  }>;
}

export interface UsdaExportOutput {
  usda: string;
  loc: number;
  primitive_count: number;
}

/**
 * Export a minimal .holo-derived scene to USDA (ASCII USD) text.
 * This is a STUB — structure is valid USDA, but semantic fidelity is
 * hand-authored for paper-12 benchmark parity.
 */
export function exportToUsda(input: UsdaExportInput): UsdaExportOutput {
  const lines: string[] = [];
  lines.push('#usda 1.0');
  lines.push('(');
  lines.push('  defaultPrim = "World"');
  lines.push('  metersPerUnit = 1.0');
  lines.push('  upAxis = "Y"');
  lines.push(')');
  lines.push('');
  lines.push(`def Xform "World"`);
  lines.push('{');

  const prims: NonNullable<UsdaExportInput['primitives']> = input.primitives ?? [
    { kind: 'xform', path: 'root' },
  ];
  for (const prim of prims) {
    const typeName = prim.kind === 'mesh' ? 'Mesh' : prim.kind === 'light' ? 'SphereLight' : 'Xform';
    lines.push(`    def ${typeName} "${prim.path.replace(/\W/g, '_')}"`);
    lines.push('    {');
    for (const [k, v] of Object.entries(prim.attrs ?? {})) {
      if (Array.isArray(v)) lines.push(`        float3 ${k} = (${v.join(', ')})`);
      else if (typeof v === 'number') lines.push(`        float ${k} = ${v}`);
      else lines.push(`        string ${k} = "${String(v).replace(/"/g, '\\"')}"`);
    }
    lines.push('    }');
  }

  lines.push('}');
  lines.push('');

  const usda = lines.join('\n');
  const loc = lines.filter((l) => l.trim().length > 0).length;
  return { usda, loc, primitive_count: input.primitives?.length ?? 1 };
}

/** Minimal round-trip probe — re-parse emitted USDA to verify syntactic stability. */
export function usdaStableRoundTrip(input: UsdaExportInput): boolean {
  const out = exportToUsda(input);
  // Stub check: every declared primitive's sanitized path appears in the emitted text.
  const prims = input.primitives ?? [];
  for (const p of prims) {
    const sanitized = p.path.replace(/\W/g, '_');
    if (!out.usda.includes(`"${sanitized}"`)) return false;
  }
  return true;
}
