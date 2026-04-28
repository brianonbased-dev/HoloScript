import Anthropic from '@anthropic-ai/sdk';

export interface SandboxResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export class InMemoryFsSandbox {
  private files = new Map<string, string>();

  read(path: string): SandboxResult {
    if (!this.files.has(path)) {
      return { success: false, error: `ENOENT: ${path}` };
    }
    return { success: true, data: this.files.get(path) };
  }

  write(path: string, content: string): SandboxResult {
    this.files.set(path, content);
    return { success: true, data: { path, bytes: content.length } };
  }

  edit(path: string, oldStr: string, newStr: string): SandboxResult {
    if (!this.files.has(path)) {
      return { success: false, error: `ENOENT: ${path}` };
    }
    const cur = this.files.get(path)!;
    if (!cur.includes(oldStr)) {
      return { success: false, error: `old_string not found in ${path}` };
    }
    this.files.set(path, cur.replace(oldStr, newStr));
    return { success: true, data: { path } };
  }

  list(): SandboxResult {
    return { success: true, data: Array.from(this.files.keys()) };
  }

  snapshot(): Record<string, string> {
    return Object.fromEntries(this.files.entries());
  }
}

export const FS_TOOLS: Anthropic.Tool[] = [
  {
    name: 'read_file',
    description: 'Read the contents of a file from the sandbox.',
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description:
      'Write content to a file in the sandbox. Creates parent directories implicitly. Use this to emit your scene description, code, or other artifacts.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        content: { type: 'string' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'edit_file',
    description:
      'Replace one occurrence of old_string with new_string in a file. Fails if file does not exist or old_string is not present.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        old_string: { type: 'string' },
        new_string: { type: 'string' },
      },
      required: ['path', 'old_string', 'new_string'],
    },
  },
  {
    name: 'list_files',
    description: 'List all files currently in the sandbox.',
    input_schema: { type: 'object', properties: {} },
  },
];

export function executeFsTool(
  sandbox: InMemoryFsSandbox,
  name: string,
  input: Record<string, unknown>
): SandboxResult {
  switch (name) {
    case 'read_file':
      return sandbox.read(String(input.path));
    case 'write_file':
      return sandbox.write(String(input.path), String(input.content));
    case 'edit_file':
      return sandbox.edit(
        String(input.path),
        String(input.old_string),
        String(input.new_string)
      );
    case 'list_files':
      return sandbox.list();
    default:
      return { success: false, error: `unknown tool: ${name}` };
  }
}
