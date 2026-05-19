# Universal Professional Format Atlas

**Status:** Draft implementation atlas.
**Audience:** agents planning HoloScript domain ingestion, Studio imports, and Absorb roadmap work.

HoloScript is universal at the semantic IR layer. It can describe intent, behavior,
constraints, and target outputs across domains. It is not a replacement for every
native professional file standard. "Every format" means adapters: detect the
professional source format, extract structured meaning, preserve provenance, and
emit HoloScript or Absorb graph nodes that compilers and agents can use.

This atlas uses canonical professional formats, not an infinite extension list.
The current Absorb service is still codebase-first: TypeScript/JavaScript,
Python, Rust, Go, and HoloScript source are the structured scan path. Professional
document/data ingestion should be additive and separate from `CodebaseScanner`.

## Status Vocabulary

| Status | Meaning |
| --- | --- |
| `native` | Current repo has a shipped parser/compiler/import/export path for the format family. |
| `adapter` | Current repo has a usable parser/importer in a package or plugin, but Absorb does not yet ingest it as professional knowledge. |
| `stub` | Current repo has a contract or plugin stub, but the full parser/binding is not shipped. |
| `roadmap` | Needed for the vertical; no current adapter found in this repo slice. |
| `gap` | Known hard gap or blocked path that must not be marketed as supported. |

## Vertical Matrix

| Family | Professionals | HoloScript anchors | Canonical formats | Current status | Missing adapters | Priority |
| --- | --- | --- | --- | --- | --- | --- |
| Spatial, XR, games, avatars, media | XR designers, game teams, technical artists, avatar creators, video teams | `core-vr-interaction`, `webxr`, `rendering`, `humanoid-avatar`, `hologram-media`; `vrm-avatar-plugin`, `assimp-plugin`, `openusd-plugin`, `remotion-r3f-plugin`, `talkinghead-plugin` | `.holo`, `.hsplus`, glTF/GLB, VRM, USD/USDZ, FBX, OBJ, PNG/JPEG/WebP, MP4/MOV, Remotion compositions | Mixed: HoloScript source and glTF are native; VRM/OpenUSD/Assimp/Remotion are native, adapter, or stub depending on path | Absorb media/asset adapters, asset provenance graph, animation/rig metadata normalization | P1 |
| Education | Teachers, instructional designers, training teams, simulation authors | `education-learning`, Studio educator presets, classroom/tutorial templates | Markdown, PDF, DOCX, PPTX, HTML, SCORM/xAPI packages, CSV rosters, `.holo` lessons | HoloScript scenes exist; document/course-package ingestion is roadmap | Course document extraction, lesson graph, assessment schema mapping | P2 |
| Healthcare and medical | Doctors, surgeons, radiologists, therapists, clinical educators | `healthcare-medical`, `medical-plugin`, `therapy-plugin`, Studio healthcare/science presets | DICOM, FHIR JSON, HL7v2, NIfTI, STL/OBJ anatomy meshes, PDF/DOCX protocols, CSV vitals | DICOM/FHIR/HL7 surfaces exist in plugins or types; Absorb professional ingestion is not wired | DICOM series metadata, PHI-safe provenance, clinical document chunking, FHIR/HL7 graph edges | P0 |
| Science and lab | Scientists, lab researchers, computational chemists, astronomers, bioinformaticians | `scientific-computing`, `simulation-domains`, `radio-astronomy-plugin`, `structural-biology-plugin`, `alphafold-plugin`, `qm-bridge`, `scientific-plugin` | FITS, PDB/mmCIF, FASTA/FASTQ/VCF, HDF5, NetCDF, Jupyter notebooks, CSV/TSV, VTK | FITS and several simulation/structure paths exist; broad lab ingest is roadmap | Notebook extraction, array metadata summaries, sequence/protein graph mapping, dataset provenance | P0 |
| Robotics, IoT, industrial | Robotics engineers, controls engineers, factory teams, digital twin operators | `robotics-industrial`, `iot-autonomous-agents`, `measurement-sensing`, `fabrication-devices`; `robotics-plugin`, `urdf`, `urdformer-plugin` | URDF, SDF, ROS bags, STEP/IGES, STL, G-code, OPC UA payloads, MQTT/JSON telemetry, CSV logs | URDF/SDF/compiler paths exist; professional telemetry and CAD ingest are partial or roadmap | URDF/SDF graph ingest, telemetry schema inference, CAD metadata extraction, safety-zone provenance | P1 |
| Architecture, construction, GIS, urban planning | Architects, civil engineers, planners, surveyors, real estate teams | `architecture-realestate`, `construction-building`, `geospatial`, `geospatial-web3`, `urban-planning-plugin`, `civil-engineering-plugin`, `geolocation-gis-plugin` | IFC, RVT via export, DWG/DXF, STEP/IGES, CityGML, GeoJSON, Shapefile, LAS/LAZ, KML/KMZ, BIM PDFs | Studio and plugins name these workflows; most professional format ingest is roadmap | BIM/GIS adapter layer, coordinate reference provenance, CAD layer graph, measurement units | P1 |
| Business, legal, finance, government | Lawyers, accountants, compliance teams, civic teams, insurers, HR teams | `compliance-governance`, `audit-trail`, `workflow-bpm`, `payment`; finance/legal/government/insurance/HR plugins | PDF, DOCX, XLSX, XBRL, ISO 20022 XML, OFX/QFX, EML/MBOX/PST, contract JSON, CSV exports | Domain plugins exist; enterprise document ingestion is roadmap | Contract clause graph, spreadsheet table graph, audit provenance, redaction-safe extraction | P1 |
| Security, forensics, emergency response | Security analysts, incident responders, investigators, disaster teams | `security-crypto`, `safety-boundaries`, `threat-intelligence-plugin`, `forensics-plugin`, `emergency-response` | STIX/TAXII JSON, Sigma, YARA, PCAP, EVTX, EML/MBOX, SBOM CycloneDX/SPDX, images/video with chain-of-custody metadata | Plugin surfaces exist; most ingest adapters are roadmap | Evidence provenance, IOC graph, SBOM dependency graph, chain-of-custody metadata | P1 |
| Platform, software, AI agents | Software engineers, DevOps, AI agents, system architects | `api-gateway`, `data-pipeline`, `database-persistence`, `devops-ci`, `containers-storage`, `networking-ai`; Absorb codebase scanner | TypeScript/JavaScript, Python, Rust, Go, HoloScript, OpenAPI, GraphQL SDL, protobuf, Dockerfile, Terraform, Kubernetes YAML | Codebase absorption is the strongest current path; infrastructure formats are partial roadmap | Infra/config adapters, schema graph, API contract graph, IaC blast-radius graph | P0 |

## Absorb Professional Ingestion Roadmap

Add a professional ingestion layer beside the current codebase scanner:

1. Detect format by extension, MIME type, and signature.
2. Extract structured content with format-specific adapters.
3. Normalize content into title, metadata, sections, tables, assets, and references.
4. Preserve source provenance for every extracted chunk.
5. Chunk normalized content for embeddings and Graph RAG.
6. Emit graph nodes and edges with vertical tags and support status.
7. Report unsupported, corrupt, oversized, encrypted, or partial reads explicitly.

The first shipping slice should expose a contract and registry before adding heavy
parsers. That lets Studio, MCP, and future adapters agree on one shape without
touching `CodebaseScanner`.

## First Adapter Tiers

| Tier | Formats | Why it comes first |
| --- | --- | --- |
| Foundation | text, Markdown, JSON/YAML/XML, CSV/TSV, PDF, DOCX, XLSX | Needed by nearly every profession. |
| Scientific and medical | DICOM, FHIR JSON, HL7v2, FITS, PDB/mmCIF, FASTA/FASTQ/VCF, HDF5/NetCDF, Jupyter notebooks | Doctors and scientists are priority examples, and these formats carry high-value structure. |
| Spatial and engineering | glTF/GLB, USD/USDZ, FBX/OBJ, STL, Gmsh/MSH, VTK, STEP/IGES, IFC, DXF/DWG | Matches HoloScript's spatial/compiler strengths and professional design workflows. |
| Enterprise and security | XBRL, ISO 20022, EML/MBOX/PST, STIX/TAXII, Sigma, YARA, PCAP, CycloneDX/SPDX | Covers legal, finance, government, security, forensics, and compliance workflows. |

## Implementation Rules

- Keep `CodebaseScanner` unchanged for source code absorption.
- Use a separate `IngestAdapter` contract for professional documents and data.
- Treat parser output as evidence: every chunk needs file path, byte/line/page/sheet
  provenance where the source format can provide it.
- Use synthetic fixtures for healthcare, legal, finance, and security tests.
- Distinguish marketing status from runtime status. A plugin stub is not Absorb support.

## Source Anchors

- Plugin inventory: `packages/plugins/`
- Trait category inventory: `packages/core/src/traits/constants/`
- Codebase scanner: `packages/absorb-service/src/engine/CodebaseScanner.ts`
- Existing Holo source ingestion: `packages/absorb-service/src/ingest/ingestHoloSource.ts`
- Universal IR matrix: `docs/universal-ir-coverage.md`
- Studio vertical presets: `packages/studio/src/lib/presets/studioPresets.ts`
- Studio industry portal: `packages/studio/src/app/(industry)/[vertical]/page.tsx`
