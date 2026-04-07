import * as vscode from 'vscode';

export interface RelayMessage {
  type?: string;
  command?: string;
  [key: string]: unknown;
}

/**
 * Minimal relay bridge used by preview panel interactions.
 * Keeps extension build/runtime stable even when full relay backend is unavailable.
 */
export class RelayService {
  private static instance: RelayService | undefined;
  private readonly output = vscode.window.createOutputChannel('HoloScript Preview Relay');

  static getInstance(): RelayService {
    if (!RelayService.instance) {
      RelayService.instance = new RelayService();
    }
    return RelayService.instance;
  }

  handleMessage(message: RelayMessage, document: vscode.TextDocument): void {
    const kind = String(message.type ?? message.command ?? 'unknown');
    this.output.appendLine(`[relay] ${kind} -> ${document.fileName}`);
  }
}
