/**
 * Implementation of the WebWorker / worker_thread entry point.
 * 
 * Runs the HoloScriptLSP and IncrementalCompiler in a disjoint thread,
 * eliminating main-thread synchronous blocking during large scene ingestion.
 */

import { parentPort } from 'worker_threads';
import { HoloScriptLSP } from '../lsp/HoloScriptLSP';
import { IncrementalCompiler } from '../compiler/IncrementalCompiler';
import { 
  WorkerRequest, 
  WorkerResponse, 
  GetAtPositionPayload, 
  UpdateDocumentPayload,
  CompileScenePayload
} from './LSPWorkerProtocol';

// Singleton instances owned entirely by the worker
let lspServer: HoloScriptLSP | null = null;
let compiler: IncrementalCompiler | null = null;

if (parentPort) {
  parentPort.on('message', async (req: WorkerRequest) => {
    const { id, command, payload } = req;
    
    try {
      let result;
      switch (command) {
        case 'INIT':
          if (!lspServer) lspServer = new HoloScriptLSP();
          if (!compiler) compiler = new IncrementalCompiler();
          result = { initialized: true };
          break;

        case 'UPDATE_DOCUMENT':
          if (!lspServer) throw new Error('Worker not initialized');
          const update = payload as UpdateDocumentPayload;
          (lspServer as any).updateDocument(update.uri, update.content, update.version);
          // Auto-trigger incremental background state graph compilation if compiler exists
          if (compiler) {
             (compiler as any).registerDependency(update.uri, { sourceId: update.uri, codeCtx: update.content });
             (compiler as any).compileIncremental();
          }
          result = { updated: true };
          break;

        case 'GET_DIAGNOSTICS':
          if (!lspServer) throw new Error('Worker not initialized');
          result = lspServer.getDiagnostics(payload as string);
          break;

        case 'GET_COMPLETIONS':
          if (!lspServer) throw new Error('Worker not initialized');
          const compPl = payload as GetAtPositionPayload;
          result = lspServer.getCompletions(compPl.uri, compPl.position);
          break;

        case 'GET_HOVER':
          if (!lspServer) throw new Error('Worker not initialized');
          const hoverPl = payload as GetAtPositionPayload;
          result = lspServer.getHover(hoverPl.uri, hoverPl.position);
          break;

        case 'GET_DEFINITION':
          if (!lspServer) throw new Error('Worker not initialized');
          const defPl = payload as GetAtPositionPayload;
          result = lspServer.getDefinition(defPl.uri, defPl.position);
          break;

        case 'COMPILE_SCENE':
          if (!compiler) throw new Error('Compiler not initialized');
          const compSce = payload as CompileScenePayload;
          const status = await (compiler as any).compile?.() ?? { success: false };
          // Flatten representation to avoid cyclic object errors over postMessage
          result = {
            uri: compSce.uri,
            success: status.success,
            flattenedEdgeCount: (compiler as any).dependencyGraph?.size || 0
          };
          break;

        default:
          throw new Error(`Unknown command: ${command}`);
      }

      const response: WorkerResponse = { id, payload: result };
      parentPort!.postMessage(response);
    } catch (err: any) {
      const errResponse: WorkerResponse = { id, error: err.message };
      parentPort!.postMessage(errResponse);
    }
  });
}
