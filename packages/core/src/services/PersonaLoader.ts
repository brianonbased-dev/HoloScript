/**
 * Persona Loader Service
 *
 * Handles the serialization and deserialization of NPC neural states.
 * Allows NPCs to persist their personality and memories across sessions.
 *
 * @version 1.0.0
 */

import { NeuralState } from '../traits/NeuralForgeTrait';
import * as fs from 'fs/promises';
import * as path from 'path';

export class PersonaLoader {
  private storageDir: string;

  constructor(storageDir: string = './personas') {
    this.storageDir = storageDir;
  }

  async ensureStorage(): Promise<void> {
    try {
      await fs.mkdir(this.storageDir, { recursive: true });
    } catch (e) {
      // Ignore if exists
    }
  }

  async savePersona(npcId: string, state: NeuralState): Promise<void> {
    await this.ensureStorage();
    const filePath = path.join(this.storageDir, `${npcId}.json`);
    const data = JSON.stringify(state, null, 2);
    await fs.writeFile(filePath, data, 'utf-8');
  }

  async loadPersona(npcId: string): Promise<NeuralState | null> {
    try {
      const filePath = path.join(this.storageDir, `${npcId}.json`);
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data) as NeuralState;
    } catch (e) {
      return null;
    }
  }

  async listPersonas(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.storageDir);
      return files.filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''));
    } catch (e) {
      return [];
    }
  }
}
