import { describe, it, expect } from 'vitest';
import {
	validateSpatialLegalContract,
	parseSpatialLegalContract,
	pluginMeta,
	traitHandlers,
	legalDocumentPlugin,
	compilerNativeTraits,
	type SpatialLegalContract,
	type SignatureBlock,
	type AuditTrailEntry,
	type SpatialClause,
} from '../index';

// ── Fixtures ────────────────────────────────────────────────────────────────

const validClause: SpatialClause = {
	id: 'clause-1',
	title: 'Governing Law',
	content: 'This agreement is governed by the laws of the State of California.',
	coordinates3d: [0, 1.5, 0],
};

const validSignatureBlock: SignatureBlock = {
	signers: ['alice@example.com', 'bob@example.com'],
	requiredSignatures: 2,
	signatureMethod: 'electronic',
	witnesses: [
		{ id: 'witness-1', role: 'notary', signedAt: '2025-01-01T00:00:00Z' },
	],
};

const validAuditTrail: AuditTrailEntry[] = [
	{ id: 'audit-1', actor: 'alice@example.com', action: 'created', timestamp: '2025-01-01T00:00:00Z' },
	{ id: 'audit-2', actor: 'bob@example.com', action: 'signed', timestamp: '2025-01-02T00:00:00Z', hash: 'abc123' },
];

function makeContract(overrides: Partial<SpatialLegalContract> = {}): SpatialLegalContract {
	return {
		documentId: 'doc-001',
		title: 'Service Agreement',
		jurisdiction: 'California, USA',
		parties: ['Alice Corp', 'Bob LLC'],
		clauses: [validClause],
		signatureBlock: validSignatureBlock,
		auditTrail: validAuditTrail,
		...overrides,
	};
}

// ── Plugin metadata ──────────────────────────────────────────────────────────

describe('pluginMeta', () => {
	it('exports correct plugin name', () => {
		expect(pluginMeta.name).toBe('@holoscript/plugin-legal-document');
	});

	it('exposes all expected traits', () => {
		const expected = ['contract_draft', 'e_signature', 'case_management', 'programmable_law', 'signature_block', 'audit_trail'];
		expect(pluginMeta.traits).toEqual(expected);
	});

	it('has compiler bindings for SignatureBlock and AuditTrail', () => {
		const traitNames = compilerNativeTraits.map((c) => c.trait);
		expect(traitNames).toContain('@SignatureBlock');
		expect(traitNames).toContain('@AuditTrail');
	});
});

// ── Trait handlers ───────────────────────────────────────────────────────────

describe('traitHandlers', () => {
	it('exports four trait handlers', () => {
		expect(traitHandlers).toHaveLength(4);
	});

	it('each handler has name, defaultConfig, and lifecycle methods', () => {
		for (const handler of traitHandlers) {
			expect(typeof handler.name).toBe('string');
			expect(handler.defaultConfig).toBeDefined();
			expect(typeof handler.onAttach).toBe('function');
			expect(typeof handler.onDetach).toBe('function');
			expect(typeof handler.onUpdate).toBe('function');
			expect(typeof handler.onEvent).toBe('function');
		}
	});
});

// ── legalDocumentPlugin composite ───────────────────────────────────────────

describe('legalDocumentPlugin', () => {
	it('exposes meta, traitHandlers, validate and parse functions', () => {
		expect(legalDocumentPlugin.meta).toBe(pluginMeta);
		expect(legalDocumentPlugin.traitHandlers).toBe(traitHandlers);
		expect(typeof legalDocumentPlugin.validateSpatialLegalContract).toBe('function');
		expect(typeof legalDocumentPlugin.parseSpatialLegalContract).toBe('function');
	});
});

// ── validateSpatialLegalContract ────────────────────────────────────────────

describe('validateSpatialLegalContract', () => {
	it('validates a well-formed contract successfully', () => {
		const result = validateSpatialLegalContract(makeContract());
		expect(result.valid).toBe(true);
		expect(result.issues).toHaveLength(0);
		expect(result.value).toBeDefined();
	});

	it('returns the parsed value unchanged', () => {
		const contract = makeContract();
		const result = validateSpatialLegalContract(contract);
		expect(result.value?.documentId).toBe('doc-001');
		expect(result.value?.parties).toEqual(['Alice Corp', 'Bob LLC']);
	});

	it('rejects non-object input', () => {
		const result = validateSpatialLegalContract('not-an-object');
		expect(result.valid).toBe(false);
		expect(result.issues[0].path).toBe('root');
	});

	it('rejects null input', () => {
		expect(validateSpatialLegalContract(null).valid).toBe(false);
	});

	it('rejects missing documentId', () => {
		const { documentId: _d, ...rest } = makeContract();
		const result = validateSpatialLegalContract(rest);
		expect(result.valid).toBe(false);
		expect(result.issues.some((i) => i.path === 'documentId')).toBe(true);
	});

	it('rejects empty documentId string', () => {
		const result = validateSpatialLegalContract(makeContract({ documentId: '' }));
		expect(result.valid).toBe(false);
	});

	it('rejects missing title', () => {
		const { title: _t, ...rest } = makeContract();
		const result = validateSpatialLegalContract(rest);
		expect(result.valid).toBe(false);
	});

	it('rejects missing jurisdiction', () => {
		const { jurisdiction: _j, ...rest } = makeContract();
		const result = validateSpatialLegalContract(rest);
		expect(result.valid).toBe(false);
	});

	it('rejects empty parties array', () => {
		const result = validateSpatialLegalContract(makeContract({ parties: [] }));
		expect(result.valid).toBe(false);
		expect(result.issues.some((i) => i.path === 'parties')).toBe(true);
	});

	it('rejects non-string party entry', () => {
		const result = validateSpatialLegalContract(makeContract({ parties: [42 as unknown as string] }));
		expect(result.valid).toBe(false);
	});
});

// ── Clause validation ───────────────────────────────────────────────────────

describe('validateSpatialLegalContract – clauses', () => {
	it('accepts clauses without coordinates3d', () => {
		const clause = { id: 'c1', title: 'Term', content: 'One year term.' };
		const result = validateSpatialLegalContract(makeContract({ clauses: [clause] }));
		expect(result.valid).toBe(true);
	});

	it('rejects clause with invalid coordinates3d (wrong length)', () => {
		const clause = { ...validClause, coordinates3d: [0, 1] as unknown as [number, number, number] };
		const result = validateSpatialLegalContract(makeContract({ clauses: [clause] }));
		expect(result.valid).toBe(false);
	});

	it('rejects clause with non-number coordinate', () => {
		const clause = { ...validClause, coordinates3d: [0, 'up', 0] as unknown as [number, number, number] };
		const result = validateSpatialLegalContract(makeContract({ clauses: [clause] }));
		expect(result.valid).toBe(false);
	});

	it('rejects clause missing id', () => {
		const { id: _id, ...clause } = validClause;
		const result = validateSpatialLegalContract(makeContract({ clauses: [clause as SpatialClause] }));
		expect(result.valid).toBe(false);
	});
});

// ── SignatureBlock validation ────────────────────────────────────────────────

describe('validateSpatialLegalContract – signatureBlock', () => {
	it('accepts electronic signature method', () => {
		const result = validateSpatialLegalContract(makeContract());
		expect(result.valid).toBe(true);
	});

	it('accepts wet and hybrid signature methods', () => {
		for (const method of ['wet', 'hybrid'] as const) {
			const block = { ...validSignatureBlock, signatureMethod: method };
			const result = validateSpatialLegalContract(makeContract({ signatureBlock: block }));
			expect(result.valid).toBe(true);
		}
	});

	it('rejects invalid signatureMethod', () => {
		const block = { ...validSignatureBlock, signatureMethod: 'digital' as unknown as SignatureBlock['signatureMethod'] };
		const result = validateSpatialLegalContract(makeContract({ signatureBlock: block }));
		expect(result.valid).toBe(false);
	});

	it('rejects requiredSignatures of 0', () => {
		const block = { ...validSignatureBlock, requiredSignatures: 0 };
		const result = validateSpatialLegalContract(makeContract({ signatureBlock: block }));
		expect(result.valid).toBe(false);
	});

	it('accepts signatureBlock without witnesses', () => {
		const { witnesses: _w, ...block } = validSignatureBlock;
		const result = validateSpatialLegalContract(makeContract({ signatureBlock: block as SignatureBlock }));
		expect(result.valid).toBe(true);
	});

	it('rejects witnesses that is not an array', () => {
		const block = { ...validSignatureBlock, witnesses: 'invalid' as unknown as SignatureBlock['witnesses'] };
		const result = validateSpatialLegalContract(makeContract({ signatureBlock: block }));
		expect(result.valid).toBe(false);
	});
});

// ── AuditTrail validation ────────────────────────────────────────────────────

describe('validateSpatialLegalContract – auditTrail', () => {
	it('accepts audit trail with optional hash', () => {
		const result = validateSpatialLegalContract(makeContract());
		expect(result.valid).toBe(true);
	});

	it('accepts empty audit trail array', () => {
		const result = validateSpatialLegalContract(makeContract({ auditTrail: [] }));
		expect(result.valid).toBe(true);
	});

	it('rejects audit entry missing actor', () => {
		const entry = { id: 'a1', action: 'created', timestamp: '2025-01-01T00:00:00Z' } as AuditTrailEntry;
		const result = validateSpatialLegalContract(makeContract({ auditTrail: [entry] }));
		expect(result.valid).toBe(false);
	});

	it('rejects audit entry with non-string hash', () => {
		const entry = { ...validAuditTrail[0], hash: 123 as unknown as string };
		const result = validateSpatialLegalContract(makeContract({ auditTrail: [entry] }));
		expect(result.valid).toBe(false);
	});

	it('rejects non-array auditTrail', () => {
		const result = validateSpatialLegalContract(makeContract({ auditTrail: 'invalid' as unknown as AuditTrailEntry[] }));
		expect(result.valid).toBe(false);
	});
});

// ── parseSpatialLegalContract  ───────────────────────────────────────────────

describe('parseSpatialLegalContract', () => {
	it('returns the parsed contract on valid input', () => {
		const contract = makeContract();
		const parsed = parseSpatialLegalContract(contract);
		expect(parsed.documentId).toBe('doc-001');
		expect(parsed.clauses).toHaveLength(1);
	});

	it('throws on invalid input', () => {
		expect(() => parseSpatialLegalContract({ documentId: '' })).toThrow(
			/Invalid spatial legal contract payload/
		);
	});

	it('thrown error message includes field paths', () => {
		let msg = '';
		try {
			parseSpatialLegalContract({});
		} catch (err) {
			msg = (err as Error).message;
		}
		expect(msg).toContain('documentId');
	});
});
