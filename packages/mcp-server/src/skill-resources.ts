/**
 * Skill Resource Discovery — expose ~/.claude/skills/<name>/SKILL.md as MCP resources.
 *
 * PATH B alternative: instead of backend tool-per-skill, surfaces let the client
 * LLM apply the prompt itself. Codex / Copilot / Gemini discover the catalog via
 * standard MCP resources/list + resources/read.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

const SKILLS_DIR = path.join(os.homedir(), '.claude', 'skills');

export interface SkillResource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

/**
 * Discover every SKILL.md under ~/.claude/skills/<name>/SKILL.md.
 * Returns stable sorted order (alphabetical by skill name).
 */
export function listSkillResources(): SkillResource[] {
  const resources: SkillResource[] = [];

  if (!fs.existsSync(SKILLS_DIR)) {
    return resources;
  }

  const entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillPath = path.join(SKILLS_DIR, entry.name, 'SKILL.md');
    if (!fs.existsSync(skillPath)) continue;

    // Derive a short description from the first non-empty line
    let description = `HoloScript skill: ${entry.name}`;
    try {
      const raw = fs.readFileSync(skillPath, 'utf-8');
      const firstLine = raw.split(/\r?\n/).find((l) => l.trim().length > 0);
      if (firstLine) {
        description = firstLine.trim().replace(/^#+\s*/, '').slice(0, 200);
      }
    } catch {
      // ignore read errors, fall back to generic description
    }

    resources.push({
      uri: `skill://${entry.name}`,
      name: entry.name,
      description,
      mimeType: 'text/markdown',
    });
  }

  resources.sort((a, b) => a.name.localeCompare(b.name));
  return resources;
}

/**
 * Read the contents of a skill://<name> URI.
 * Returns null if the URI is unrecognized or the file cannot be read.
 */
export function readSkillResource(uri: string): { text: string; mimeType: string } | null {
  const prefix = 'skill://';
  if (!uri.startsWith(prefix)) return null;

  const skillName = uri.slice(prefix.length).split('/')[0];
  if (!skillName || skillName.includes('..') || skillName.includes(path.sep)) {
    return null;
  }

  const skillPath = path.join(SKILLS_DIR, skillName, 'SKILL.md');
  if (!fs.existsSync(skillPath)) return null;

  try {
    const text = fs.readFileSync(skillPath, 'utf-8');
    return { text, mimeType: 'text/markdown' };
  } catch {
    return null;
  }
}
