import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEmbeddingProvider } from '../providers/EmbeddingProviderFactory';
import { HoloDistillStudentProvider } from '../providers/HoloDistillStudentProvider';
import type { EmbeddingProviderName, HoloDistillEncoder } from '../providers/EmbeddingProvider';

describe('HoloDistillStudentProvider', () => {
  it('wraps the HoloDistill M1a student query tower behind EmbeddingProvider', async () => {
    const studentPath = writeFixtureStudent();
    const encoder: HoloDistillEncoder = async (payload) => ({
      embeddings: payload.texts.map((_, index) => (index === 0 ? [1, 0, 0] : [0, 1, 0])),
    });
    const provider = new HoloDistillStudentProvider({
      studentPath,
      outDim: 3,
      encoder,
    });

    const embeddings = await provider.getEmbeddings(['target', 'other']);

    expect(provider.name).toBe('holodistill-m1a-student');
    expect(embeddings).toEqual([
      [1, 0, 0],
      [0, 1, 0],
    ]);
  });

  it('is selectable from createEmbeddingProvider', async () => {
    const studentPath = writeFixtureStudent();
    const encoder: HoloDistillEncoder = async () => ({ embeddings: [[0, 0, 1]] });

    const provider = await createEmbeddingProvider({
      provider: 'holodistill-m1a-student',
      holodistillStudentPath: studentPath,
      holodistillOutDim: 3,
      holodistillEncoder: encoder,
    });

    expect(provider.name).toBe('holodistill-m1a-student');
    await expect(provider.getEmbeddings(['query'])).resolves.toEqual([[0, 0, 1]]);
  });

  it('validates encoder dimensions before returning vectors', async () => {
    const studentPath = writeFixtureStudent();
    const provider = new HoloDistillStudentProvider({
      studentPath,
      outDim: 3,
      encoder: async () => ({ embeddings: [[1, 0]] }),
    });

    await expect(provider.getEmbeddings(['bad dim'])).rejects.toThrow(/expected 3/);
  });

  it('EmbeddingProviderName type includes holodistill-m1a-student', () => {
    const name: EmbeddingProviderName = 'holodistill-m1a-student';
    expect(name).toBe('holodistill-m1a-student');
  });
});

function writeFixtureStudent(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'holodistill-provider-'));
  const studentPath = path.join(dir, 'student.safetensors');
  fs.writeFileSync(studentPath, 'fixture');
  return studentPath;
}
