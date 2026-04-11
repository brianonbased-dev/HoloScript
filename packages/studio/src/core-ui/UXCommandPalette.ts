/** A single action entry in the command palette. */
export interface CommandOption {
  id: string;
  label: string;
  icon?: string;
  description?: string;
  shortcut?: string[];
  action: () => void | Promise<void>;
}

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

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'studio2-ux-palette';
    Object.assign(this.container.style, {
      position: 'absolute', left: '50%', top: '30%', transform: 'translate(-50%, 0)',
      width: '600px', maxHeight: '400px', backgroundColor: 'var(--holo-surface-elevated, rgba(20,20,25,0.95))',
      backdropFilter: 'blur(12px)', border: '1px solid var(--holo-border, #333)', borderRadius: '12px',
      display: 'none', flexDirection: 'column', zIndex: '9999', boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
      color: '#fff', fontFamily: 'Inter, sans-serif'
    });
    
    document.body.appendChild(this.container);
    this.setupListeners();
    this.render();
  }

  public registerCommands(commands: CommandOption[]) {
    this.options.push(...commands);
    this.render();
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
    return this.options.filter(opt => 
      opt.label.toLowerCase().includes(lowerQuery) || 
      opt.description?.toLowerCase().includes(lowerQuery)
    );
  }

  private async executeSelected() {
    const filtered = this.getFilteredOptions();
    if (filtered[this.selectedIndex]) {
      this.toggle(); // Close palette
      await filtered[this.selectedIndex].action();
    }
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
        ${filtered.map((opt, i) => `
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
        `).join('')}
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
