import type {
  FormatDetectionResult,
  FormatLookupInput,
  FormatRegistryFilter,
  FormatSignature,
  ProfessionalFormatRegistryEntry,
} from './types';

export const PROFESSIONAL_FORMAT_REGISTRY: ProfessionalFormatRegistryEntry[] = [
  entry('text', 'Plain text', 'foundation', ['.txt', '.log'], ['text/plain'], ['education', 'business', 'platform'], 'roadmap', 'p0', 'Foundation text extraction adapter planned.'),
  entry('markdown', 'Markdown', 'foundation', ['.md', '.markdown'], ['text/markdown'], ['education', 'business', 'platform'], 'roadmap', 'p0', 'Needed for lessons, reports, READMEs, and agent-authored notes.'),
  entry('json', 'JSON', 'foundation', ['.json'], ['application/json'], ['platform', 'science', 'healthcare', 'security'], 'roadmap', 'p0', 'Structured JSON extraction should preserve field-path provenance.'),
  entry('yaml', 'YAML', 'foundation', ['.yaml', '.yml'], ['application/yaml', 'text/yaml'], ['platform', 'security', 'business'], 'roadmap', 'p0', 'Covers configs, Kubernetes, OpenAPI sidecars, and manifests.'),
  entry('xml', 'XML', 'foundation', ['.xml'], ['application/xml', 'text/xml'], ['business', 'healthcare', 'engineering'], 'roadmap', 'p0', 'Foundation for HL7 exports, XBRL, ISO 20022, and Office internals.'),
  entry('csv-tsv', 'CSV/TSV', 'foundation', ['.csv', '.tsv'], ['text/csv', 'text/tab-separated-values'], ['science', 'business', 'healthcare'], 'adapter', 'p0', 'CSV import/export exists in simulation paths; Absorb professional table ingest is not wired.'),
  entry('pdf', 'PDF', 'foundation', ['.pdf'], ['application/pdf'], ['education', 'healthcare', 'legal', 'business'], 'roadmap', 'p0', 'Required for protocols, papers, contracts, reports, and manuals.', [{ kind: 'ascii', value: '%PDF-' }]),
  entry('docx', 'Word document', 'foundation', ['.docx'], ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'], ['education', 'healthcare', 'legal', 'business'], 'roadmap', 'p0', 'Needed for clinical protocols, contracts, and training documents.'),
  entry('xlsx', 'Excel workbook', 'foundation', ['.xlsx'], ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'], ['science', 'finance', 'business', 'healthcare'], 'roadmap', 'p0', 'Needed for tables, audits, lab results, and finance models.'),

  entry('dicom', 'DICOM', 'scientific-medical', ['.dcm', '.dicom'], ['application/dicom'], ['healthcare', 'medical-imaging'], 'stub', 'p0', 'Medical plugin declares DICOM surfaces; Absorb PHI-safe series ingest is pending.', [{ kind: 'ascii', value: 'DICM', offset: 128 }]),
  entry('fhir-json', 'FHIR JSON', 'scientific-medical', ['.fhir.json', '.fhir'], ['application/fhir+json'], ['healthcare', 'clinical-data'], 'stub', 'p0', 'FHIR JSON is referenced by medical plugin surfaces; graph normalization is pending.'),
  entry('hl7v2', 'HL7v2', 'scientific-medical', ['.hl7'], ['x-application/hl7-v2+er7'], ['healthcare', 'clinical-data'], 'stub', 'p0', 'HL7 segment parsing needs explicit patient-data redaction boundaries.'),
  entry('fits', 'FITS', 'scientific-medical', ['.fits', '.fit', '.fts'], ['application/fits'], ['science', 'astronomy'], 'adapter', 'p0', 'Radio astronomy plugin ships FITS parsing; Absorb graph ingest is pending.'),
  entry('pdb', 'PDB', 'scientific-medical', ['.pdb'], ['chemical/x-pdb'], ['science', 'structural-biology'], 'adapter', 'p0', 'AlphaFold and structural-biology paths reference PDB; Absorb graph ingest is pending.'),
  entry('mmcif', 'mmCIF', 'scientific-medical', ['.cif', '.mmcif'], ['chemical/x-mmcif'], ['science', 'structural-biology'], 'roadmap', 'p0', 'Needed beside PDB for modern structure archives.'),
  entry('fasta-fastq', 'FASTA/FASTQ', 'scientific-medical', ['.fa', '.fasta', '.fq', '.fastq'], ['text/x-fasta', 'application/x-fastq'], ['science', 'bioinformatics'], 'roadmap', 'p1', 'Sequence formats need chunking by record and provenance by sequence id.'),
  entry('vcf', 'Variant Call Format', 'scientific-medical', ['.vcf'], ['text/vcard', 'text/x-vcard'], ['science', 'bioinformatics'], 'roadmap', 'p1', 'Genomic variant ingest needs synthetic fixtures only.'),
  entry('hdf5-netcdf', 'HDF5/NetCDF', 'scientific-medical', ['.h5', '.hdf5', '.nc', '.netcdf'], ['application/x-hdf5', 'application/netcdf'], ['science', 'simulation'], 'roadmap', 'p1', 'Large array datasets need metadata summaries before payload extraction.'),
  entry('jupyter', 'Jupyter notebook', 'scientific-medical', ['.ipynb'], ['application/x-ipynb+json'], ['science', 'education', 'platform'], 'roadmap', 'p0', 'Notebook ingest should split markdown, code, outputs, and execution metadata.'),

  entry('gltf-glb', 'glTF/GLB', 'spatial-engineering', ['.gltf', '.glb'], ['model/gltf+json', 'model/gltf-binary'], ['spatial', 'xr', 'media'], 'native', 'p1', 'glTF/GLB is a core spatial asset path; Absorb asset graph ingest is still separate.'),
  entry('usd-usdz', 'USD/USDZ', 'spatial-engineering', ['.usd', '.usda', '.usdc', '.usdz'], ['model/vnd.usd', 'model/vnd.usdz+zip'], ['spatial', 'architecture', 'vfx'], 'stub', 'p1', 'OpenUSD plugin defines interop baseline; direct Absorb ingest is pending.'),
  entry('fbx-obj', 'FBX/OBJ', 'spatial-engineering', ['.fbx', '.obj'], ['model/fbx', 'model/obj'], ['spatial', 'media', 'engineering'], 'stub', 'p1', 'Assimp plugin maps the bridge shape; production parser binding is pending.'),
  entry('stl', 'STL', 'spatial-engineering', ['.stl'], ['model/stl'], ['engineering', 'healthcare', 'manufacturing'], 'adapter', 'p1', 'Simulation import has STL parsing; Absorb mesh summary ingest is pending.'),
  entry('gmsh', 'Gmsh mesh', 'spatial-engineering', ['.msh'], ['model/vnd.gmsh'], ['engineering', 'simulation'], 'adapter', 'p1', 'Simulation import has Gmsh parsing; Absorb mesh graph ingest is pending.'),
  entry('vtk', 'VTK', 'spatial-engineering', ['.vtk', '.vtu', '.vtp'], ['model/vtk'], ['science', 'simulation'], 'adapter', 'p1', 'Simulation export paths exist; inbound Absorb result ingest is pending.'),
  entry('step-iges', 'STEP/IGES', 'spatial-engineering', ['.step', '.stp', '.iges', '.igs'], ['model/step', 'model/iges'], ['engineering', 'manufacturing', 'architecture'], 'roadmap', 'p1', 'CAD ingest remains a known gap for simulation and professional workflows.'),
  entry('ifc', 'IFC', 'spatial-engineering', ['.ifc'], ['application/x-step'], ['architecture', 'construction', 'bim'], 'roadmap', 'p1', 'BIM graph extraction is needed for architecture and construction verticals.'),
  entry('dxf-dwg', 'DXF/DWG', 'spatial-engineering', ['.dxf', '.dwg'], ['image/vnd.dxf', 'application/acad'], ['architecture', 'construction', 'gis'], 'roadmap', 'p2', 'CAD layer extraction may require external licensed tooling.'),

  entry('xbrl', 'XBRL', 'enterprise-security', ['.xbrl'], ['application/xbrl+xml'], ['finance', 'compliance'], 'roadmap', 'p1', 'Financial statement graph ingest is needed for finance and compliance workflows.'),
  entry('iso20022', 'ISO 20022 XML', 'enterprise-security', ['.pain', '.camt', '.pacs'], ['application/xml'], ['finance', 'banking'], 'roadmap', 'p1', 'Requires XML namespace-aware parsing and payment-message classification.'),
  entry('email-archives', 'Email archives', 'enterprise-security', ['.eml', '.mbox', '.pst'], ['message/rfc822', 'application/mbox'], ['legal', 'forensics', 'business'], 'roadmap', 'p1', 'Email ingest needs attachment provenance and redaction hooks.'),
  entry('stix-taxii', 'STIX/TAXII JSON', 'enterprise-security', ['.stix', '.stix.json'], ['application/stix+json'], ['security', 'threat-intelligence'], 'roadmap', 'p1', 'IOC graph extraction belongs in the threat-intelligence vertical.'),
  entry('sigma-yara', 'Sigma/YARA', 'enterprise-security', ['.sigma', '.yar', '.yara'], ['text/plain'], ['security', 'forensics'], 'roadmap', 'p1', 'Detection-rule parsing should preserve rule ids, tags, and conditions.'),
  entry('pcap', 'PCAP', 'enterprise-security', ['.pcap', '.pcapng'], ['application/vnd.tcpdump.pcap'], ['security', 'forensics'], 'roadmap', 'p2', 'Packet summaries need bounded extraction and no payload over-collection by default.'),
  entry('sbom', 'SBOM', 'enterprise-security', ['.cdx.json', '.spdx', '.spdx.json'], ['application/vnd.cyclonedx+json', 'text/spdx'], ['security', 'platform', 'compliance'], 'roadmap', 'p1', 'CycloneDX and SPDX should emit package, license, and vulnerability graph nodes.'),

  entry('code-source', 'Code source', 'platform-software', ['.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go', '.holo', '.hsplus', '.hs'], ['text/plain'], ['platform', 'software', 'ai-agents'], 'native', 'p0', 'Existing CodebaseScanner path; professional ingestion must not regress it.'),
  entry('api-schemas', 'API schemas', 'platform-software', ['.openapi.json', '.graphql', '.proto'], ['application/json', 'application/graphql', 'text/plain'], ['platform', 'software'], 'roadmap', 'p1', 'Schema graph adapters should connect routes, operations, messages, and owners.'),
];

export function listProfessionalFormats(
  filter: FormatRegistryFilter = {}
): ProfessionalFormatRegistryEntry[] {
  return PROFESSIONAL_FORMAT_REGISTRY.filter((entryValue) => {
    if (filter.family && entryValue.family !== filter.family) return false;
    if (filter.supportStatus && entryValue.supportStatus !== filter.supportStatus) return false;
    if (filter.priority && entryValue.priority !== filter.priority) return false;
    if (filter.verticalTag && !entryValue.verticalTags.includes(filter.verticalTag)) return false;
    return true;
  });
}

export function detectProfessionalFormat(input: FormatLookupInput): FormatDetectionResult {
  let best: FormatDetectionResult = { entry: null, confidence: 0, matchedBy: [] };

  for (const candidate of PROFESSIONAL_FORMAT_REGISTRY) {
    const matchedBy: FormatDetectionResult['matchedBy'] = [];
    let confidence = 0;

    const extensionLength = matchingExtensionLength(candidate, input);
    if (extensionLength > 0) {
      matchedBy.push('extension');
      confidence = Math.max(confidence, Math.min(0.75, 0.65 + extensionLength / 100));
    }
    if (matchesMime(candidate, input.mimeType)) {
      matchedBy.push('mime');
      confidence = Math.max(confidence, 0.8);
    }
    if (matchesSignature(candidate, input.signature)) {
      matchedBy.push('signature');
      confidence = Math.max(confidence, 0.95);
    }

    if (matchedBy.length > 1) {
      confidence = Math.min(0.99, confidence + 0.05 * (matchedBy.length - 1));
    }

    if (confidence > best.confidence) {
      best = { entry: candidate, confidence, matchedBy };
    }
  }

  return best;
}

function entry(
  id: string,
  label: string,
  family: ProfessionalFormatRegistryEntry['family'],
  extensions: string[],
  mimeTypes: string[],
  verticalTags: string[],
  supportStatus: ProfessionalFormatRegistryEntry['supportStatus'],
  priority: ProfessionalFormatRegistryEntry['priority'],
  notes: string,
  signatures?: FormatSignature[]
): ProfessionalFormatRegistryEntry {
  return {
    id,
    label,
    family,
    extensions,
    mimeTypes,
    signatures,
    verticalTags,
    supportStatus,
    priority,
    notes,
  };
}

function matchingExtensionLength(
  entryValue: ProfessionalFormatRegistryEntry,
  input: FormatLookupInput
): number {
  const candidates = new Set(entryValue.extensions.map(normalizeExtension));
  const explicit = input.extension ? normalizeExtension(input.extension) : null;
  if (explicit && candidates.has(explicit)) return explicit.length;

  const fileName = input.fileName?.toLowerCase();
  if (!fileName) return 0;
  return entryValue.extensions.reduce((best, ext) => {
    const normalized = ext.toLowerCase();
    return fileName.endsWith(normalized) ? Math.max(best, normalized.length) : best;
  }, 0);
}

function matchesMime(entryValue: ProfessionalFormatRegistryEntry, mimeType?: string): boolean {
  if (!mimeType) return false;
  const normalized = mimeType.toLowerCase().split(';', 1)[0].trim();
  return entryValue.mimeTypes.some((mime) => mime.toLowerCase() === normalized);
}

function matchesSignature(entryValue: ProfessionalFormatRegistryEntry, signature?: Uint8Array): boolean {
  if (!signature || !entryValue.signatures?.length) return false;
  return entryValue.signatures.some((expected) => matchSignature(expected, signature));
}

function matchSignature(expected: FormatSignature, bytes: Uint8Array): boolean {
  const offset = expected.offset ?? 0;
  if (offset < 0 || offset >= bytes.length) return false;

  if (expected.kind === 'ascii') {
    const text = String.fromCharCode(...bytes.slice(offset, offset + expected.value.length));
    return text === expected.value;
  }

  const hex = Array.from(bytes.slice(offset, offset + expected.value.length / 2))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return hex.toLowerCase() === expected.value.toLowerCase();
}

function normalizeExtension(extension: string): string {
  const trimmed = extension.trim().toLowerCase();
  return trimmed.startsWith('.') ? trimmed : `.${trimmed}`;
}
