/**
 * @fileoverview VS Code command registrations for collaboration features
 * @module collaboration/CollaborationCommands
 */

import * as vscode from 'vscode';
import { getCollaborationSession, disposeCollaborationSession } from './CollaborationSession';
import { getPresenceProvider, disposePresenceProvider } from './PresenceProvider';
import type { UserInfo } from './CollaborationTypes';

/**
 * Registered command disposables
 */
let commandDisposables: vscode.Disposable[] = [];

/**
 * Register all collaboration-related VS Code commands
 */
export function registerCollaborationCommands(context: vscode.ExtensionContext): void {
  const session = getCollaborationSession();

  // Start collaboration session
  commandDisposables.push(
    vscode.commands.registerCommand('holoscript.collaboration.start', async () => {
      if (session.isActive()) {
        const action = await vscode.window.showWarningMessage(
          'A collaboration session is already active.',
          'End Session',
          'Cancel'
        );
        if (action === 'End Session') {
          await session.endSession();
        } else {
          return;
        }
      }

      // Get session configuration
      const roomId = await vscode.window.showInputBox({
        prompt: 'Enter a room name for this collaboration session',
        placeHolder: 'my-holoscript-project',
        validateInput: (value) => {
          if (!value || value.length < 3) {
            return 'Room name must be at least 3 characters';
          }
          if (!/^[a-z0-9-_]+$/i.test(value)) {
            return 'Room name can only contain letters, numbers, hyphens, and underscores';
          }
          return null;
        },
      });

      if (!roomId) {
        return;
      }

      // Get user info
      const user = await getUserInfo(context);
      if (!user) {
        return;
      }

      try {
        const serverUrl =
          vscode.workspace.getConfiguration('holoscript.collaboration').get<string>('serverUrl') ||
          'wss://collab.holoscript.net';

        const sessionInfo = await session.startSession({
          serverUrl,
          roomId,
          user,
        });

        await vscode.window
          .showInformationMessage(
            `Collaboration session started! Share this link: ${session.getShareUrl()}`,
            'Copy Link'
          )
          .then((action) => {
            if (action === 'Copy Link') {
              session.copyShareUrl();
            }
          });
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to start collaboration: ${error}`);
      }
    })
  );

  // Join collaboration session
  commandDisposables.push(
    vscode.commands.registerCommand('holoscript.collaboration.join', async () => {
      if (session.isActive()) {
        const action = await vscode.window.showWarningMessage(
          'A collaboration session is already active.',
          'End Session',
          'Cancel'
        );
        if (action === 'End Session') {
          await session.endSession();
        } else {
          return;
        }
      }

      // Get session URL or room ID
      const sessionUrl = await vscode.window.showInputBox({
        prompt: 'Enter the collaboration link or room ID',
        placeHolder: 'holoscript://collaborate/room-id or room-id',
      });

      if (!sessionUrl) {
        return;
      }

      // Get user info
      const user = await getUserInfo(context);
      if (!user) {
        return;
      }

      try {
        await session.joinSession(sessionUrl, user);
        vscode.window.showInformationMessage('Joined collaboration session!');
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to join collaboration: ${error}`);
      }
    })
  );

  // End collaboration session
  commandDisposables.push(
    vscode.commands.registerCommand('holoscript.collaboration.end', async () => {
      if (!session.isActive()) {
        vscode.window.showInformationMessage('No active collaboration session');
        return;
      }

      const confirm = await vscode.window.showWarningMessage(
        'Are you sure you want to end the collaboration session?',
        { modal: true },
        'End Session'
      );

      if (confirm === 'End Session') {
        await session.endSession();
      }
    })
  );

  // Share collaboration link
  commandDisposables.push(
    vscode.commands.registerCommand('holoscript.collaboration.share', async () => {
      if (!session.isActive()) {
        vscode.window.showWarningMessage('No active collaboration session');
        return;
      }

      await session.copyShareUrl();
    })
  );

  // Show participants
  commandDisposables.push(
    vscode.commands.registerCommand('holoscript.collaboration.showParticipants', async () => {
      const presenceProvider = getPresenceProvider();
      await presenceProvider.showParticipantsQuickPick();
    })
  );

  // Add inline comment
  commandDisposables.push(
    vscode.commands.registerCommand('holoscript.collaboration.addComment', async () => {
      if (!session.isActive()) {
        vscode.window.showWarningMessage('No active collaboration session');
        return;
      }

      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.selection.isEmpty) {
        vscode.window.showWarningMessage('Select some code to add a comment');
        return;
      }

      const comment = await vscode.window.showInputBox({
        prompt: 'Enter your comment',
        placeHolder: 'Type a comment...',
      });

      if (comment) {
        await session.addComment(editor.selection, comment);
        vscode.window.showInformationMessage('Comment added');
      }
    })
  );

  // Lock section
  commandDisposables.push(
    vscode.commands.registerCommand('holoscript.collaboration.lockSection', async () => {
      if (!session.isActive()) {
        vscode.window.showWarningMessage('No active collaboration session');
        return;
      }

      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.selection.isEmpty) {
        vscode.window.showWarningMessage('Select a section to lock');
        return;
      }

      const reason = await vscode.window.showInputBox({
        prompt: 'Reason for locking (optional)',
        placeHolder: 'e.g., Working on this feature',
      });

      const lock = await session.lockSection(editor.selection, reason);
      if (lock) {
        vscode.window.showInformationMessage('Section locked for exclusive editing');
      }
    })
  );

  // Toggle collaboration status bar
  commandDisposables.push(
    vscode.commands.registerCommand('holoscript.collaboration.toggle', async () => {
      const session = getCollaborationSession();
      if (session.isActive()) {
        await vscode.commands.executeCommand('holoscript.collaboration.end');
      } else {
        const action = await vscode.window.showQuickPick(
          ['Start New Session', 'Join Existing Session'],
          { placeHolder: 'Choose an action' }
        );

        if (action === 'Start New Session') {
          await vscode.commands.executeCommand('holoscript.collaboration.start');
        } else if (action === 'Join Existing Session') {
          await vscode.commands.executeCommand('holoscript.collaboration.join');
        }
      }
    })
  );

  // Add all disposables to context
  context.subscriptions.push(...commandDisposables);
}

/**
 * Dispose of all registered commands
 */
export function disposeCollaborationCommands(): void {
  disposeCollaborationSession();
  disposePresenceProvider();

  for (const disposable of commandDisposables) {
    disposable.dispose();
  }
  commandDisposables = [];
}

/**
 * Get user information from VS Code or prompt
 */
async function getUserInfo(context: vscode.ExtensionContext): Promise<UserInfo | null> {
  // Try to get from VS Code session
  const session = await vscode.authentication.getSession('github', ['read:user'], {
    createIfNone: false,
  });

  if (session) {
    return {
      id: session.account.id,
      name: session.account.label,
    };
  }

  // Try stored info
  const storedName = context.globalState.get<string>('holoscript.collaboration.userName');

  if (storedName) {
    return {
      id: `local_${storedName.toLowerCase().replace(/\s+/g, '_')}`,
      name: storedName,
    };
  }

  // Prompt for name
  const name = await vscode.window.showInputBox({
    prompt: 'Enter your display name for collaboration',
    placeHolder: 'Your Name',
    validateInput: (value) => {
      if (!value || value.length < 2) {
        return 'Name must be at least 2 characters';
      }
      return null;
    },
  });

  if (!name) {
    return null;
  }

  // Store for future use
  await context.globalState.update('holoscript.collaboration.userName', name);

  return {
    id: `local_${name.toLowerCase().replace(/\s+/g, '_')}`,
    name,
  };
}
