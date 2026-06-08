export type MutationToolName = 'edit_holo' | 'trait_swap';

export interface HoloDocumentStore {
  read(documentId: string): Promise<string | undefined> | string | undefined;
  write(documentId: string, source: string): Promise<void> | void;
}

export interface MutationPreview {
  type: 'mutation-preview';
  previewId: string;
  toolName: MutationToolName;
  documentId: string;
  beforeSource: string;
  afterSource: string;
  diff: string;
  requiresConfirmation: true;
  status: 'pending';
  message: string;
  reason?: string;
  createdAt: string;
}

export interface MutationConfirmResult {
  type: 'mutation-confirm';
  previewId: string;
  documentId?: string;
  applied: boolean;
  status: 'applied' | 'missing';
  message: string;
}

export interface MutationControllerOptions {
  now?: () => Date;
  idFactory?: () => string;
}

const MUTATION_TOOL_NAMES = new Set<string>(['edit_holo', 'trait_swap']);

export function isMutationToolName(name: string): name is MutationToolName {
  return MUTATION_TOOL_NAMES.has(name);
}

export class InMemoryHoloDocumentStore implements HoloDocumentStore {
  private readonly documents = new Map<string, string>();

  constructor(initialDocuments: Record<string, string> = {}) {
    for (const [id, source] of Object.entries(initialDocuments)) {
      this.documents.set(id, source);
    }
  }

  read(documentId: string): string | undefined {
    return this.documents.get(documentId);
  }

  write(documentId: string, source: string): void {
    this.documents.set(documentId, source);
  }
}

export class RefusableMutationController {
  private readonly pending = new Map<string, MutationPreview>();
  private sequence = 0;

  constructor(
    private readonly store: HoloDocumentStore,
    private readonly options: MutationControllerOptions = {}
  ) {}

  async previewToolCall(toolName: string, args: Record<string, unknown>): Promise<MutationPreview> {
    if (!isMutationToolName(toolName)) {
      throw new Error(`unknown mutating tool: ${toolName}`);
    }

    const documentId = readRequiredString(args, 'documentId');
    const beforeSource = await this.store.read(documentId);
    if (beforeSource === undefined) {
      throw new Error(`document not found: ${documentId}`);
    }

    const afterSource =
      toolName === 'edit_holo'
        ? buildEditHoloSource(args)
        : buildTraitSwapSource(beforeSource, args);
    const previewId = this.nextPreviewId();
    const preview: MutationPreview = {
      type: 'mutation-preview',
      previewId,
      toolName,
      documentId,
      beforeSource,
      afterSource,
      diff: buildUnifiedDiff(documentId, beforeSource, afterSource),
      requiresConfirmation: true,
      status: 'pending',
      message:
        'Diff preview only. No change is applied until the operator confirms this previewId.',
      reason: readOptionalString(args, 'reason'),
      createdAt: (this.options.now?.() ?? new Date()).toISOString(),
    };
    this.pending.set(previewId, preview);
    return preview;
  }

  async confirm(previewId: string): Promise<MutationConfirmResult> {
    const preview = this.pending.get(previewId);
    if (!preview) {
      return {
        type: 'mutation-confirm',
        previewId,
        applied: false,
        status: 'missing',
        message: 'No pending mutation preview matches that previewId.',
      };
    }

    await this.store.write(preview.documentId, preview.afterSource);
    this.pending.delete(previewId);
    return {
      type: 'mutation-confirm',
      previewId,
      documentId: preview.documentId,
      applied: true,
      status: 'applied',
      message: 'Mutation applied after explicit operator confirmation.',
    };
  }

  reject(previewId: string): boolean {
    return this.pending.delete(previewId);
  }

  getPending(previewId: string): MutationPreview | undefined {
    return this.pending.get(previewId);
  }

  private nextPreviewId(): string {
    if (this.options.idFactory) return this.options.idFactory();
    this.sequence += 1;
    return `preview_${Date.now().toString(36)}_${this.sequence.toString(36)}`;
  }
}

function buildEditHoloSource(args: Record<string, unknown>): string {
  return readRequiredString(args, 'nextSource');
}

function buildTraitSwapSource(beforeSource: string, args: Record<string, unknown>): string {
  const fromTrait = normalizeTrait(readRequiredString(args, 'fromTrait'));
  const toTrait = normalizeTrait(readRequiredString(args, 'toTrait'));
  const matcher = new RegExp(escapeRegExp(fromTrait), 'g');
  return beforeSource.replace(matcher, toTrait);
}

function readRequiredString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`mutation argument ${key} must be a non-empty string`);
  }
  return value;
}

function readOptionalString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function normalizeTrait(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildUnifiedDiff(
  documentId: string,
  beforeSource: string,
  afterSource: string
): string {
  if (beforeSource === afterSource) {
    return `--- ${documentId}\n+++ ${documentId}\n`;
  }
  const beforeLines = beforeSource.split(/\r?\n/);
  const afterLines = afterSource.split(/\r?\n/);
  return [
    `--- ${documentId}`,
    `+++ ${documentId}`,
    ...beforeLines.map((line) => `-${line}`),
    ...afterLines.map((line) => `+${line}`),
  ].join('\n');
}
