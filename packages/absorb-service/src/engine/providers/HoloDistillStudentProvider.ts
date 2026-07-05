import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import type { EmbeddingProvider, HoloDistillEncoder } from './EmbeddingProvider';

export interface HoloDistillStudentProviderOptions {
  studentPath: string;
  baseModel?: string;
  pythonCommand?: string;
  maxLength?: number;
  outDim?: number;
  timeoutMs?: number;
  encoderScript?: string;
  encoder?: HoloDistillEncoder;
  env?: NodeJS.ProcessEnv;
}

interface EncoderPayload {
  studentPath: string;
  baseModel: string;
  maxLength: number;
  outDim: number;
  texts: string[];
}

const DEFAULT_BASE_MODEL = 'sentence-transformers/all-MiniLM-L6-v2';
const DEFAULT_MAX_LENGTH = 128;
const DEFAULT_OUT_DIM = 768;
const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * HoloDistill M1a query-tower provider.
 *
 * The current promoted artifact is PyTorch safetensors, not ONNX. To keep
 * absorb-service in the same embedding space as HoloTune today, this provider
 * owns the Node-side EmbeddingProvider contract and delegates the actual
 * safetensors load/forward pass to the local Python stack used by HoloTune.
 */
export class HoloDistillStudentProvider implements EmbeddingProvider {
  readonly name = 'holodistill-m1a-student';

  private readonly studentPath: string;
  private readonly baseModel: string;
  private readonly pythonCommand: string;
  private readonly maxLength: number;
  private readonly outDim: number;
  private readonly timeoutMs: number;
  private readonly encoderScript: string;
  private readonly encoder: HoloDistillEncoder | null;
  private readonly env: NodeJS.ProcessEnv;

  constructor(options: HoloDistillStudentProviderOptions) {
    if (!options.studentPath) {
      throw new Error('HoloDistillStudentProvider requires studentPath.');
    }

    this.studentPath = options.studentPath;
    this.baseModel = options.baseModel ?? DEFAULT_BASE_MODEL;
    this.pythonCommand = options.pythonCommand ?? process.env.HOLODISTILL_HOLOEMBED_PYTHON ?? 'python';
    this.maxLength = options.maxLength ?? DEFAULT_MAX_LENGTH;
    this.outDim = options.outDim ?? DEFAULT_OUT_DIM;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.encoderScript = options.encoderScript ?? PYTHON_ENCODER_SCRIPT;
    this.encoder = options.encoder ?? null;
    this.env = options.env ?? process.env;
  }

  async getEmbeddings(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    if (!fs.existsSync(this.studentPath)) {
      throw new Error(`HoloDistill student safetensors not found: ${this.studentPath}`);
    }

    const payload: EncoderPayload = {
      studentPath: this.studentPath,
      baseModel: this.baseModel,
      maxLength: this.maxLength,
      outDim: this.outDim,
      texts,
    };

    const response = this.encoder
      ? await this.encoder(payload)
      : await this.runPythonEncoder(payload);
    return validateEmbeddings(response.embeddings, texts.length, this.outDim);
  }

  private runPythonEncoder(payload: EncoderPayload): Promise<{ embeddings: unknown }> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.pythonCommand, ['-c', this.encoderScript], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...this.env,
          TOKENIZERS_PARALLELISM: this.env.TOKENIZERS_PARALLELISM ?? 'false',
        },
      });

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, this.timeoutMs);

      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.on('data', (chunk: string) => {
        stderr += chunk;
      });
      child.on('error', (error) => {
        clearTimeout(timer);
        reject(
          new Error(
            `HoloDistill Python encoder failed to start (${this.pythonCommand}): ${error.message}`
          )
        );
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (timedOut) {
          reject(new Error(`HoloDistill Python encoder timed out after ${this.timeoutMs}ms.`));
          return;
        }
        if (code !== 0) {
          reject(
            new Error(
              `HoloDistill Python encoder exited ${code}. ${stderr.trim() || stdout.trim()}`
            )
          );
          return;
        }

        try {
          resolve(parseEncoderJson(stdout));
        } catch (error) {
          reject(
            new Error(
              `HoloDistill Python encoder returned invalid JSON: ${
                error instanceof Error ? error.message : String(error)
              }. stderr=${stderr.trim()}`
            )
          );
        }
      });

      child.stdin.end(JSON.stringify(payload));
    });
  }
}

function parseEncoderJson(stdout: string): { embeddings: unknown } {
  const trimmed = stdout.trim();
  if (!trimmed) throw new Error('empty stdout');
  return JSON.parse(trimmed) as { embeddings: unknown };
}

function validateEmbeddings(value: unknown, expectedRows: number, expectedDim: number): number[][] {
  if (!Array.isArray(value)) {
    throw new Error('HoloDistill encoder response must include embeddings array.');
  }
  if (value.length !== expectedRows) {
    throw new Error(
      `HoloDistill encoder returned ${value.length} embeddings for ${expectedRows} texts.`
    );
  }

  return value.map((row, rowIndex) => {
    if (!Array.isArray(row)) {
      throw new Error(`HoloDistill embedding row ${rowIndex} is not an array.`);
    }
    if (row.length !== expectedDim) {
      throw new Error(
        `HoloDistill embedding row ${rowIndex} has dim ${row.length}; expected ${expectedDim}.`
      );
    }
    return row.map((raw, colIndex) => {
      if (typeof raw !== 'number' || !Number.isFinite(raw)) {
        throw new Error(
          `HoloDistill embedding row ${rowIndex} contains non-finite value at ${colIndex}.`
        );
      }
      return raw;
    });
  });
}

const PYTHON_ENCODER_SCRIPT = String.raw`
import json
import sys

payload = json.load(sys.stdin)

try:
    import torch
    import torch.nn as nn
    import torch.nn.functional as F
    from safetensors.torch import load_file
    from transformers import AutoModel, AutoTokenizer

    texts = payload["texts"]
    max_length = int(payload.get("maxLength") or 128)
    out_dim = int(payload.get("outDim") or 768)
    tokenizer = AutoTokenizer.from_pretrained(payload["baseModel"])
    backbone = AutoModel.from_pretrained(payload["baseModel"])
    hidden = backbone.config.hidden_size

    class Student(nn.Module):
        def __init__(self):
            super().__init__()
            self.backbone = backbone
            self.head = nn.Linear(hidden, out_dim)

        def forward(self, input_ids, attention_mask):
            out = self.backbone(input_ids=input_ids, attention_mask=attention_mask).last_hidden_state
            mask = attention_mask.unsqueeze(-1).float()
            pooled = (out * mask).sum(1) / mask.sum(1).clamp(min=1e-9)
            return F.normalize(self.head(pooled), dim=-1)

    student = Student()
    state = load_file(payload["studentPath"])
    stripped = {
        (key[len("student."):] if key.startswith("student.") else key): value
        for key, value in state.items()
    }
    student.load_state_dict(stripped, strict=False)
    student.eval()

    with torch.no_grad():
        enc = tokenizer(
            texts,
            padding=True,
            truncation=True,
            max_length=max_length,
            return_tensors="pt",
        )
        vec = student(enc["input_ids"], enc["attention_mask"]).cpu().numpy().astype("float32")

    print(json.dumps({"embeddings": vec.tolist()}))
except Exception as exc:
    print(str(exc), file=sys.stderr)
    raise
`;
