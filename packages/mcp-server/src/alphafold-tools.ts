/**
 * AlphaFold MCP Tools
 *
 * Exposes @holoscript/alphafold-plugin capabilities as MCP tools so that
 * pipelines (.hs) and agents (Cursor, LangGraph, Claude) can fetch protein
 * structures from their UniProt accession without embedding the fetcher
 * logic in every caller.
 *
 * This is Track A step 2 from `docs/strategy/hs-streaming-audit-2026-04-17.md` —
 * the bridge that makes the drug-discovery-flagship.hs pipeline's Stage 5
 * (ProteinStructure source) a real MCP call rather than a stub.
 *
 * Backing data source: EBI AlphaFold Protein Structure Database.
 *   https://alphafold.ebi.ac.uk/api/prediction/{uniprot}
 *
 * The handler performs HTTP fetches; it deliberately does NOT run the
 * AlphaFold model locally (that's a GPU job). The EBI API returns the
 * pre-computed structure + confidence scores which is what the trait
 * system needs.
 *
 * @module alphafold-tools
 * @version 1.0.0
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';

// =============================================================================
// TOOL DECLARATIONS
// =============================================================================

export const alphafoldTools: Tool[] = [
  {
    name: 'alphafold_fetch_structure',
    description:
      'Fetch a pre-computed AlphaFold protein structure from the EBI AlphaFold database by UniProt accession. ' +
      'Returns PDB data, mean pLDDT confidence, per-residue confidence scores, and a suggested @protein_structure ' +
      'trait payload ready for embedding in a .holo composition. Use this tool to ground drug-discovery, ' +
      'structural-biology, or binding-site simulations in real experimental-grade predictions.',
    inputSchema: {
      type: 'object',
      properties: {
        uniprot: {
          type: 'string',
          description:
            'UniProt accession number (e.g. "P00533" for human EGFR). Must be a Swiss-Prot or TrEMBL identifier.',
          pattern: '^[A-Z][0-9A-Z]{5,9}$',
        },
        domain: {
          type: 'string',
          description:
            'Optional domain label to record in the trait metadata (e.g. "kinase"). Does not slice the structure — AlphaFold returns the full chain. Use this for labeling in downstream scenes.',
        },
        pdb_format: {
          type: 'string',
          enum: ['pdb', 'cif'],
          description: 'Return PDB format or mmCIF. Default: pdb.',
          default: 'pdb',
        },
      },
      required: ['uniprot'],
    },
  },
];

// =============================================================================
// TYPES
// =============================================================================

interface AlphaFoldAPIResponse {
  entryId: string;
  gene?: string;
  uniprotAccession: string;
  uniprotId?: string;
  uniprotDescription?: string;
  organismScientificName?: string;
  pdbUrl: string;
  cifUrl: string;
  paeImageUrl?: string;
  globalMetricValue?: number;
  latestVersion?: number;
}

interface FetchStructureArgs {
  uniprot: string;
  domain?: string;
  pdb_format?: 'pdb' | 'cif';
}

interface FetchStructureResult {
  ok: boolean;
  uniprot: string;
  domain: string | null;
  source: 'ebi-alphafold' | 'error';
  mean_plddt: number | null;
  sequence_length: number | null;
  per_residue_plddt: number[] | null;
  pdb_data: string | null;
  pdb_url: string | null;
  pae_image_url: string | null;
  latest_version: number | null;
  suggested_trait: {
    type: 'protein_structure';
    uniprot: string;
    domain: string | null;
    pdb_format: 'pdb' | 'cif';
  } | null;
  error?: string;
  /**
   * Provenance stub — downstream pipeline stages can attach this to their
   * metadata block to cite the AlphaFold source in the final .holo.
   */
  provenance: {
    source: string;
    api: string;
    fetched_at: string;
    version: number | null;
  };
}

// =============================================================================
// HANDLER
// =============================================================================

function validateUniprot(uniprot: string): boolean {
  return /^[A-Z][0-9A-Z]{5,9}$/.test(uniprot);
}

/**
 * Parse per-residue pLDDT scores from a PDB file.
 * PDB stores pLDDT in the B-factor column for AlphaFold predictions.
 * Takes CA atoms only (one per residue) and returns them in order.
 */
function extractPlddtFromPdb(pdb: string): {
  perResidue: number[];
  mean: number;
  length: number;
} {
  const perResidue: number[] = [];
  for (const line of pdb.split('\n')) {
    // Only the Cα atom per residue — PDB columns 13-16 hold the atom name
    if (!line.startsWith('ATOM')) continue;
    const atomName = line.substring(12, 16).trim();
    if (atomName !== 'CA') continue;
    // B-factor is columns 61-66 (1-indexed) per PDB spec
    const bFactor = parseFloat(line.substring(60, 66));
    if (Number.isFinite(bFactor)) perResidue.push(bFactor);
  }
  const mean =
    perResidue.length > 0
      ? perResidue.reduce((a, b) => a + b, 0) / perResidue.length
      : 0;
  return { perResidue, mean, length: perResidue.length };
}

export async function handleFetchStructure(
  args: Record<string, unknown>
): Promise<FetchStructureResult> {
  const fetchedAt = new Date().toISOString();
  const { uniprot, domain = null, pdb_format = 'pdb' } = args as unknown as FetchStructureArgs;

  // Base shape — populated as the handler progresses, so partial-failure
  // responses still include provenance context for the caller.
  const base: FetchStructureResult = {
    ok: false,
    uniprot: uniprot ?? '',
    domain: domain ?? null,
    source: 'error',
    mean_plddt: null,
    sequence_length: null,
    per_residue_plddt: null,
    pdb_data: null,
    pdb_url: null,
    pae_image_url: null,
    latest_version: null,
    suggested_trait: null,
    provenance: {
      source: 'ebi-alphafold',
      api: 'https://alphafold.ebi.ac.uk/api/prediction',
      fetched_at: fetchedAt,
      version: null,
    },
  };

  if (!uniprot || typeof uniprot !== 'string') {
    return { ...base, error: 'uniprot is required and must be a string' };
  }

  const normalized = uniprot.toUpperCase().trim();
  if (!validateUniprot(normalized)) {
    return {
      ...base,
      uniprot: normalized,
      error: `Invalid UniProt accession format: "${normalized}". Must match /^[A-Z][0-9A-Z]{5,9}$/`,
    };
  }

  const metaUrl = `https://alphafold.ebi.ac.uk/api/prediction/${normalized}`;

  let metadata: AlphaFoldAPIResponse;
  try {
    const metaResponse = await fetch(metaUrl, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!metaResponse.ok) {
      return {
        ...base,
        uniprot: normalized,
        error: `AlphaFold metadata fetch failed: ${metaResponse.status} ${metaResponse.statusText}. Accession may not be in the database.`,
      };
    }
    const payload = (await metaResponse.json()) as AlphaFoldAPIResponse[] | AlphaFoldAPIResponse;
    // EBI returns an array; pick the first entry
    metadata = Array.isArray(payload) ? payload[0] : payload;
    if (!metadata) {
      return {
        ...base,
        uniprot: normalized,
        error: 'AlphaFold API returned no entries for this accession',
      };
    }
  } catch (err) {
    return {
      ...base,
      uniprot: normalized,
      error: `AlphaFold metadata fetch error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const structureUrl = pdb_format === 'cif' ? metadata.cifUrl : metadata.pdbUrl;
  if (!structureUrl) {
    return {
      ...base,
      uniprot: normalized,
      error: `AlphaFold metadata missing ${pdb_format.toUpperCase()} URL`,
      latest_version: metadata.latestVersion ?? null,
    };
  }

  let structureText: string;
  try {
    const structureResponse = await fetch(structureUrl, {
      signal: AbortSignal.timeout(30_000),
    });
    if (!structureResponse.ok) {
      return {
        ...base,
        uniprot: normalized,
        error: `AlphaFold structure fetch failed: ${structureResponse.status} ${structureResponse.statusText}`,
        pdb_url: structureUrl,
        latest_version: metadata.latestVersion ?? null,
      };
    }
    structureText = await structureResponse.text();
  } catch (err) {
    return {
      ...base,
      uniprot: normalized,
      error: `AlphaFold structure fetch error: ${err instanceof Error ? err.message : String(err)}`,
      pdb_url: structureUrl,
      latest_version: metadata.latestVersion ?? null,
    };
  }

  const plddt =
    pdb_format === 'pdb'
      ? extractPlddtFromPdb(structureText)
      : { perResidue: [], mean: metadata.globalMetricValue ?? 0, length: 0 };

  return {
    ok: true,
    uniprot: normalized,
    domain: domain ?? null,
    source: 'ebi-alphafold',
    mean_plddt: metadata.globalMetricValue ?? plddt.mean,
    sequence_length: plddt.length || null,
    per_residue_plddt: plddt.perResidue.length > 0 ? plddt.perResidue : null,
    pdb_data: structureText,
    pdb_url: structureUrl,
    pae_image_url: metadata.paeImageUrl ?? null,
    latest_version: metadata.latestVersion ?? null,
    suggested_trait: {
      type: 'protein_structure',
      uniprot: normalized,
      domain: domain ?? null,
      pdb_format,
    },
    provenance: {
      source: 'ebi-alphafold',
      api: 'https://alphafold.ebi.ac.uk/api/prediction',
      fetched_at: fetchedAt,
      version: metadata.latestVersion ?? null,
    },
  };
}
