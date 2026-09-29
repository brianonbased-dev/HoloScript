// holo:absorb — HoloAbsorb as a HoloScript capability module (gap G21, phase 1).
//
// Each declaration pairs an @host block (the function it governs, the authority a caller needs,
// and the ABI version) with a typed exported function. The body says what the call means with
// no host: the value is unknown, with a reason. Engines never run the body; they bind the call
// to the host or refuse it (phase 2). The checker embeds this file, so what `holo:absorb` means
// is part of the checker build.

@host { function: "manifest_audit_passes", authority: "holo_absorb_manifest", version: 1 }

// True when HoloAbsorb's product manifest passes its own audit (auditHoloAbsorbManifest in
// packages/absorb-service/src/holoabsorb/index.ts, the function behind MCP tool
// holo_absorb_manifest). Pure: no network.
export function manifest_audit_passes(): bool {
  return unknown("holo:absorb/manifest_audit_passes needs a host")
}
