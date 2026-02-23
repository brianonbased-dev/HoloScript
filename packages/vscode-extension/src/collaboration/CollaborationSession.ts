/**
 * @fileoverview Collaboration session management
 * @module collaboration/CollaborationSession
 */

import * as vscode from 'vscode';
import type {
  CollaborationConfig,
  SessionInfo,
  Participant,
  PermissionLevel,
  InlineComment,
  SectionLock,
  UserInfo,
} from './CollaborationTypes';
import { CollaborativeDocument, createCollaborativeDocument } from './CollaborativeDocument';
import { PresenceProvider, getPresenceProvider } from './PresenceProvider';

/**
 * Session state
 */
export interface SessionState {
  isActive: boolean;
  sessionId: string | null;
  documentUri: string | null;
  participants: Participant[];
  comments: InlineComment[];
  locks: SectionLock[];
  permission: PermissionLevel;
}

/**
 * CollaborationSession manages the lifecycle of a collaboration session
 * including document synchronization, presence, and session controls.
 */
export class CollaborationSession implements vscode.Disposable {
  private collaborativeDoc: CollaborativeDocument | null = null;
  private presenceProvider: PresenceProvider | null = null;
  private state: SessionState;
  private disposables: vscode.Disposable[] = [];
  private documentSyncDisposable: vscode.Disposable | null = null;
  private outputChannel: vscode.OutputChannel;

  /**
   * Create a new CollaborationSession
   */
  constructor() {
    this.state = {
      isActive: false,
      sessionId: null,
      documentUri: null,
      participants: [],
      comments: [],
      locks: [],
      permission: 'view',
    };

    this.outputChannel = vscode.window.createOutputChannel('HoloScript Collaboration');
    this.disposables.push(this.outputChannel);
  }

  /**
   * Start a new collaboration session
   */
  async startSession(config: CollaborationConfig): Promise<SessionInfo> {
    if (this.state.isActive) {
      throw new Error('A session is already active. End it before starting a new one.');
    }

    this.log(`Starting collaboration session for room: ${config.roomId}`);

    try {
      // Create collaborative document
      this.collaborativeDoc = createCollaborativeDocument(config);

      // Get current document content
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        throw new Error('No active editor to collaborate on');
      }

      const initialContent = editor.document.getText();

      // Connect to collaboration server
      await this.collaborativeDoc.connect(initialContent);

      // Attach presence provider
      this.presenceProvider = getPresenceProvider();
      this.presenceProvider.attachToDocument(this.collaborativeDoc);

      // Set up document sync
      this.setupDocumentSync(editor.document);

      // Update state
      this.state = {
        isActive: true,
        sessionId: config.roomId,
        documentUri: editor.document.uri.toString(),
        participants: this.collaborativeDoc.getParticipants(),
        comments: [],
        locks: [],
        permission: 'edit',
      };

      this.log(`Session started successfully. Session ID: ${config.roomId}`);

      return {
        id: config.roomId,
        documentUri: editor.document.uri.toString(),
        createdAt: Date.now(),
        participants: this.state.participants,
        permissions: {
          canEdit: true,
          canView: true,
          canComment: true,
          canInvite: true,
          isOwner: true,
        },
      };
    } catch (error) {
      this.log(`Failed to start session: ${error}`);
      this.cleanup();
      throw error;
    }
  }

  /**
   * Join an existing collaboration session
   */
  async joinSession(sessionUrl: string, user: UserInfo): Promise<SessionInfo> {
    if (this.state.isActive) {
      throw new Error('A session is already active. End it before joining a new one.');
    }

    // Parse session URL to extract server and room
    const urlParts = this.parseSessionUrl(sessionUrl);

    const config: CollaborationConfig = {
      serverUrl: urlParts.serverUrl,
      roomId: urlParts.roomId,
      user,
    };

    this.log(`Joining collaboration session: ${urlParts.roomId}`);

    try {
      // Create collaborative document without initial content
      this.collaborativeDoc = createCollaborativeDocument(config);
      await this.collaborativeDoc.connect();

      // Wait for sync
      await this.waitForSync();

      // Create new document with synced content
      const content = this.collaborativeDoc.getContent();
      const doc = await vscode.workspace.openTextDocument({
        content,
        language: 'holoscript',
      });

      await vscode.window.showTextDocument(doc);

      // Attach presence provider
      this.presenceProvider = getPresenceProvider();
      this.presenceProvider.attachToDocument(this.collaborativeDoc);

      // Set up document sync
      this.setupDocumentSync(doc);

      // Update state
      this.state = {
        isActive: true,
        sessionId: urlParts.roomId,
        documentUri: doc.uri.toString(),
        participants: this.collaborativeDoc.getParticipants(),
        comments: [],
        locks: [],
        permission: 'edit',
      };

      this.log(`Joined session successfully. Session ID: ${urlParts.roomId}`);

      return {
        id: urlParts.roomId,
        documentUri: doc.uri.toString(),
        createdAt: Date.now(),
        participants: this.state.participants,
        permissions: {
          canEdit: true,
          canView: true,
          canComment: true,
          canInvite: false,
          isOwner: false,
        },
      };
    } catch (error) {
      this.log(`Failed to join session: ${error}`);
      this.cleanup();
      throw error;
    }
  }

  /**
   * End the current collaboration session
   */
  async endSession(): Promise<void> {
    if (!this.state.isActive) {
      return;
    }

    this.log('Ending collaboration session');
    this.cleanup();

    vscode.window.showInformationMessage('Collaboration session ended');
  }

  /**
   * Get the current session state
   */
  getState(): SessionState {
    return { ...this.state };
  }

  /**
   * Check if a session is active
   */
  isActive(): boolean {
    return this.state.isActive;
  }

  /**
   * Get a shareable session URL
   */
  getShareUrl(): string | null {
    if (!this.state.isActive || !this.state.sessionId) {
      return null;
    }

    // Generate a shareable URL
    return `holoscript://collaborate/${this.state.sessionId}`;
  }

  /**
   * Copy the share URL to clipboard
   */
  async copyShareUrl(): Promise<void> {
    const url = this.getShareUrl();
    if (url) {
      await vscode.env.clipboard.writeText(url);
      vscode.window.showInformationMessage('Collaboration link copied to clipboard');
    }
  }

  /**
   * Add an inline comment
   */
  async addComment(range: vscode.Range, text: string): Promise<InlineComment> {
    if (!this.state.isActive) {
      throw new Error('No active session');
    }

    const comment: InlineComment = {
      id: `comment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      author: {
        id: 'local_user', // Would come from auth
        name: 'You',
      },
      text,
      range: {
        start: { line: range.start.line, character: range.start.character },
        end: { line: range.end.line, character: range.end.character },
        isReversed: false,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      replies: [],
      resolved: false,
    };

    this.state.comments.push(comment);
    this.log(`Added comment: ${comment.id}`);

    return comment;
  }

  /**
   * Lock a section for exclusive editing
   */
  async lockSection(range: vscode.Range, reason?: string): Promise<SectionLock | null> {
    if (!this.state.isActive || this.state.permission !== 'edit') {
      return null;
    }

    // Check for existing locks in the range
    const hasConflict = this.state.locks.some((lock) =>
      this.rangesOverlap(lock.range, {
        start: { line: range.start.line, character: range.start.character },
        end: { line: range.end.line, character: range.end.character },
        isReversed: false,
      })
    );

    if (hasConflict) {
      vscode.window.showWarningMessage('This section is locked by another user');
      return null;
    }

    const lock: SectionLock = {
      id: `lock_${Date.now()}`,
      userId: 'local_user',
      range: {
        start: { line: range.start.line, character: range.start.character },
        end: { line: range.end.line, character: range.end.character },
        isReversed: false,
      },
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 minute lock
      reason,
    };

    this.state.locks.push(lock);
    this.log(`Section locked: ${lock.id}`);

    return lock;
  }

  /**
   * Release a section lock
   */
  async releaseLock(lockId: string): Promise<void> {
    const index = this.state.locks.findIndex((lock) => lock.id === lockId);
    if (index !== -1) {
      this.state.locks.splice(index, 1);
      this.log(`Lock released: ${lockId}`);
    }
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.cleanup();

    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }

  // Private methods

  private setupDocumentSync(document: vscode.TextDocument): void {
    // Clean up existing sync
    if (this.documentSyncDisposable) {
      this.documentSyncDisposable.dispose();
    }

    // Listen for local document changes
    const changeListener = vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.uri.toString() !== document.uri.toString()) {
        return;
      }

      if (!this.collaborativeDoc) {
        return;
      }

      // Apply changes to collaborative document
      for (const change of event.contentChanges) {
        this.collaborativeDoc.applyEdit({
          range: change.range,
          newText: change.text,
        });
      }
    });

    // Listen for remote changes
    this.collaborativeDoc?.on('remoteChanges', async (changes: vscode.TextEdit[]) => {
      const editor = vscode.window.visibleTextEditors.find(
        (e) => e.document.uri.toString() === document.uri.toString()
      );

      if (!editor) return;

      await editor.edit(
        (editBuilder) => {
          for (const change of changes) {
            if (change.newText === '') {
              editBuilder.delete(change.range);
            } else if (change.range.isEmpty) {
              editBuilder.insert(change.range.start, change.newText);
            } else {
              editBuilder.replace(change.range, change.newText);
            }
          }
        },
        { undoStopBefore: false, undoStopAfter: false }
      );
    });

    this.documentSyncDisposable = changeListener;
  }

  private parseSessionUrl(url: string): { serverUrl: string; roomId: string } {
    // Parse URLs like:
    // - holoscript://collaborate/room-id
    // - wss://collab.holoscript.net/room-id
    // - https://collab.holoscript.net/join/room-id

    // Default collaboration server
    const defaultServer = 'wss://collab.holoscript.net';

    if (url.startsWith('holoscript://collaborate/')) {
      return {
        serverUrl: defaultServer,
        roomId: url.replace('holoscript://collaborate/', ''),
      };
    }

    if (url.startsWith('wss://') || url.startsWith('ws://')) {
      const parts = url.split('/');
      const roomId = parts.pop() || '';
      return {
        serverUrl: parts.join('/'),
        roomId,
      };
    }

    // Assume it's just a room ID
    return {
      serverUrl: defaultServer,
      roomId: url,
    };
  }

  private waitForSync(timeout = 10000): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.collaborativeDoc) {
        reject(new Error('No collaborative document'));
        return;
      }

      const timer = setTimeout(() => {
        reject(new Error('Sync timeout'));
      }, timeout);

      this.collaborativeDoc.once('synced', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  private rangesOverlap(
    a: { start: { line: number }; end: { line: number } },
    b: { start: { line: number }; end: { line: number } }
  ): boolean {
    return !(a.end.line < b.start.line || a.start.line > b.end.line);
  }

  private cleanup(): void {
    // Detach presence provider
    if (this.presenceProvider) {
      this.presenceProvider.detachFromDocument();
      this.presenceProvider = null;
    }

    // Disconnect collaborative document
    if (this.collaborativeDoc) {
      this.collaborativeDoc.disconnect();
      this.collaborativeDoc = null;
    }

    // Clean up document sync
    if (this.documentSyncDisposable) {
      this.documentSyncDisposable.dispose();
      this.documentSyncDisposable = null;
    }

    // Reset state
    this.state = {
      isActive: false,
      sessionId: null,
      documentUri: null,
      participants: [],
      comments: [],
      locks: [],
      permission: 'view',
    };
  }

  private log(message: string): void {
    const timestamp = new Date().toISOString();
    this.outputChannel.appendLine(`[${timestamp}] ${message}`);
  }
}

/**
 * Singleton instance of CollaborationSession
 */
let sessionInstance: CollaborationSession | null = null;

/**
 * Get or create the CollaborationSession singleton
 */
export function getCollaborationSession(): CollaborationSession {
  if (!sessionInstance) {
    sessionInstance = new CollaborationSession();
  }
  return sessionInstance;
}

/**
 * Dispose of the CollaborationSession singleton
 */
export function disposeCollaborationSession(): void {
  if (sessionInstance) {
    sessionInstance.dispose();
    sessionInstance = null;
  }
}
