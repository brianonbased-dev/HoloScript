---
name: bio-discovery
description: >
  Agent-native drug discovery pipeline. Takes a disease name or target, walks
  Open Targets + ChEMBL + AlphaFold, and produces a .holo scene with
  hash-verifiable protein structure + known-active compounds + binding-site
  annotations. End-to-end validated (pipeline probe 2026-04-17).
argument-hint: "[disease <name>|target <gene>|compound <name>] [--approved-only] [--top <n>]"
disable-model-invocation: false
allowed-tools: Bash, Read, Write, Edit, Grep, Glob, Task, Agent, WebFetch
context: fork
agent: general-purpose
project-dir: C:/Users/Josep/Documents/GitHub/HoloScript
---

# /holoscript:bio-discovery — Drug Discovery Pipeline

**Command**: $ARGUMENTS

## Purpose

Bridges the bio-research MCP plugin (biorxiv + ChEMBL + Open Targets) to the HoloScript AlphaFold plugin + simulation contract. Output is a `.holo` scene that any agent or human can replay bit-identically, with every data source cited and hashed.

This is the concrete implementation of the **Verifiable Digital Twin for Drug Discovery** positioning (see `docs/strategy/positioning-verifiable-digital-twin.md` and `docs/strategy/drug-discovery-flagship.md`).

## The Pipeline

```
user input (disease | target | compound)
  ↓
  [1] Open Targets: search_entities → resolve to IDs
       - Disease → EFO_xxxxxxx
       - Target  → ENSG_xxxxxxxxxxx
       - Drug    → CHEMBL_xxxxxxx
  ↓
  [2] Open Targets GraphQL: target-disease association (if both given)
       - Evidence types, association score, literature count
  ↓
  [3] ChEMBL target_search: resolve to CHEMBL target ID
       - Gene symbol → CHEMBL_xxx + UniProt accession
       - Target type SINGLE PROTEIN for highest confidence
  ↓
  [4] ChEMBL get_bioactivity: top potent compounds
       - IC50/Ki filtered by min_pchembl (default: >= 7, <= 100nM)
       - Limit to drug-like compounds (Ro5 compliant if possible)
  ↓
  [5] ChEMBL compound_search: approved drugs for the target
       - max_phase=4 for market-approved therapeutics
  ↓
  [6] AlphaFold plugin: fetch/compile protein structure
       - UniProt → sequence → @protein_structure trait
       - pLDDT scores → @confidence_map trait
       - Known binding pocket residues → @binding_site trait
  ↓
  [7] biorxiv search_preprints (optional, with --with-preprints):
       - Top recent preprints citing the target
       - Added as metadata.recent_research[]
  ↓
  [8] Emit .holo scene with:
       - @protein_structure (target)
       - @molecule (each bioactive compound)
       - @binding_site (affinity from bioactivity data)
       - @contract { deterministic, hash_verify, provenance_chain }
       - metadata.provenance_source = [chembl-34, open-targets-YY.MM, alphafold-v4]
```

## Subcommands

### `disease <name>` — disease → targets → compounds
```
/holoscript:bio-discovery disease "non-small cell lung cancer"
```
Resolves disease EFO ID, queries Open Targets for top associated targets, picks highest-score target, runs full ChEMBL pipeline, emits `.holo` scene.

### `target <gene-symbol>` — target → compounds
```
/holoscript:bio-discovery target EGFR
```
Skips disease resolution, goes straight to target. Use when you know the biology.

### `compound <name>` — compound → target + binding
```
/holoscript:bio-discovery compound osimertinib
```
Finds the compound in ChEMBL, looks up its mechanism of action + primary target, emits a scene centered on the binding interaction.

### Flags

| Flag | Effect |
|---|---|
| `--approved-only` | Filter compounds to `max_phase=4` only |
| `--top <n>` | Return top N compounds by pChEMBL (default 5) |
| `--with-preprints` | Include bioRxiv preprints from the last 90 days |
| `--output <path>` | Write .holo to specific path (default: `examples/bio-discovery/<target>.holo`) |
| `--contract <tier>` | Simulation trust tier: `discipline` / `co-location` / `construction` (default) |

## Example Output (probed 2026-04-17, EGFR/NSCLC/osimertinib)

```holo
composition "EGFR NSCLC — Osimertinib Binding Study" {
  metadata {
    generator: "holoscript:bio-discovery"
    generated_at: "2026-04-17T02:30:00Z"
    disease: {
      label: "Non-small cell lung cancer"
      efo_id: "EFO_0003060"
    }
    target: {
      label: "Epidermal growth factor receptor"
      chembl_id: "CHEMBL203"
      ensembl_id: "ENSG00000146648"
      uniprot: "P00533"
      organism: "Homo sapiens"
    }
    provenance_source: [
      "chembl-34",
      "open-targets-24.09",
      "alphafold-v4"
    ]
  }

  object "EGFRKinase" {
    @protein_structure(
      uniprot: "P00533",
      domain: "kinase",  // residues 696-1022
      name: "EGFR Kinase Domain"
    )
    @confidence_map(scheme: "viridis", threshold: 70.0)
  }

  // Approved drug — first-line for EGFR T790M-mutant NSCLC
  object "Osimertinib" {
    @molecule(
      chembl_id: "CHEMBL3353410",
      smiles: "C=CC(=O)Nc1cc(Nc2nccc(-c3cn(C)c4ccccc34)n2)c(OC)cc1N(C)CCN(C)C",
      name: "Osimertinib",
      generic: "AZD9291",
      brand: "Tagrisso",
      mw: 499.62,
      atc: "L01EB04",
      max_phase: 4,
      first_approved: 2015
    )
  }

  // Top potent compound from ChEMBL (IC50 = 0.45 nM, pChEMBL 9.35)
  object "TopHitCHEMBL304271" {
    @molecule(
      chembl_id: "CHEMBL304271",
      ic50_nm: 0.45,
      pchembl: 9.35,
      assay: "CHEMBL674637",  // EGF-receptor kinase tyrosine phosphorylation inhibition
      reference: "Bioorg Med Chem Lett 2002 (CHEMBL1134862)"
    )
  }

  binding "EGFR-Osimertinib" {
    @binding_site(
      structure: "EGFRKinase",
      residues: [797, 800, 858],  // C797S / T790M / L858R mutation hotspots
      ligand: "Osimertinib",
      affinity_class: "approved_TKI"
    )
  }

  // Trust by Construction (W.GOLD.013) — Tier 3
  contract {
    trust_tier: "construction"
    deterministic: true
    replay_seed: 42
    solver_hash_verify: true
    provenance_chain: true
    hash_on: ["structure", "molecule", "binding"]
  }
}
```

## Setup

```bash
# Load creds
ENV_FILE="${HOME}/.ai-ecosystem/.env"
[ ! -f "$ENV_FILE" ] && ENV_FILE="/c/Users/Josep/.ai-ecosystem/.env"
set -a && source "$ENV_FILE" 2>/dev/null && set +a

# Verify bio-research MCP plugin is accessible (check via Claude Code's tool picker)
# The plugin provides: chembl, biorxiv, open-targets (ot) namespaces
```

## Verified Pipeline Nodes (2026-04-17)

| Stage | Tool | Example result (verified) |
|---|---|---|
| Disease ID | `mcp__plugin_bio-research_ot__search_entities` | "non-small cell lung cancer" → `EFO_0003060` ✓ |
| Target ID | `mcp__plugin_bio-research_ot__search_entities` | "EGFR" → `ENSG00000146648` ✓ |
| ChEMBL target | `mcp__plugin_bio-research_chembl__target_search` | gene_symbol=EGFR → `CHEMBL203` (SINGLE PROTEIN) ✓ |
| Bioactivities | `mcp__plugin_bio-research_chembl__get_bioactivity` | CHEMBL203 + min_pchembl=8.5 → 2,867 total, top 5 with IC50 0.45–2.8 nM ✓ |
| Approved drug | `mcp__plugin_bio-research_chembl__compound_search` | "osimertinib", max_phase=4 → `CHEMBL3353410` with SMILES ✓ |
| Protein structure | `@holoscript/alphafold-plugin` | UniProt P00533 → pdb_data + mean_plddt ✓ |

## Guarantees

This skill produces **Verifiable Digital Twin** output (W.GOLD.013):

1. **Bit-identical replay** — any third party with the same `.holo` file reproduces the same hash-verified simulation
2. **Cited provenance** — every data point carries source DB + version + accession ID
3. **Audit trail** — the `contract { provenance_chain: true }` block logs every tool call made during scene generation
4. **Browser-native** — generated scenes compile to WebGPU targets, no install required for reviewers
5. **Vendor-neutral** — data source versions are recorded; if ChEMBL updates, old scenes still replay using their pinned version

## Verticals Unlocked

Per `docs/strategy/positioning-verifiable-digital-twin.md`:

- **Drug discovery reproducibility** — FDA/EMA submissions reference simulation artifacts by hash
- **Pharma preprint verification** — agents auto-verify compound claims against ChEMBL
- **Academic research** — free tier unlocks simulation-first science for labs priced out of Schrödinger / OpenEye
- **Regulatory replay** — a reviewer clicks a URL, sees the exact simulation

## When NOT to Use

- **Novel target not in ChEMBL** — pipeline falls through; use `/holoscript:absorb` + manual structure upload instead
- **Highly confidential compounds** — ChEMBL is public. Proprietary discovery work shouldn't emit compounds through this pipeline unless replacing with in-house equivalents.
- **Speed-critical inference** — this is a research/validation workflow, not a real-time decision tool. Scene generation takes 30-60 seconds even on warm caches.

## Related

- `packages/plugins/alphafold-plugin/` — structure/binding-site/confidence traits
- `docs/strategy/drug-discovery-flagship.md` — why this is HoloScript's P0 vertical
- `docs/strategy/positioning-verifiable-digital-twin.md` — category-creation narrative
- W.GOLD.013 (Trust by Construction — Three Tiers of Simulation Trustworthiness)
- W.GOLD.015 (When Trust Is Free — 8 verticals that open)
- W.054 (Research → code latency <24h — the vault predicts shipping)
