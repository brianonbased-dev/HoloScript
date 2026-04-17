/**
 * Main Thread Proxy for the HoloScript Compiler/LSP Worker.
 * 
 * Exposes a Promise-based async API corresponding to the synchronous
 * LSP operations, acting as the primary integration layer for CLI/Studio.
 */

import { Worker } from 'worker_threads';
import * as path from 'path';
import { 
  WorkerRequest, 
  WorkerResponse, 
  WorkerCommand,
  GetAtPositionPayload,
  UpdateDocumentPayload
} from './LSPWorkerProtocol';

export class CompilerWorkerProxy {
  private worker: Worker;
  private messageIdCounter = 0;
  private pendingRequests: Map<string, { resolve: (val: any) => void; reject: (err: any) => void }> = new Map();

  constructor() {
    // Determine the precise path of the compiled worker
    // Assumption: when compiled to CJS/ESM, the js file will be at the same relative path
    const workerPath = path.join(__dirname, 'CompilerWorker.js');
    this.worker = new Worker(workerPath);

    this.worker.on('message', (response: WorkerResponse) => {
      const pending = this.pendingRequests.get(response.id);
      if (pending) {
        this.pendingRequests.delete(response.id);
        if (response.error) {
          pending.reject(new Error(response.error));
        } else {
          pending.resolve(response.payload);
        }
      }
    });

    this.worker.on('error', (err) => {
      console.error('[CompilerWorkerProxy] Worker Error:', err);
    });
  }

  private sendRequest<T>(command: WorkerCommand, payload?: any): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = `${command}_${this.messageIdCounter++}`;
      this.pendingRequests.set(id, { resolve, reject });
      
      const request: WorkerRequest = { id, command, payload };
      this.worker.postMessage(request);
    });
  }

  public async initialize(): Promise<void> {
    await this.sendRequest('INIT');
  }

  public updateDocument(uri: string, content: string, version: number): Promise<void> {
    return this.sendRequest('UPDATE_DOCUMENT', { uri, content, version } as UpdateDocumentPayload);
  }

  public getDiagnostics(uri: string): Promise<any[]> {
    return this.sendRequest('GET_DIAGNOSTICS', uri);
  }

  public getCompletions(uri: string, line: number, character: number): Promise<any[]> {
    return this.sendRequest('GET_COMPLETIONS', { uri, position: { line, character } } as GetAtPositionPayload);
  }

  public getHover(uri: string, line: number, character: number): Promise<any> {
    return this.sendRequest('GET_HOVER', { uri, position: { line, character } } as GetAtPositionPayload);
  }

  public getDefinition(uri: string, line: number, character: number): Promise<any> {
    return this.sendRequest('GET_DEFINITION', { uri, position: { line, character } } as GetAtPositionPayload);
  }

  public compileScene(uri: string, content: string, isIncremental: boolean = true): Promise<any> {
    return this.sendRequest('COMPILE_SCENE', { uri, content, isIncremental });
  }

  public terminate(): void {
    this.worker.terminate();
  }
}
