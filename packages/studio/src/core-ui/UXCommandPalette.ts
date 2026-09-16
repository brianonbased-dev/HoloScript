/** A single action entry in the command palette. */
export interface CommandOption {
  id: string;
  label: string;
  icon?: string;
  description?: string;
  shortcut?: string[];
  action: () => void | Promise<void>;
}

export type StudioPublishToolName =
  | 'holomesh_moltbook_crosspost'
  | 'holomesh_publish_agent_template';

export interface StudioPublishCommandContext {
  getCurrentEditorAst: () => unknown;
  getSceneName?: () => string;
  getTemplateCategory?: () => string;
  runTool: (tool: StudioPublishToolName, input: Record<string, unknown>) => Promise<unknown>;
  notify?: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
}

function slugifyPaletteValue(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'untitled-scene'
  );
}

function stringifyPaletteAst(ast: unknown): string {
  return JSON.stringify(ast, null, 2);
}

export function createStudioPublishingCommands(
  context: StudioPublishCommandContext
): CommandOption[] {
  const getSceneName = () => context.getSceneName?.().trim() || 'Untitled Scene';
  const getTemplateCategory = () => context.getTemplateCategory?.().trim() || 'builder';

  return [
    {
      id: 'cmd_holomesh_publish_agent_template',
      label: 'HoloMesh: Publish current editor AST as template',
      icon: '📦',
      shortcut: ['Ctrl', 'Shift', 'P'],
      description:
        'Send the live 3D Editor AST directly to holomesh_publish_agent_template via Studio MCP proxy.',
      action: async () => {
        const sceneName = getSceneName();
        const ast = context.getCurrentEditorAst();
        const program = stringifyPaletteAst(ast);
        context.notify?.(`Publishing ${sceneName} to the agent marketplace…`, 'info');

        await context.runTool('holomesh_publish_agent_template', {
          name: `${sceneName} Studio Template`,
          description: `Direct Studio publish of the live 3D Editor AST for ${sceneName}.`,
          category: getTemplateCategory(),
          program,
          tags: ['studio', 'ux-command-palette', 'editor-ast', '3d-editor'],
        });

        context.notify?.(`Published ${sceneName} to HoloMesh marketplace`, 'success');
      },
    },
    {
      id: 'cmd_holomesh_moltbook_crosspost',
      label: 'HoloMesh: Crosspost current editor AST to Moltbook',
      icon: '🛰️',
      shortcut: ['Ctrl', 'Shift', 'M'],
      description:
        'Crosspost the live 3D Editor AST to Moltbook through holomesh_moltbook_crosspost — no CLI detour.',
      action: async () => {
        const sceneName = getSceneName();
        const ast = context.getCurrentEditorAst();
        const serializedAst = stringifyPaletteAst(ast);
        const taskId = `studio-${slugifyPaletteValue(sceneName)}-${Date.now()}`;

        context.notify?.(`Crossposting ${sceneName} to Moltbook…`, 'info');

        await context.runTool('holomesh_moltbook_crosspost', {
          taskId,
          title: `${sceneName} — Studio AST Crosspost`,
          description: `Direct Studio crosspost of the current 3D Editor AST for ${sceneName}.\n\n${serializedAst}`,
          metrics: {
            filesModified: 1,
          },
          tags: ['studio', 'moltbook', 'editor-ast', '3d-editor'],
        });

        context.notify?.(`Crossposted ${sceneName} to Moltbook`, 'success');
      },
    },
  ];
}

/** How long a failed command's reason stays on screen before it hides itself. */
const COMMAND_FAILURE_VISIBLE_MS = 8000;

/**
 * Studio command palette (Ctrl+K / Cmd+K).
 * Renders a searchable overlay of registered commands with keyboard navigation.
 */
export class UXCommandPalette {
  private active: boolean = false;
  private query: string = '';
  private options: CommandOption[] = [];
  private selectedIndex: number = 0;
  private container: HTMLElement;
  private streamSubscription?: { unsubscribe: () => void };
  private failureBanner?: HTMLElement;
  private failureTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'studio2-ux-palette';
    Object.assign(this.container.style, {
      position: 'absolute',
      left: '50%',
      top: '30%',
      transform: 'translate(-50%, 0)',
      width: '600px',
      maxHeight: '400px',
      backgroundColor: 'var(--holo-surface-elevated, rgba(20,20,25,0.95))',
      backdropFilter: 'blur(12px)',
      border: '1px solid var(--holo-border, #333)',
      borderRadius: '12px',
      display: 'none',
      flexDirection: 'column',
      zIndex: '9999',
      boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
      color: '#fff',
      fontFamily: 'Inter, sans-serif',
    });

    document.body.appendChild(this.container);
    this.setupListeners();
    this.render();
  }

  public registerCommands(commands: CommandOption[]) {
    for (const command of commands) {
      const existingIndex = this.options.findIndex((opt) => opt.id === command.id);
      if (existingIndex >= 0) {
        this.options[existingIndex] = command;
      } else {
        this.options.push(command);
      }
    }
    this.render();
  }

  public replaceCommands(commands: CommandOption[]) {
    this.options = [...commands];
    this.selectedIndex = 0;
    this.render();
  }

  public bindCommandStream(
    stream:
      | { subscribe: (fn: (cmds: CommandOption[]) => void) => { unsubscribe: () => void } }
      | AsyncIterable<CommandOption[]>
  ) {
    if (this.streamSubscription) {
      this.streamSubscription.unsubscribe();
      this.streamSubscription = undefined;
    }

    if ('subscribe' in stream) {
      this.streamSubscription = stream.subscribe((cmds) => {
        this.replaceCommands(cmds);
      });
    } else {
      let active = true;
      this.streamSubscription = {
        unsubscribe: () => {
          active = false;
        },
      };
      (async () => {
        for await (const cmds of stream) {
          if (!active) break;
          this.replaceCommands(cmds);
        }
      })();
    }
  }

  public destroy() {
    if (this.streamSubscription) this.streamSubscription.unsubscribe();
    if (this.failureTimer) clearTimeout(this.failureTimer);
    this.failureBanner?.remove();
    this.failureBanner = undefined;
    this.container.remove();
  }

  public toggle() {
    this.active = !this.active;
    this.container.style.display = this.active ? 'flex' : 'none';
    if (this.active) {
      this.query = '';
      this.selectedIndex = 0;
      this.render();
      setTimeout(() => this.container.querySelector('input')?.focus(), 10);
    }
  }

  private setupListeners() {
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        this.toggle();
      }

      if (!this.active) return;

      if (e.key === 'Escape') {
        this.toggle();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.selectedIndex = Math.min(this.selectedIndex + 1, this.getFilteredOptions().length - 1);
        this.render();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
        this.render();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        this.executeSelected();
      }
    });

    this.container.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement;
      if (target.tagName === 'INPUT') {
        this.query = target.value;
        this.selectedIndex = 0;
        this.render();
      }
    });
  }

  private getFilteredOptions() {
    if (!this.query) return this.options;
    const lowerQuery = this.query.toLowerCase();
    return this.options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(lowerQuery) ||
        opt.description?.toLowerCase().includes(lowerQuery)
    );
  }

  private async executeSelected() {
    const filtered = this.getFilteredOptions();
    const option = filtered[this.selectedIndex];
    if (!option) return;

    this.toggle(); // Close palette
    try {
      await option.action();
    } catch (error) {
      // Backstop. This await was unguarded and the app registers no
      // `unhandledrejection` handler, so a command that threw reached neither
      // the screen nor the console — the keypress simply appeared to do
      // nothing. Commands that can explain themselves show their own message
      // before rethrowing; this makes sure the ones that cannot are still
      // visible to whoever is looking.
      //
      // Logging it was not enough, and that is the repair here. The palette
      // closes itself BEFORE awaiting, so on the console-only version the user
      // saw the overlay vanish and nothing else — identical, on screen, to the
      // command having worked. Nobody outside a devtools panel can tell a
      // refused publish from a successful one. The message now goes where the
      // person who pressed the key is looking.
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[command-palette] "${option.label}" failed: ${message}`);
      this.showCommandFailure(option.label, message);
    }
  }

  /**
   * Put a failed command's reason on the screen.
   *
   * Appended to `document.body`, not to `this.container`: the palette has
   * already been toggled closed by the time a command can fail, and its
   * container carries `display: none`, so anything rendered inside it would be
   * invisible — a backstop that looks present in the DOM and shows the user
   * nothing.
   */
  private showCommandFailure(label: string, message: string) {
    if (typeof document === 'undefined') return;

    if (!this.failureBanner) {
      this.failureBanner = document.createElement('div');
      this.failureBanner.className = 'command-palette-error';
      this.failureBanner.setAttribute('role', 'alert');
      Object.assign(this.failureBanner.style, {
        position: 'fixed',
        left: '50%',
        bottom: '24px',
        transform: 'translateX(-50%)',
        maxWidth: '520px',
        padding: '10px 14px',
        borderRadius: '8px',
        border: '1px solid rgba(248,113,113,0.35)',
        backgroundColor: 'rgba(69,10,10,0.96)',
        color: '#fecaca',
        font: '13px Inter, sans-serif',
        zIndex: '10000',
      });
      document.body.appendChild(this.failureBanner);
    }

    this.failureBanner.textContent = `"${label}" failed: ${message}`;
    this.failureBanner.style.display = 'block';

    if (this.failureTimer) clearTimeout(this.failureTimer);
    this.failureTimer = setTimeout(() => {
      if (this.failureBanner) this.failureBanner.style.display = 'none';
    }, COMMAND_FAILURE_VISIBLE_MS);
  }

  private render() {
    if (!this.active) return;
    const filtered = this.getFilteredOptions();

    this.container.innerHTML = `
      <div class="command-palette-header" style="padding: 16px; border-bottom: 1px solid var(--holo-border, #333);">
        <input type="text" placeholder="What do you want to build? (Type / for AI)..." value="${this.query}" 
               style="width: 100%; background: transparent; border: none; font-size: 18px; color: white; outline: none;"/>
      </div>
      <div class="command-palette-list" style="overflow-y: auto; padding: 8px;">
        ${filtered
          .map(
            (opt, i) => `
          <div class="command-option" data-idx="${i}"
               style="padding: 12px 16px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center;
                      background-color: ${i === this.selectedIndex ? 'var(--holo-accent-primary, #3b82f6)' : 'transparent'};
                      cursor: pointer;">
            <div style="display: flex; flex-direction: column;">
              <span style="font-weight: 500;">${opt.icon ? opt.icon + ' ' : ''}${opt.label}</span>
              ${opt.description ? `<span style="font-size: 12px; opacity: 0.7;">${opt.description}</span>` : ''}
            </div>
            ${opt.shortcut ? `<span style="font-family: monospace; opacity: 0.5;">${opt.shortcut.join(' ')}</span>` : ''}
          </div>
        `
          )
          .join('')}
      </div>
    `;

    // Reattach focus to input keeping cursor position
    const input = this.container.querySelector('input');
    if (input) {
      input.focus();
      input.setSelectionRange(this.query.length, this.query.length);
    }
  }
}
