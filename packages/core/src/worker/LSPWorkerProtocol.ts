/**
 * WebWorker Protocol Definition for HoloScript LSP and Compiler
 * 
 * Defines message shapes to preserve type safety across the worker thread boundary.
 */

import { Diagnostic, CompletionItem, Location } from 'vscode-languageserver/node';

export type WorkerCommand = 
  | 'INIT'
  | 'UPDATE_DOCUMENT'
  | 'GET_DIAGNOSTICS'
  | 'GET_COMPLETIONS'
  | 'GET_HOVER'
  | 'GET_DEFINITION'
  | 'COMPILE_SCENE';

export interface WorkerRequest<T = any> {
  id: string;
  command: WorkerCommand;
  payload: T;
}

export interface WorkerResponse<T = any> {
  id: string;
  error?: string;
  payload?: T;
}

// Payloads
export interface UpdateDocumentPayload {
  uri: string;
  content: string;
  version: number;
}

export interface PositionPayload {
  line: number;
  character: number;
}

export interface GetAtPositionPayload {
  uri: string;
  position: PositionPayload;
}

export interface CompileScenePayload {
  uri: string;
  content: string;
  isIncremental: boolean;
}

// Flat serialization responses for Compiler
export interface CompiledSceneResponse {
  uri: string;
  success: boolean;
  moduleData: Uint8Array | null;
  flattenedEdgeCount: number;
}
