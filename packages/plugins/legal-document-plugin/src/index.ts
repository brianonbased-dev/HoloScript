export { createContractDraftHandler, type ContractDraftConfig, type ContractType, type Clause } from './traits/ContractDraftTrait';
export { createESignatureHandler, type ESignatureConfig, type Signer } from './traits/ESignatureTrait';
export { createCaseManagementHandler, type CaseManagementConfig, type CaseStatus } from './traits/CaseManagementTrait';
export { createProgrammableLawHandler, type ProgrammableLawConfig, type ProgrammableLawState } from './traits/ProgrammableLawTrait';
export * from './traits/types';

import { createContractDraftHandler } from './traits/ContractDraftTrait';
import { createESignatureHandler } from './traits/ESignatureTrait';
import { createCaseManagementHandler } from './traits/CaseManagementTrait';
import { createProgrammableLawHandler } from './traits/ProgrammableLawTrait';

export interface ValidationIssue {
	path: string;
	message: string;
}

export interface ValidationResult<T> {
	valid: boolean;
	issues: ValidationIssue[];
	value?: T;
}

export interface SignatureWitness {
	id: string;
	role: string;
	signedAt: string;
}

export interface SignatureBlock {
	signers: string[];
	requiredSignatures: number;
	signatureMethod: 'electronic' | 'wet' | 'hybrid';
	witnesses?: SignatureWitness[];
}

export interface AuditTrailEntry {
	id: string;
	actor: string;
	action: string;
	timestamp: string;
	hash?: string;
}

export interface SpatialClause {
	id: string;
	title: string;
	content: string;
	coordinates3d?: [number, number, number];
}

export interface SpatialLegalContract {
	documentId: string;
	title: string;
	jurisdiction: string;
	parties: string[];
	clauses: SpatialClause[];
	signatureBlock: SignatureBlock;
	auditTrail: AuditTrailEntry[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isString(value: unknown): value is string {
	return typeof value === 'string' && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((v) => typeof v === 'string' && v.trim().length > 0);
}

function isCoordinates3d(value: unknown): value is [number, number, number] {
	return Array.isArray(value) && value.length === 3 && value.every((v) => typeof v === 'number');
}

function validateSignatureBlock(
	value: unknown,
	path = 'signatureBlock'
): ValidationResult<SignatureBlock> {
	const issues: ValidationIssue[] = [];
	if (!isRecord(value)) {
		issues.push({ path, message: 'signatureBlock must be an object' });
		return { valid: false, issues };
	}

	const signers = value.signers;
	const requiredSignatures = value.requiredSignatures;
	const signatureMethod = value.signatureMethod;
	const witnesses = value.witnesses;

	if (!isStringArray(signers)) {
		issues.push({ path: `${path}.signers`, message: 'signers must be a non-empty string array' });
	}
	if (typeof requiredSignatures !== 'number' || requiredSignatures < 1) {
		issues.push({ path: `${path}.requiredSignatures`, message: 'requiredSignatures must be >= 1' });
	}
	if (signatureMethod !== 'electronic' && signatureMethod !== 'wet' && signatureMethod !== 'hybrid') {
		issues.push({
			path: `${path}.signatureMethod`,
			message: 'signatureMethod must be one of: electronic, wet, hybrid',
		});
	}

	if (witnesses !== undefined) {
		if (!Array.isArray(witnesses)) {
			issues.push({ path: `${path}.witnesses`, message: 'witnesses must be an array when provided' });
		} else {
			witnesses.forEach((witness, index) => {
				if (!isRecord(witness)) {
					issues.push({ path: `${path}.witnesses[${index}]`, message: 'witness must be an object' });
					return;
				}
				if (!isString(witness.id)) {
					issues.push({ path: `${path}.witnesses[${index}].id`, message: 'witness id is required' });
				}
				if (!isString(witness.role)) {
					issues.push({ path: `${path}.witnesses[${index}].role`, message: 'witness role is required' });
				}
				if (!isString(witness.signedAt)) {
					issues.push({
						path: `${path}.witnesses[${index}].signedAt`,
						message: 'witness signedAt timestamp is required',
					});
				}
			});
		}
	}

	if (issues.length > 0) {
		return { valid: false, issues };
	}

	return {
		valid: true,
		issues,
		value: {
			signers: signers as string[],
			requiredSignatures: requiredSignatures as number,
			signatureMethod: signatureMethod as SignatureBlock['signatureMethod'],
			witnesses: witnesses as SignatureWitness[] | undefined,
		},
	};
}

function validateAuditTrail(value: unknown, path = 'auditTrail'): ValidationResult<AuditTrailEntry[]> {
	const issues: ValidationIssue[] = [];
	if (!Array.isArray(value)) {
		issues.push({ path, message: 'auditTrail must be an array' });
		return { valid: false, issues };
	}

	value.forEach((entry, index) => {
		if (!isRecord(entry)) {
			issues.push({ path: `${path}[${index}]`, message: 'auditTrail entry must be an object' });
			return;
		}
		if (!isString(entry.id)) {
			issues.push({ path: `${path}[${index}].id`, message: 'audit entry id is required' });
		}
		if (!isString(entry.actor)) {
			issues.push({ path: `${path}[${index}].actor`, message: 'audit entry actor is required' });
		}
		if (!isString(entry.action)) {
			issues.push({ path: `${path}[${index}].action`, message: 'audit entry action is required' });
		}
		if (!isString(entry.timestamp)) {
			issues.push({ path: `${path}[${index}].timestamp`, message: 'audit entry timestamp is required' });
		}
		if (entry.hash !== undefined && !isString(entry.hash)) {
			issues.push({ path: `${path}[${index}].hash`, message: 'audit entry hash must be a string' });
		}
	});

	return {
		valid: issues.length === 0,
		issues,
		value: issues.length === 0 ? (value as AuditTrailEntry[]) : undefined,
	};
}

function validateClauses(value: unknown, path = 'clauses'): ValidationResult<SpatialClause[]> {
	const issues: ValidationIssue[] = [];
	if (!Array.isArray(value)) {
		issues.push({ path, message: 'clauses must be an array' });
		return { valid: false, issues };
	}

	value.forEach((clause, index) => {
		if (!isRecord(clause)) {
			issues.push({ path: `${path}[${index}]`, message: 'clause must be an object' });
			return;
		}
		if (!isString(clause.id)) {
			issues.push({ path: `${path}[${index}].id`, message: 'clause id is required' });
		}
		if (!isString(clause.title)) {
			issues.push({ path: `${path}[${index}].title`, message: 'clause title is required' });
		}
		if (!isString(clause.content)) {
			issues.push({ path: `${path}[${index}].content`, message: 'clause content is required' });
		}
		if (clause.coordinates3d !== undefined && !isCoordinates3d(clause.coordinates3d)) {
			issues.push({
				path: `${path}[${index}].coordinates3d`,
				message: 'coordinates3d must be [x, y, z] numbers',
			});
		}
	});

	return {
		valid: issues.length === 0,
		issues,
		value: issues.length === 0 ? (value as SpatialClause[]) : undefined,
	};
}

export function validateSpatialLegalContract(input: unknown): ValidationResult<SpatialLegalContract> {
	const issues: ValidationIssue[] = [];

	if (!isRecord(input)) {
		return {
			valid: false,
			issues: [{ path: 'root', message: 'Contract payload must be an object' }],
		};
	}

	if (!isString(input.documentId)) {
		issues.push({ path: 'documentId', message: 'documentId is required' });
	}
	if (!isString(input.title)) {
		issues.push({ path: 'title', message: 'title is required' });
	}
	if (!isString(input.jurisdiction)) {
		issues.push({ path: 'jurisdiction', message: 'jurisdiction is required' });
	}
	if (!isStringArray(input.parties) || (input.parties as unknown[]).length === 0) {
		issues.push({ path: 'parties', message: 'parties must be a non-empty string array' });
	}

	const clauseValidation = validateClauses(input.clauses);
	issues.push(...clauseValidation.issues);

	const signatureValidation = validateSignatureBlock(input.signatureBlock);
	issues.push(...signatureValidation.issues);

	const auditValidation = validateAuditTrail(input.auditTrail);
	issues.push(...auditValidation.issues);

	if (issues.length > 0 || !clauseValidation.value || !signatureValidation.value || !auditValidation.value) {
		return { valid: false, issues };
	}

	const documentId = input.documentId as string;
	const title = input.title as string;
	const jurisdiction = input.jurisdiction as string;
	const parties = input.parties as string[];

	return {
		valid: true,
		issues,
		value: {
			documentId,
			title,
			jurisdiction,
			parties,
			clauses: clauseValidation.value,
			signatureBlock: signatureValidation.value,
			auditTrail: auditValidation.value,
		},
	};
}

export function parseSpatialLegalContract(input: unknown): SpatialLegalContract {
	const validation = validateSpatialLegalContract(input);
	if (!validation.valid || !validation.value) {
		const messages = validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ');
		throw new Error(`Invalid spatial legal contract payload: ${messages}`);
	}
	return validation.value;
}

export const compilerNativeTraits = [
	{
		trait: '@SignatureBlock',
		binding: 'legal.signature.block',
		schema: 'SignatureBlock',
		description: 'Canonical signer block for legal documents rendered in 3D scenes.',
	},
	{
		trait: '@AuditTrail',
		binding: 'legal.audit.trail',
		schema: 'AuditTrailEntry[]',
		description: 'Immutable contract action history for compliance and dispute replay.',
	},
] as const;

export const pluginMeta = {
	name: '@holoscript/plugin-legal-document',
	version: '1.1.0',
	traits: [
		'contract_draft',
		'e_signature',
		'case_management',
		'programmable_law',
		'signature_block',
		'audit_trail',
	],
	compilerBindings: compilerNativeTraits,
};

export const traitHandlers = [
	createContractDraftHandler(),
	createESignatureHandler(),
	createCaseManagementHandler(),
	createProgrammableLawHandler(),
];

export const legalDocumentPlugin = {
	meta: pluginMeta,
	traitHandlers,
	validateSpatialLegalContract,
	parseSpatialLegalContract,
};
