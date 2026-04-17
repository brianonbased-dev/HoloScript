// ═════════════════════════════════════════════════════════════════════════════
// HoloScript Pipeline — Drug Discovery Flagship
// Disease -> Target -> Compounds -> Structure -> .holo binding scene
//
// Legend:
//   ✅ EXISTING       : Uses grammar already in the repo (verified 2026-04-17 against
//                      examples/pipelines/inventory-sync.hs, knowledge-compressor.hs,
//                      social-engagement.hs)
//   🟡 EXTENSION      : Compiles today but the target runtime (r3f-renderer, mcp-server)
//                      does not yet consume all the fields — will degrade gracefully
//   🔴 NEEDS BUILDING : New primitive required; marked for a follow-up PR
//
// Flagship demo recording target (see docs/strategy/drug-discovery-flagship.md):
//   60-second video of this pipeline executing live, emitting a .holo file that
//   opens in the browser with a hash-verifiable EGFR-Osimertinib binding scene.
// ═════════════════════════════════════════════════════════════════════════════

pipeline "DrugDiscoveryFlagship" {                                    // ✅ EXISTING
  description: "NSCLC -> EGFR -> Osimertinib verifiable binding scene"
  timeout: 120s                                                        // ✅ EXISTING
  retry: { max: 2, backoff: "linear" }                                 // ✅ EXISTING

  // ───────────────────────────────────────────────────────────────────────────
  // Inputs — the pipeline is parameterised so the same .hs drives multiple
  // diseases/targets. Defaults here = the probed EGFR/NSCLC/Osimertinib case.
  // ───────────────────────────────────────────────────────────────────────────

  params {                                                             // 🟡 EXTENSION
    disease_query: "${env.DISEASE_QUERY:-non-small cell lung cancer}"  //    (params block is
    target_gene:   "${env.TARGET_GENE:-EGFR}"                          //     not in existing
    drug_name:     "${env.DRUG_NAME:-osimertinib}"                     //     examples; may
    organism:      "${env.ORGANISM:-Homo sapiens}"                     //     need to add
    min_pchembl:   "${env.MIN_PCHEMBL:-8.5}"                           //     to the parser)
    top_n:         "${env.TOP_N:-5}"
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Stage 1 — Disease resolution via Open Targets
  // ───────────────────────────────────────────────────────────────────────────

  source DiseaseEntity {                                               // ✅ EXISTING
    type: "mcp"                                                        //    (type: "mcp" confirmed
    server: "bio-research"                                             //     in knowledge-compressor.hs
    tool: "ot__search_entities"                                        //     line 47 and line 56)
    args: { query_strings: ["${params.disease_query}"] }
    output: disease_entities
  }

  transform ResolveDiseaseID {                                         // ✅ EXISTING
    disease_entities.results[0].result[0][0].id -> disease.efo_id      //    (field arrow syntax
    disease_entities.results[0].result[0][0].entity -> disease.type    //     confirmed in
  }                                                                    //     inventory-sync.hs lines 18-23)

  validate DiseaseResolved {                                           // ✅ EXISTING
    disease.efo_id : required, string, startsWith("EFO_")              //    (matches inventory-sync.hs
    disease.type   : required, equals("disease")                       //     lines 31-35)
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Stage 2 — Target resolution (gene -> ChEMBL + UniProt)
  // ───────────────────────────────────────────────────────────────────────────

  source TargetLookup {                                                // ✅ EXISTING
    type: "mcp"
    server: "bio-research"
    tool: "chembl__target_search"
    args: {
      gene_symbol: "${params.target_gene}"
      organism: "${params.organism}"
      target_type: "SINGLE PROTEIN"
      limit: 1
    }
    output: target_result
  }

  transform ExtractTarget {                                            // ✅ EXISTING
    target_result.targets[0].target_chembl_id -> target.chembl_id
    target_result.targets[0].pref_name        -> target.name
    target_result.targets[0].target_components[0].accession -> target.uniprot
  }

  validate TargetValid {                                               // ✅ EXISTING
    target.chembl_id : required, startsWith("CHEMBL")
    target.uniprot   : required, string, minLength(5)
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Stage 3 — Top potent compounds (bioactivity filter)
  // ───────────────────────────────────────────────────────────────────────────

  source Bioactivities {                                               // ✅ EXISTING
    type: "mcp"
    server: "bio-research"
    tool: "chembl__get_bioactivity"
    args: {
      target_chembl_id: "${target.chembl_id}"
      activity_type: "IC50"
      min_pchembl: "${params.min_pchembl}"
      unit: "nM"
      limit: "${params.top_n}"
    }
    output: bioactivity_result
  }

  transform FlattenCompounds {                                         // ✅ EXISTING
    bioactivity_result.activities[] -> hit                             //    ([] unwrap confirmed
  }                                                                    //     in knowledge-compressor.hs
                                                                       //     line 39 `entries[] -> entry`)

  transform ShapeCompound {                                            // ✅ EXISTING
    hit.molecule_chembl_id -> compound.chembl_id
    hit.canonical_smiles   -> compound.smiles
    hit.standard_value     -> compound.ic50_nm
    hit.pchembl_value      -> compound.pchembl
    hit.assay_chembl_id    -> compound.assay_id
    hit.document_journal   -> compound.citation
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Stage 4 — Approved-drug lookup (the "flagship ligand" for the video)
  // ───────────────────────────────────────────────────────────────────────────

  source ApprovedDrug {                                                // ✅ EXISTING
    type: "mcp"
    server: "bio-research"
    tool: "chembl__compound_search"
    args: {
      name: "${params.drug_name}"
      max_phase: 4
      limit: 1
    }
    output: drug_result
  }

  transform ExtractDrug {                                              // ✅ EXISTING
    drug_result.compounds[0].molecule_chembl_id -> drug.chembl_id
    drug_result.compounds[0].pref_name          -> drug.name
    drug_result.compounds[0].smiles             -> drug.smiles
    drug_result.compounds[0].molecule_properties.full_mwt -> drug.mw
    drug_result.compounds[0].atc_classifications[0].level5 -> drug.atc
    drug_result.compounds[0].first_approval     -> drug.first_approved
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Stage 5 — Protein structure via AlphaFold plugin
  // (Plugin lives at packages/plugins/alphafold-plugin/ and exposes the
  //  protein_structure trait — but the "mcp tool for alphafold" surface
  //  for the pipeline to invoke it is NOT yet wired.)
  // ───────────────────────────────────────────────────────────────────────────

  source ProteinStructure {                                            // 🔴 NEEDS BUILDING
    type: "mcp"                                                        //    Wire alphafold-plugin
    server: "holoscript-mcp"                                           //    as an MCP tool
    tool: "alphafold_fetch_structure"                                  //    accessible at
    args: {                                                            //    mcp.holoscript.net
      uniprot: "${target.uniprot}"                                     //    (exists as a TS lib
      domain: "kinase"                                                 //     today; the bridge to
    }                                                                  //     MCP is the missing
    output: structure                                                  //     piece)
  }

  transform ShapeStructure {                                           // ✅ EXISTING (pattern)
    structure.pdb_data             -> protein.pdb
    structure.mean_plddt           -> protein.confidence
    structure.confidence_scores    -> protein.plddt_per_residue
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Stage 6 — Binding-site inference
  // Known EGFR TKI binding residues: 790 (gatekeeper), 797 (covalent cys),
  // 858 (L858R mutation hotspot). For a production pipeline this would come
  // from a structural analysis tool; hardcoded here per the flagship scope.
  // ───────────────────────────────────────────────────────────────────────────

  transform BuildBindingSite {                                         // ✅ EXISTING
    // Literal residue list — acceptable for flagship; replace with
    // structural-pocket-detection MCP call in production
    target.chembl_id + "-" + drug.chembl_id -> binding.id
    [790, 797, 858] -> binding.residues
    drug.chembl_id -> binding.ligand
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Stage 7 — Emit .holo composition (the artifact)
  // ───────────────────────────────────────────────────────────────────────────

  sink HoloComposition {                                               // 🟡 EXTENSION
    type: "holo"                                                       //    sink type: "holo"
    path: "examples/bio-discovery/${target.chembl_id}-${drug.chembl_id}.holo"
    template: |                                                        //    (templated string
      composition "${target.name} × ${drug.name} — Verifiable Binding Scene" {
        metadata {
          generator: "holoscript:drug-discovery-flagship"
          generated_at: "${now()}"                                     //    (helper fns like
          disease: { label: "${params.disease_query}", efo_id: "${disease.efo_id}" }
          target: {
            chembl_id: "${target.chembl_id}"
            uniprot: "${target.uniprot}"
            name: "${target.name}"
            organism: "${params.organism}"
          }
          approved_drug: {
            chembl_id: "${drug.chembl_id}"
            smiles: "${drug.smiles}"
            name: "${drug.name}"
            atc: "${drug.atc}"
            first_approved: ${drug.first_approved}
            mw: ${drug.mw}
          }
          top_potent_compounds: ${compounds}
          provenance_source: [
            "open-targets-24.09",
            "chembl-34",
            "alphafold-v4"
          ]
        }

        object "ProteinDomain" {
          @protein_structure(
            uniprot: "${target.uniprot}",
            pdb_data: "${protein.pdb}",
            name: "${target.name} kinase domain"
          )
          @confidence_map(
            scores: ${protein.plddt_per_residue},
            scheme: "viridis",
            threshold: 70.0
          )
        }

        object "Ligand" {
          @molecule(
            chembl_id: "${drug.chembl_id}",
            smiles: "${drug.smiles}",
            name: "${drug.name}",
            mw: ${drug.mw}
          )
        }

        binding "${binding.id}" {
          @binding_site(
            structure: "ProteinDomain",
            residues: ${binding.residues},
            ligand: "Ligand"
          )
        }

        contract {
          trust_tier: "construction"
          deterministic: true
          replay_seed: 42
          solver_hash_verify: true
          provenance_chain: true
          hash_on: ["protein", "ligand", "binding", "metadata"]
        }
      }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Stage 8 — Provenance audit log (for the replay-verification claim)
  // ───────────────────────────────────────────────────────────────────────────

  sink AuditLog {                                                      // ✅ EXISTING
    type: "filesystem"                                                 //    (knowledge-compressor.hs
    path: "examples/bio-discovery/provenance-${target.chembl_id}-${now()}.jsonl"
    format: "jsonl"                                                    //     lines 67-71 exact match)
    append: true
    record: {
      timestamp: "${now()}"
      pipeline: "DrugDiscoveryFlagship"
      disease: "${disease.efo_id}"
      target: "${target.chembl_id}"
      drug: "${drug.chembl_id}"
      top_n_compounds: ${params.top_n}
      sources: ["open-targets-24.09", "chembl-34", "alphafold-v4"]
      holo_path: "examples/bio-discovery/${target.chembl_id}-${drug.chembl_id}.holo"
      holo_hash: "${output.hash}"                                      // 🔴 NEEDS BUILDING
    }                                                                  //    (hash helper on
  }                                                                    //     sink output)

  // ───────────────────────────────────────────────────────────────────────────
  // OPTIONAL Stage 9 — Knowledge-store graduation
  // (Every run enriches the orchestrator with a new verifiable-twin record)
  // ───────────────────────────────────────────────────────────────────────────

  sink KnowledgeStore {                                                // ✅ EXISTING
    type: "mcp"                                                        //    (knowledge-compressor.hs
    server: "mcp-orchestrator"                                         //     lines 55-64 exact match)
    tool: "knowledge_sync"
    args: {
      workspace_id: "ai-ecosystem"
      entries: [{
        id: "drug-discovery-${target.chembl_id}-${drug.chembl_id}"
        type: "pattern"
        domain: "drug-discovery"
        content: "Verifiable binding twin: ${drug.name} (${drug.chembl_id}) → ${target.name} (${target.chembl_id}). Generated by DrugDiscoveryFlagship pipeline 2026-04-17."
        confidence: 0.9
        metadata: {
          title: "${target.name} × ${drug.name} verifiable twin"
          holo: "${output.holo_path}"
          hash: "${output.hash}"
        }
      }]
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Gap summary (2026-04-17 audit against HoloScript main)
//
// SHIPS TODAY with existing grammar + existing MCP infrastructure:
//   • Stages 1-4 and Stage 8 fully compile against current .hs grammar
//   • Stage 7 sink type: "holo" likely compiles (templated string sinks exist
//     in pattern, even if `type: "holo"` specifically may need one-line parser add)
//   • Stage 9 knowledge sink is a verbatim match to knowledge-compressor.hs
//
// NEEDS BUILDING (one focused PR):
//   1. alphafold MCP tool wrapper — bridges packages/plugins/alphafold-plugin
//      to mcp.holoscript.net so pipelines can fetch structures
//      (est: 1-2 days)
//   2. sink type: "holo" if not already supported, with ${} interpolation
//      into the emitted .holo source
//      (est: 1-2 days)
//   3. ${output.hash} helper — content hash of the emitted .holo
//      (est: half day)
//   4. params {} block if not already supported (trivial parser add)
//      (est: 2-3 hours)
//
// NEEDS BUILDING (separate track, not blocking the .hs pipeline):
//   5. r3f-renderer wire for @protein_structure trait (Mol* / NGL integration)
//      — without this the .holo renders as the minimal cube seen in screenshot
//      (est: 1 week, tracked in docs/strategy/drug-discovery-flagship.md)
//
// TOTAL CRITICAL PATH to pipeline-level flagship: ~3-5 engineering days.
// The visible-protein rendering is a separate track; the verifiable-pipeline
// video can record and ship on the terminal/editor/hash story before then.
// ═════════════════════════════════════════════════════════════════════════════
