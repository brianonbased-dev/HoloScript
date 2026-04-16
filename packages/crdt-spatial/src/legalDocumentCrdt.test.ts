import { describe, expect, it } from 'vitest';
import { LoroDoc } from 'loro-crdt';
import {
  LEGAL_DOCUMENT_CONTRACTS_ROOT,
  appendLegalAuditTrailEntry,
  ensureLegalDocumentContractsRoot,
  readLegalContractSnapshot,
  setLegalContractSnapshot,
  setLegalSignatureBlock,
  unregisterLegalContract,
} from './legalDocumentCrdt.js';

describe('legalDocumentCrdt', () => {
  it('initializes legal contracts root map', () => {
    const doc = new LoroDoc();
    const root = ensureLegalDocumentContractsRoot(doc);
    expect(root).toBeDefined();

    const topLevel = doc.toJSON() as Record<string, unknown>;
    expect(topLevel[LEGAL_DOCUMENT_CONTRACTS_ROOT]).toBeDefined();
  });

  it('writes signature block and audit entries and reads snapshot back', () => {
    const doc = new LoroDoc();
    setLegalSignatureBlock(doc, 'contract-1', {
      signers: ['alice', 'bob'],
      requiredSignatures: 2,
      signatureMethod: 'electronic',
    });

    appendLegalAuditTrailEntry(doc, 'contract-1', {
      id: 'evt-1',
      actor: 'alice',
      action: 'signed',
      timestamp: '2026-04-16T04:00:00Z',
      hash: 'sha256:abc',
    });

    const snapshot = readLegalContractSnapshot(doc, 'contract-1');
    expect(snapshot).not.toBeNull();
    expect(snapshot?.documentId).toBe('contract-1');
    expect(snapshot?.signatureBlock.signers).toEqual(['alice', 'bob']);
    expect(snapshot?.auditTrail).toHaveLength(1);
    expect(snapshot?.auditTrail[0]?.action).toBe('signed');
  });

  it('supports full snapshot upsert and unregister cleanup', () => {
    const doc = new LoroDoc();

    setLegalContractSnapshot(doc, {
      documentId: 'contract-2',
      title: 'Service Agreement',
      jurisdiction: 'US-CA',
      signatureBlock: {
        signers: ['counsel'],
        requiredSignatures: 1,
        signatureMethod: 'hybrid',
      },
      auditTrail: [
        {
          id: 'evt-2',
          actor: 'counsel',
          action: 'drafted',
          timestamp: '2026-04-16T04:10:00Z',
        },
      ],
    });

    const before = readLegalContractSnapshot(doc, 'contract-2');
    expect(before?.title).toBe('Service Agreement');
    expect(before?.jurisdiction).toBe('US-CA');

    unregisterLegalContract(doc, 'contract-2');
    const after = readLegalContractSnapshot(doc, 'contract-2');
    expect(after).toBeNull();
  });
});
