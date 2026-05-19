export type ProfessionalFormatSupportStatus = 'native' | 'adapter' | 'stub' | 'roadmap' | 'gap';

export type ProfessionalFormatFamily =
  | 'foundation'
  | 'scientific-medical'
  | 'spatial-engineering'
  | 'enterprise-security'
  | 'platform-software';

export type ProfessionalFormatPriority = 'p0' | 'p1' | 'p2';

export interface FormatSignature {
  kind: 'ascii' | 'hex';
  value: string;
  offset?: number;
}

export interface ProfessionalFormatRegistryEntry {
  id: string;
  label: string;
  family: ProfessionalFormatFamily;
  extensions: string[];
  mimeTypes: string[];
  signatures?: FormatSignature[];
  verticalTags: string[];
  supportStatus: ProfessionalFormatSupportStatus;
  priority: ProfessionalFormatPriority;
  notes: string;
}

export interface FormatLookupInput {
  fileName?: string;
  extension?: string;
  mimeType?: string;
  signature?: Uint8Array;
}

export interface FormatDetectionResult {
  entry: ProfessionalFormatRegistryEntry | null;
  confidence: number;
  matchedBy: Array<'extension' | 'mime' | 'signature'>;
}

export interface FormatRegistryFilter {
  family?: ProfessionalFormatFamily;
  verticalTag?: string;
  supportStatus?: ProfessionalFormatSupportStatus;
  priority?: ProfessionalFormatPriority;
}

export interface IngestSourceRef {
  path?: string;
  uri?: string;
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  sha256?: string;
}

export interface IngestAdapterProbeInput extends FormatLookupInput {
  source?: IngestSourceRef;
}

export interface IngestAdapterProbeResult extends FormatDetectionResult {
  supported: boolean;
  reason?: string;
}

export interface IngestProvenance {
  source: IngestSourceRef;
  byteRange?: [number, number];
  lineRange?: [number, number];
  page?: number;
  sheet?: string;
  table?: string;
  fieldPath?: string;
}

export interface IngestExtractedChunk {
  id: string;
  text: string;
  kind: 'text' | 'metadata' | 'table' | 'image' | 'geometry' | 'timeseries' | 'code' | 'binary-summary';
  metadata: Record<string, unknown>;
  provenance: IngestProvenance;
}

export interface IngestExtractedDocument {
  formatId: string;
  title?: string;
  chunks: IngestExtractedChunk[];
  metadata: Record<string, unknown>;
  warnings: string[];
}

export interface IngestNormalizedDocument extends IngestExtractedDocument {
  verticalTags: string[];
  supportStatus: ProfessionalFormatSupportStatus;
}

export interface IngestGraphNode {
  id: string;
  type: string;
  label: string;
  metadata: Record<string, unknown>;
  provenance?: IngestProvenance;
}

export interface IngestGraphEdge {
  from: string;
  to: string;
  type: string;
  metadata?: Record<string, unknown>;
}

export interface IngestGraphFragment {
  nodes: IngestGraphNode[];
  edges: IngestGraphEdge[];
}

export interface IngestAdapter {
  readonly id: string;
  readonly formatIds: string[];
  probe(input: IngestAdapterProbeInput): IngestAdapterProbeResult | Promise<IngestAdapterProbeResult>;
  extract(input: IngestSourceRef): Promise<IngestExtractedDocument>;
  normalize(document: IngestExtractedDocument): Promise<IngestNormalizedDocument>;
  toGraph(document: IngestNormalizedDocument): Promise<IngestGraphFragment>;
}
