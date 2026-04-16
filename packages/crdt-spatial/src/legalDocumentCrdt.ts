import type { LoroDoc } from 'loro-crdt';

export const LEGAL_DOCUMENT_CONTRACTS_ROOT = 'legal_document_contracts' as const;

export interface SignatureWitnessSnapshot {
  id: string;
  role: string;
  signedAt: string;
}

export interface SignatureBlockSnapshot {
  signers: string[];
  requiredSignatures: number;
  signatureMethod: 'electronic' | 'wet' | 'hybrid';
  witnesses?: SignatureWitnessSnapshot[];
}

export interface AuditTrailEntrySnapshot {
  id: string;
  actor: string;
  action: string;
  timestamp: string;
  hash?: string;
}

export interface LegalContractSpatialSnapshot {
  documentId: string;
  title?: string;
  jurisdiction?: string;
  signatureBlock: SignatureBlockSnapshot;
  auditTrail: AuditTrailEntrySnapshot[];
}

function parseJsonRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function parseJsonArray(value: unknown): Array<Record<string, unknown>> {
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null);
  } catch {
    return [];
  }
}

export function ensureLegalDocumentContractsRoot(doc: LoroDoc) {
  return doc.getMap(LEGAL_DOCUMENT_CONTRACTS_ROOT);
}

export function setLegalSignatureBlock(
  doc: LoroDoc,
  documentId: string,
  signatureBlock: SignatureBlockSnapshot
): void {
  const root = ensureLegalDocumentContractsRoot(doc);
  root.set(
    `${documentId}::signature`,
    JSON.stringify({
      trait: 'signature_block',
      updatedAt: Date.now(),
      ...signatureBlock,
    })
  );
  doc.commit();
}

export function appendLegalAuditTrailEntry(
  doc: LoroDoc,
  documentId: string,
  entry: AuditTrailEntrySnapshot
): void {
  const root = ensureLegalDocumentContractsRoot(doc);
  const key = `${documentId}::audit`;
  const existing = parseJsonArray(root.get(key));
  existing.push(entry);
  root.set(key, JSON.stringify(existing));
  doc.commit();
}

export function setLegalContractSnapshot(
  doc: LoroDoc,
  snapshot: LegalContractSpatialSnapshot
): void {
  const root = ensureLegalDocumentContractsRoot(doc);
  root.set(`${snapshot.documentId}::meta`, JSON.stringify({
    trait: 'legal_contract',
    documentId: snapshot.documentId,
    title: snapshot.title ?? '',
    jurisdiction: snapshot.jurisdiction ?? '',
    updatedAt: Date.now(),
  }));
  root.set(`${snapshot.documentId}::signature`, JSON.stringify({
    trait: 'signature_block',
    updatedAt: Date.now(),
    ...snapshot.signatureBlock,
  }));
  root.set(`${snapshot.documentId}::audit`, JSON.stringify(snapshot.auditTrail));
  doc.commit();
}

export function readLegalContractSnapshot(
  doc: LoroDoc,
  documentId: string
): LegalContractSpatialSnapshot | null {
  const root = ensureLegalDocumentContractsRoot(doc);
  const meta = parseJsonRecord(root.get(`${documentId}::meta`));
  const signature = parseJsonRecord(root.get(`${documentId}::signature`));
  const audit = parseJsonArray(root.get(`${documentId}::audit`));

  if (!signature) return null;

  const signatureBlock: SignatureBlockSnapshot = {
    signers: Array.isArray(signature.signers)
      ? signature.signers.filter((s): s is string => typeof s === 'string')
      : [],
    requiredSignatures:
      typeof signature.requiredSignatures === 'number' ? signature.requiredSignatures : 0,
    signatureMethod:
      signature.signatureMethod === 'wet' || signature.signatureMethod === 'hybrid'
        ? signature.signatureMethod
        : 'electronic',
    witnesses: Array.isArray(signature.witnesses)
      ? signature.witnesses.filter(
          (w): w is SignatureWitnessSnapshot =>
            typeof w === 'object' &&
            w !== null &&
            typeof (w as SignatureWitnessSnapshot).id === 'string' &&
            typeof (w as SignatureWitnessSnapshot).role === 'string' &&
            typeof (w as SignatureWitnessSnapshot).signedAt === 'string'
        )
      : undefined,
  };

  const auditTrail: AuditTrailEntrySnapshot[] = audit
    .map((item) => {
      if (
        typeof item.id === 'string' &&
        typeof item.actor === 'string' &&
        typeof item.action === 'string' &&
        typeof item.timestamp === 'string'
      ) {
        return {
          id: item.id,
          actor: item.actor,
          action: item.action,
          timestamp: item.timestamp,
          hash: typeof item.hash === 'string' ? item.hash : undefined,
        } satisfies AuditTrailEntrySnapshot;
      }
      return null;
    })
    .filter((v): v is AuditTrailEntrySnapshot => v !== null);

  return {
    documentId,
    title: typeof meta?.title === 'string' ? meta.title : undefined,
    jurisdiction: typeof meta?.jurisdiction === 'string' ? meta.jurisdiction : undefined,
    signatureBlock,
    auditTrail,
  };
}

export function unregisterLegalContract(doc: LoroDoc, documentId: string): void {
  const root = ensureLegalDocumentContractsRoot(doc);
  const snapshot = root.toJSON() as Record<string, unknown>;
  for (const key of Object.keys(snapshot)) {
    if (key.startsWith(`${documentId}::`)) {
      root.delete(key);
    }
  }
  doc.commit();
}
