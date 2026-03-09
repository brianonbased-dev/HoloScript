/**
 * QuestBuilderPanel — No-Code Quest Builder Webview
 *
 * Visual interface for creating and managing AR/VRR/VR quests with:
 * - Drag-and-drop objective editor
 * - Reward configuration
 * - AI narrative generation
 * - Quest preview
 *
 * @version 1.0.0
 */

import * as vscode from 'vscode';
import type { HololandServices } from '../services/HololandServices';
import type { QuestConfig } from '../../../core/src/plugins/HololandTypes';

export class QuestBuilderPanel {
  public static currentPanel: QuestBuilderPanel | undefined;
  public static readonly viewType = 'holoscript.questBuilder';

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private readonly _services: HololandServices;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionUri: vscode.Uri, services: HololandServices) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (QuestBuilderPanel.currentPanel) {
      QuestBuilderPanel.currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      QuestBuilderPanel.viewType,
      'Quest Builder',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
      }
    );

    QuestBuilderPanel.currentPanel = new QuestBuilderPanel(panel, extensionUri, services);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    services: HololandServices
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._services = services;

    this._panel.webview.html = this._getHtmlForWebview();

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'createQuest':
            await this.createQuest(message.quest);
            break;
          case 'generateNarrative':
            await this.generateNarrative(message.theme);
            break;
          case 'previewQuest':
            this.previewQuest(message.questId);
            break;
        }
      },
      null,
      this._disposables
    );
  }

  private async createQuest(questData: any) {
    try {
      const config: QuestConfig = {
        businessId: questData.businessId || 'default-business',
        title: questData.title,
        description: questData.description,
        objectives: questData.objectives || [],
        rewards: questData.rewards || [],
        layer: questData.layer || 'ar',
        difficulty: questData.difficulty || 'medium',
        aiGenerate: questData.aiGenerate || false,
      };

      const questId = await this._services.questBuilder.createQuest(config);

      this._panel.webview.postMessage({
        type: 'questCreated',
        questId,
      });

      vscode.window
        .showInformationMessage(`Quest "${config.title}" created!`, 'View Quest')
        .then((action) => {
          if (action === 'View Quest') {
            this._services.questBuilder.showQuestDetails(questId);
          }
        });
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to create quest: ${error}`);
    }
  }

  private async generateNarrative(theme: string) {
    try {
      const narrative = await this._services.storyWeaver.generateNarrative(
        `Create an engaging quest narrative for theme: ${theme}`,
        theme
      );

      this._panel.webview.postMessage({
        type: 'narrativeGenerated',
        narrative,
      });
    } catch (error) {
      vscode.window.showWarningMessage(`AI generation failed: ${error}`);
    }
  }

  private previewQuest(questId: string) {
    this._services.questBuilder.showQuestDetails(questId);
  }

  public dispose() {
    QuestBuilderPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  private _getHtmlForWebview() {
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this._panel.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Quest Builder</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      padding: 20px;
    }
    .container { max-width: 1000px; margin: 0 auto; }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 30px;
      padding-bottom: 15px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    h1 { font-size: 24px; font-weight: 600; }
    .form-section {
      background: var(--vscode-sideBar-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 20px;
    }
    .form-section h2 {
      font-size: 16px;
      margin-bottom: 15px;
      color: var(--vscode-foreground);
    }
    .form-group { margin-bottom: 15px; }
    label {
      display: block;
      margin-bottom: 5px;
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      font-weight: 500;
    }
    input, textarea, select {
      width: 100%;
      padding: 8px 12px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      font-size: 13px;
      font-family: var(--vscode-font-family);
    }
    textarea { min-height: 100px; resize: vertical; }
    button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 10px 20px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    .button-secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .button-secondary:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }
    .button-group {
      display: flex;
      gap: 10px;
      margin-top: 20px;
    }
    .objective-list, .reward-list {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      padding: 10px;
      margin-top: 10px;
    }
    .objective-item, .reward-item {
      background: var(--vscode-editor-background);
      padding: 10px;
      border-radius: 4px;
      margin-bottom: 10px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .objective-item:last-child, .reward-item:last-child { margin-bottom: 0; }
    .remove-btn {
      background: transparent;
      color: var(--vscode-errorForeground);
      padding: 4px 8px;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎮 Quest Builder</h1>
    </div>

    <div class="form-section">
      <h2>Basic Information</h2>
      <div class="form-group">
        <label for="title">Quest Title *</label>
        <input type="text" id="title" placeholder="Enter quest title" required>
      </div>
      <div class="form-group">
        <label for="description">Description *</label>
        <textarea id="description" placeholder="Describe what players will do"></textarea>
      </div>
      <div class="form-group">
        <label for="businessId">Business ID</label>
        <input type="text" id="businessId" placeholder="business-identifier">
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
        <div class="form-group">
          <label for="layer">Layer</label>
          <select id="layer">
            <option value="ar">AR (Free)</option>
            <option value="vrr">VRR (Digital Twin)</option>
            <option value="vr">VR (Premium)</option>
          </select>
        </div>
        <div class="form-group">
          <label for="difficulty">Difficulty</label>
          <select id="difficulty">
            <option value="easy">Easy</option>
            <option value="medium" selected>Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>
      </div>
    </div>

    <div class="form-section">
      <h2>AI Narrative Generation</h2>
      <div class="form-group">
        <label for="theme">Theme</label>
        <input type="text" id="theme" placeholder="mystery, adventure, fantasy, etc.">
      </div>
      <button id="generateBtn" class="button-secondary">✨ Generate AI Narrative</button>
      <div class="form-group" style="margin-top: 15px;">
        <label for="narrative">Generated Narrative</label>
        <textarea id="narrative" placeholder="AI-generated narrative will appear here..."></textarea>
      </div>
    </div>

    <div class="form-section">
      <h2>Objectives</h2>
      <div id="objectivesList" class="objective-list">
        <div style="text-align: center; padding: 20px; color: var(--vscode-descriptionForeground);">
          No objectives added yet
        </div>
      </div>
      <button id="addObjectiveBtn" class="button-secondary" style="margin-top: 10px;">+ Add Objective</button>
    </div>

    <div class="form-section">
      <h2>Rewards</h2>
      <div id="rewardsList" class="reward-list">
        <div style="text-align: center; padding: 20px; color: var(--vscode-descriptionForeground);">
          No rewards added yet
        </div>
      </div>
      <button id="addRewardBtn" class="button-secondary" style="margin-top: 10px;">+ Add Reward</button>
    </div>

    <div class="button-group">
      <button id="createQuestBtn">🚀 Create Quest</button>
      <button id="resetBtn" class="button-secondary">Reset Form</button>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let objectives = [];
    let rewards = [];

    document.getElementById('generateBtn').addEventListener('click', () => {
      const theme = document.getElementById('theme').value;
      if (!theme) {
        alert('Please enter a theme first');
        return;
      }
      vscode.postMessage({ command: 'generateNarrative', theme });
    });

    document.getElementById('addObjectiveBtn').addEventListener('click', () => {
      const obj = {
        id: 'obj_' + Date.now(),
        type: 'location',
        description: 'New objective',
        targetValue: 1,
        required: true
      };
      objectives.push(obj);
      renderObjectives();
    });

    document.getElementById('addRewardBtn').addEventListener('click', () => {
      const reward = {
        type: 'xp',
        value: 100,
        description: 'XP reward'
      };
      rewards.push(reward);
      renderRewards();
    });

    document.getElementById('createQuestBtn').addEventListener('click', () => {
      const quest = {
        title: document.getElementById('title').value,
        description: document.getElementById('description').value,
        businessId: document.getElementById('businessId').value || 'default',
        layer: document.getElementById('layer').value,
        difficulty: document.getElementById('difficulty').value,
        objectives,
        rewards,
        aiGenerate: false
      };

      if (!quest.title || !quest.description) {
        alert('Please fill in all required fields');
        return;
      }

      vscode.postMessage({ command: 'createQuest', quest });
    });

    document.getElementById('resetBtn').addEventListener('click', () => {
      document.getElementById('title').value = '';
      document.getElementById('description').value = '';
      document.getElementById('narrative').value = '';
      document.getElementById('theme').value = '';
      objectives = [];
      rewards = [];
      renderObjectives();
      renderRewards();
    });

    function renderObjectives() {
      const list = document.getElementById('objectivesList');
      if (objectives.length === 0) {
        list.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--vscode-descriptionForeground);">No objectives added yet</div>';
        return;
      }
      list.innerHTML = objectives.map((obj, idx) => \`
        <div class="objective-item">
          <div>
            <strong>\${obj.description}</strong>
            <div style="font-size: 11px; color: var(--vscode-descriptionForeground);">
              Type: \${obj.type} | Target: \${obj.targetValue} | \${obj.required ? 'Required' : 'Optional'}
            </div>
          </div>
          <button class="remove-btn" onclick="removeObjective(\${idx})">Remove</button>
        </div>
      \`).join('');
    }

    function renderRewards() {
      const list = document.getElementById('rewardsList');
      if (rewards.length === 0) {
        list.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--vscode-descriptionForeground);">No rewards added yet</div>';
        return;
      }
      list.innerHTML = rewards.map((reward, idx) => \`
        <div class="reward-item">
          <div>
            <strong>\${reward.description}</strong>
            <div style="font-size: 11px; color: var(--vscode-descriptionForeground);">
              Type: \${reward.type} | Value: \${reward.value}
            </div>
          </div>
          <button class="remove-btn" onclick="removeReward(\${idx})">Remove</button>
        </div>
      \`).join('');
    }

    window.removeObjective = (idx) => {
      objectives.splice(idx, 1);
      renderObjectives();
    };

    window.removeReward = (idx) => {
      rewards.splice(idx, 1);
      renderRewards();
    };

    window.addEventListener('message', event => {
      const message = event.data;
      if (message.type === 'narrativeGenerated') {
        document.getElementById('narrative').value = message.narrative;
      } else if (message.type === 'questCreated') {
        alert('Quest created successfully!');
      }
    });
  </script>
</body>
</html>`;
  }
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
