/**
 * HoloScript AI Agent API
 *
 * Provides programmatic access for AI agents (Brittney, Claude, Copilot, etc.)
 * to control the HoloScript extension, generate code, and interact with previews.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';
import { HoloScriptPreviewPanel } from './previewPanel';

export interface AgentCommand {
  command: string;
  args?: Record<string, unknown>;
}

export interface AgentResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface GenerateObjectRequest {
  description: string;
  format?: 'holo' | 'hsplus' | 'hs';
  traits?: string[];
}

export interface SceneAnalysis {
  objects: number;
  templates: number;
  traits: string[];
  hasNetworking: boolean;
  hasPhysics: boolean;
  complexity: 'simple' | 'moderate' | 'complex';
}

/**
 * HoloScript Agent API - enables AI agents to operate the extension
 */
export class HoloScriptAgentAPI {
  private static instance: HoloScriptAgentAPI;
  private context: vscode.ExtensionContext | undefined;

  private constructor() {}

  static getInstance(): HoloScriptAgentAPI {
    if (!HoloScriptAgentAPI.instance) {
      HoloScriptAgentAPI.instance = new HoloScriptAgentAPI();
    }
    return HoloScriptAgentAPI.instance;
  }

  initialize(context: vscode.ExtensionContext): void {
    this.context = context;
    this.registerAgentCommands(context);
  }

  private registerAgentCommands(context: vscode.ExtensionContext): void {
    // Broadcast initialization telemetry
    this.broadcastAgentTelemetry({ type: 'init', status: 'online' });

    // Command: Create new HoloScript file
    context.subscriptions.push(
      vscode.commands.registerCommand(
        'holoscript.agent.createFile',
        async (args: { filename: string; content: string; openPreview?: boolean }) => {
          return this.createHoloFile(args.filename, args.content, args.openPreview);
        }
      )
    );

    // Command: Generate object from description
    context.subscriptions.push(
      vscode.commands.registerCommand(
        'holoscript.agent.generateObject',
        async (args: GenerateObjectRequest) => {
          return this.generateObject(args);
        }
      )
    );

    // Command: Analyze current scene
    context.subscriptions.push(
      vscode.commands.registerCommand('holoscript.agent.analyzeScene', async () => {
        return this.analyzeCurrentScene();
      })
    );

    // Command: Insert code at cursor
    context.subscriptions.push(
      vscode.commands.registerCommand(
        'holoscript.agent.insertCode',
        async (args: { code: string }) => {
          return this.insertCodeAtCursor(args.code);
        }
      )
    );

    // Command: Open preview for file
    context.subscriptions.push(
      vscode.commands.registerCommand(
        'holoscript.agent.openPreview',
        async (args?: { filePath?: string }) => {
          return this.openPreview(args?.filePath);
        }
      )
    );

    // Command: Add trait to object
    context.subscriptions.push(
      vscode.commands.registerCommand(
        'holoscript.agent.addTrait',
        async (args: { objectName: string; trait: string }) => {
          return this.addTraitToObject(args.objectName, args.trait);
        }
      )
    );

    // Command: List available traits
    context.subscriptions.push(
      vscode.commands.registerCommand(
        'holoscript.agent.listTraits',
        async (args?: { category?: string }) => {
          return this.listTraits(args?.category);
        }
      )
    );

    // Command: Validate HoloScript syntax
    context.subscriptions.push(
      vscode.commands.registerCommand(
        'holoscript.agent.validate',
        async (args?: { content?: string }) => {
          return this.validateSyntax(args?.content);
        }
      )
    );

    // Command: Get extension status
    context.subscriptions.push(
      vscode.commands.registerCommand('holoscript.agent.status', async () => {
        return this.getStatus();
      })
    );
  }

  /**
   * Create a new HoloScript file
   */
  async createHoloFile(
    filename: string,
    content: string,
    openPreview = true
  ): Promise<AgentResponse> {
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        return { success: false, error: 'No workspace folder open' };
      }

      // Ensure proper extension
      if (!filename.match(/\.(holo|hsplus|hs)$/)) {
        filename += '.holo';
      }

      const filePath = path.join(workspaceFolder.uri.fsPath, filename);
      const dirPath = path.dirname(filePath);

      // Create directory if needed
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }

      // Write file
      fs.writeFileSync(filePath, content, 'utf8');

      // Open in editor
      const doc = await vscode.workspace.openTextDocument(filePath);
      const editor = await vscode.window.showTextDocument(doc);

      // Open preview if requested
      if (openPreview && this.context) {
        HoloScriptPreviewPanel.createOrShow(this.context.extensionUri, doc);
      }

      this.broadcastAgentTelemetry({ type: 'file_created', filePath });

      return { success: true, data: { filePath, opened: true, previewOpened: openPreview } };
    } catch (error) {
      return { success: false, error: `Failed to create file: ${error}` };
    }
  }

  /**
   * Generate HoloScript object from natural language description
   */
  async generateObject(request: GenerateObjectRequest): Promise<AgentResponse> {
    const { description, format = 'hsplus', traits = [] } = request;

    // Parse description for object type hints
    const desc = description.toLowerCase();
    let objectType = 'object';
    let suggestedTraits: string[] = [...traits];

    // Auto-detect traits from description
    if (desc.includes('grab') || desc.includes('pick up') || desc.includes('hold')) {
      suggestedTraits.push('@grabbable');
    }
    if (desc.includes('throw') || desc.includes('toss')) {
      suggestedTraits.push('@throwable');
    }
    if (desc.includes('collid') || desc.includes('solid') || desc.includes('hit')) {
      suggestedTraits.push('@collidable');
    }
    if (desc.includes('glow') || desc.includes('light') || desc.includes('emissive')) {
      suggestedTraits.push('@glowing');
    }
    if (desc.includes('click') || desc.includes('button') || desc.includes('press')) {
      suggestedTraits.push('@clickable');
    }
    if (desc.includes('network') || desc.includes('multiplayer') || desc.includes('sync')) {
      suggestedTraits.push('@networked');
    }
    if (desc.includes('physic') || desc.includes('fall') || desc.includes('gravity')) {
      suggestedTraits.push('@physics');
    }
    if (desc.includes('stack') || desc.includes('pile')) {
      suggestedTraits.push('@stackable');
    }
    if (desc.includes('hover') || desc.includes('highlight')) {
      suggestedTraits.push('@hoverable');
    }

    // Dedupe traits
    suggestedTraits = [...new Set(suggestedTraits)];

    // Generate name from description
    const objectName = description
      .split(' ')
      .slice(0, 2)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join('');

    // Generate code based on format
    let code: string;

    if (format === 'holo') {
      code = `object "${objectName}" {
  ${suggestedTraits.join('\n  ')}
  
  position: [0, 1, 0]
  // TODO: ${description}
}`;
    } else {
      code = `orb ${objectName.toLowerCase()} {
  ${suggestedTraits.join('\n  ')}
  
  position: { x: 0, y: 1, z: 0 }
  // TODO: ${description}
}`;
    }

    return {
      success: true,
      data: {
        code,
        suggestedTraits,
        objectName,
        format,
      },
    };
  }

  /**
   * Analyze the current scene
   */
  async analyzeCurrentScene(): Promise<AgentResponse> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !this.isHoloScriptFile(editor.document)) {
      return { success: false, error: 'No HoloScript file open' };
    }

    const content = editor.document.getText();
    const analysis: SceneAnalysis = {
      objects: 0,
      templates: 0,
      traits: [],
      hasNetworking: false,
      hasPhysics: false,
      complexity: 'simple',
    };

    // Count objects
    const objectMatches = content.match(/\bobject\s+["']\w+["']/g) || [];
    const orbMatches = content.match(/\borb\s+\w+/g) || [];
    analysis.objects = objectMatches.length + orbMatches.length;

    // Count templates
    const templateMatches = content.match(/\btemplate\s+["']\w+["']/g) || [];
    analysis.templates = templateMatches.length;

    // Find traits
    const traitMatches = content.match(/@\w+/g) || [];
    analysis.traits = [...new Set(traitMatches)];

    // Check for networking/physics
    analysis.hasNetworking = /@networked|@synced|@persistent/.test(content);
    analysis.hasPhysics = /@physics|@collidable|@rigid|@gravity/.test(content);

    // Determine complexity
    const score = analysis.objects + analysis.templates * 2 + analysis.traits.length;
    if (score > 20) {
      analysis.complexity = 'complex';
    } else if (score > 8) {
      analysis.complexity = 'moderate';
    }

    return { success: true, data: analysis };
  }

  /**
   * Insert code at cursor position
   */
  async insertCodeAtCursor(code: string): Promise<AgentResponse> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return { success: false, error: 'No active editor' };
    }

    await editor.edit((editBuilder) => {
      editBuilder.insert(editor.selection.active, code);
    });

    return { success: true, data: { inserted: true } };
  }

  /**
   * Open preview for a file
   */
  async openPreview(filePath?: string): Promise<AgentResponse> {
    if (!this.context) {
      return { success: false, error: 'Extension not initialized' };
    }

    let document: vscode.TextDocument | undefined;

    if (filePath) {
      document = await vscode.workspace.openTextDocument(filePath);
    } else {
      document = vscode.window.activeTextEditor?.document;
    }

    if (!document || !this.isHoloScriptFile(document)) {
      return { success: false, error: 'No valid HoloScript file' };
    }

    HoloScriptPreviewPanel.createOrShow(this.context.extensionUri, document);
    return { success: true, data: { previewOpened: true } };
  }

  /**
   * Add a trait to an existing object
   */
  async addTraitToObject(objectName: string, trait: string): Promise<AgentResponse> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !this.isHoloScriptFile(editor.document)) {
      return { success: false, error: 'No HoloScript file open' };
    }

    const content = editor.document.getText();

    // Find the object/orb declaration
    const patterns = [
      new RegExp(`(object\\s+["']${objectName}["']\\s*\\{)`, 'i'),
      new RegExp(`(orb\\s+${objectName}\\s*\\{)`, 'i'),
    ];

    let found = false;
    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match && match.index !== undefined) {
        const insertPos = editor.document.positionAt(match.index + match[1].length);
        await editor.edit((editBuilder) => {
          const traitLine = trait.startsWith('@') ? trait : `@${trait}`;
          editBuilder.insert(insertPos, `\n  ${traitLine}`);
        });
        found = true;
        break;
      }
    }

    if (!found) {
      return { success: false, error: `Object "${objectName}" not found` };
    }

    return { success: true, data: { objectName, trait, added: true } };
  }

  /**
   * List available VR traits
   */
  async listTraits(category?: string): Promise<AgentResponse> {
    const traits: Record<string, string[]> = {
      interaction: [
        '@grabbable',
        '@throwable',
        '@holdable',
        '@clickable',
        '@hoverable',
        '@draggable',
        '@haptic',
      ],
      physics: ['@collidable', '@physics', '@rigid', '@kinematic', '@trigger', '@gravity'],
      visual: ['@glowing', '@emissive', '@transparent', '@reflective', '@animated', '@billboard'],
      networking: ['@networked', '@synced', '@persistent', '@owned', '@host_only'],
      behavior: ['@stackable', '@attachable', '@equippable', '@consumable', '@destructible'],
      spatial: ['@anchor', '@tracked', '@world_locked', '@hand_tracked', '@eye_tracked', '@seated'],
      audio: ['@spatial_audio', '@ambient', '@voice_activated'],
      state: ['@state', '@reactive', '@observable', '@computed'],
    };

    if (category && traits[category]) {
      return { success: true, data: { [category]: traits[category] } };
    }

    return { success: true, data: traits };
  }

  /**
   * Validate HoloScript syntax
   */
  async validateSyntax(content?: string): Promise<AgentResponse> {
    const editor = vscode.window.activeTextEditor;
    const text = content || editor?.document.getText();

    if (!text) {
      return { success: false, error: 'No content to validate' };
    }

    const errors: Array<{ line: number; message: string }> = [];
    const lines = text.split('\n');

    // Basic syntax validation
    let braceCount = 0;
    let inString = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      for (const char of line) {
        if (char === '"' || char === "'") {
          inString = !inString;
        } else if (!inString) {
          if (char === '{') braceCount++;
          if (char === '}') braceCount--;
        }
      }

      // Check for common issues
      if (line.match(/^\s*@\w+[^(\s{]/)) {
        // Trait without proper syntax
      }
    }

    if (braceCount !== 0) {
      errors.push({ line: lines.length, message: 'Unbalanced braces' });
    }

    return {
      success: errors.length === 0,
      data: {
        valid: errors.length === 0,
        errors,
        lineCount: lines.length,
      },
    };
  }

  /**
   * Get extension status
   */
  async getStatus(): Promise<AgentResponse> {
    const editor = vscode.window.activeTextEditor;

    return {
      success: true,
      data: {
        extensionVersion: '1.2.0',
        previewActive: !!HoloScriptPreviewPanel.currentPanel,
        activeFile: editor?.document.fileName,
        isHoloScriptFile: editor ? this.isHoloScriptFile(editor.document) : false,
        workspaceOpen: !!vscode.workspace.workspaceFolders?.length,
        capabilities: [
          'holoscript.agent.createFile',
          'holoscript.agent.generateObject',
          'holoscript.agent.analyzeScene',
          'holoscript.agent.insertCode',
          'holoscript.agent.openPreview',
          'holoscript.agent.addTrait',
          'holoscript.agent.listTraits',
          'holoscript.agent.validate',
          'holoscript.agent.status',
        ],
      },
    };
  }

  private isHoloScriptFile(document: vscode.TextDocument): boolean {
    return (
      document.languageId === 'holoscript' ||
      document.languageId === 'holoscriptplus' ||
      /\.(holo|hsplus|hs)$/.test(document.fileName)
    );
  }

  /**
   * Pushes IDE interaction telemetry to the running uAA2-service Quantum Mesh
   */
  private broadcastAgentTelemetry(payload: any): void {
    const postData = JSON.stringify({
      source: 'vscode-agent-api',
      timestamp: Date.now(),
      data: payload,
    });
    const req = http.request({
      hostname: 'localhost',
      port: 5555,
      path: '/telemetry/ide',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
      timeout: 2000,
    });

    req.on('error', (e) => {
      // Background silent progression on telemetry failure
      console.warn('[HoloScriptAgentAPI] Mesh disconnected: ' + e.message);
    });

    req.write(postData);
    req.end();
  }
}

// Export singleton
export const agentAPI = HoloScriptAgentAPI.getInstance();
