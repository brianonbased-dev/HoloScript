declare module '@holoscript/absorb-service/daemon' {
  export interface DaemonChatRequest {
    system: string;
    prompt: string;
    maxTokens?: number;
  }

  export interface DaemonChatResponse {
    text: string;
    inputTokens?: number;
    outputTokens?: number;
  }

  export interface LLMProvider {
    chat(req: DaemonChatRequest): Promise<DaemonChatResponse>;
  }

  export interface DaemonExecResult {
    code: number | null;
    stdout: string;
    stderr: string;
  }

  export interface DaemonHost {
    readFile(path: string): string;
    writeFile(path: string, content: string | Buffer): void;
    exists(path: string): boolean;
    exec(
      cmd: string,
      args?: string[],
      execOpts?: { cwd?: string; timeoutMs?: number }
    ): Promise<DaemonExecResult>;
  }

  export interface DaemonConfig {
    [key: string]: any;
  }

  export function createDaemonActions(...args: any[]): any;
  export function getDaemonFileState(...args: any[]): any;
}
