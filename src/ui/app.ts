import { generateSpaceEngineersScript } from '../codegen/csharpGenerator';
import { PRESET_SCRIPTS } from '../presets/presets';
import { ProjectStore } from '../state/store';
import type { GeneratedScriptResult } from '../types';
import { ICONS } from './icons';
import { InspectorView } from './inspector';
import { PresetsModal, ProjectJsonModal } from './modals';
import { ToolboxView } from './toolbox';
import { WorkspaceView } from './workspace';

export class GridLogicApp {
  private root: HTMLElement;
  private store: ProjectStore;
  private workspace!: WorkspaceView;
  private inspector!: InspectorView;
  private presetsModal!: PresetsModal;
  private jsonModal!: ProjectJsonModal;
  private latestResult!: GeneratedScriptResult;

  private nameInput!: HTMLInputElement;
  private undoBtn!: HTMLButtonElement;
  private redoBtn!: HTMLButtonElement;
  private copyCtaBtn!: HTMLButtonElement;
  private toastEl!: HTMLElement;
  private toastTimer: number | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
    this.store = new ProjectStore();
    this.mount();
  }

  private mount(): void {
    this.root.innerHTML = `
      <div class="app-shell">
        <header class="topbar">
          <div class="topbar-brand">
            <span class="brand-icon">${ICONS.logo}</span>
            <div class="brand-text">
              <h1 class="brand-name">GRIDLOGIC</h1>
              <span class="brand-sub">Space Engineers Visual Script Studio</span>
            </div>
          </div>

          <div class="topbar-project">
            <input
              id="script-name-input"
              type="text"
              class="script-name-input"
              aria-label="Script name"
              placeholder="Script name..."
            />
            <button type="button" id="open-presets-btn" class="btn btn-sm btn-secondary">
              ${ICONS.presets}
              <span>Presets (${PRESET_SCRIPTS.length})</span>
            </button>
            <button type="button" id="new-blank-btn" class="btn btn-sm btn-ghost" title="Start from an empty script">
              ${ICONS.fileNew}
              <span>Blank</span>
            </button>
          </div>

          <div class="topbar-actions">
            <div class="btn-group">
              <button type="button" id="undo-btn" class="btn btn-sm btn-ghost" title="Undo (Ctrl+Z)" aria-label="Undo">
                ${ICONS.undo}
              </button>
              <button type="button" id="redo-btn" class="btn btn-sm btn-ghost" title="Redo (Ctrl+Y)" aria-label="Redo">
                ${ICONS.redo}
              </button>
            </div>
            <button type="button" id="json-blueprint-btn" class="btn btn-sm btn-ghost" title="Save or load block blueprint JSON">
              ${ICONS.upload}
              <span class="hide-narrow">Save/Load</span>
            </button>
            <button type="button" id="guide-shortcut-btn" class="btn btn-sm btn-ghost" title="View in-game Space Engineers setup checklist">
              ${ICONS.help}
              <span class="hide-narrow">SE Setup</span>
            </button>
            <button type="button" id="copy-se-script-btn" class="btn btn-sm btn-primary">
              ${ICONS.copy}
              <span>Copy C# for SE</span>
            </button>
          </div>
        </header>

        <main class="studio-grid">
          <aside class="pane pane-toolbox" id="pane-toolbox" aria-label="Block toolbox"></aside>
          <section class="pane pane-workspace" id="pane-workspace" aria-label="Visual script workspace"></section>
          <section class="pane pane-inspector" id="pane-inspector" aria-label="Generated C# code and ship simulator"></section>
        </main>
      </div>
      <div class="toast" id="app-toast" role="status" aria-live="polite" hidden></div>
    `;

    this.nameInput = this.root.querySelector('#script-name-input') as HTMLInputElement;
    this.undoBtn = this.root.querySelector('#undo-btn') as HTMLButtonElement;
    this.redoBtn = this.root.querySelector('#redo-btn') as HTMLButtonElement;
    this.copyCtaBtn = this.root.querySelector('#copy-se-script-btn') as HTMLButtonElement;
    this.toastEl = this.root.querySelector('#app-toast') as HTMLElement;

    this.presetsModal = new PresetsModal((presetId) => {
      const preset = PRESET_SCRIPTS.find((p) => p.id === presetId);
      if (this.store.loadPreset(presetId)) {
        this.inspector.resetSimulation();
        this.showToast(`Loaded preset: ${preset?.name ?? presetId}`);
      }
    });

    this.jsonModal = new ProjectJsonModal({
      getJson: () => this.store.exportProjectJson(),
      onImport: (text) => {
        const res = this.store.importProjectJson(text);
        if (res.ok) this.inspector.resetSimulation();
        return res;
      },
      onToast: (msg) => this.showToast(msg),
    });

    new ToolboxView({
      container: this.root.querySelector('#pane-toolbox') as HTMLElement,
      onAddBlock: (type) => {
        this.store.addBlock(type);
      },
    });

    this.workspace = new WorkspaceView({
      container: this.root.querySelector('#pane-workspace') as HTMLElement,
      store: this.store,
      onParamTextEdit: () => this.refreshGeneratedOnly(),
      onOpenPresets: () => this.presetsModal.open(),
      onToast: (msg) => this.showToast(msg),
    });

    this.inspector = new InspectorView({
      container: this.root.querySelector('#pane-inspector') as HTMLElement,
      onCopyCode: () => this.copyScriptToClipboard(),
      onDownloadCs: () => this.downloadCsFile(),
      onJumpToBlock: (id) => this.workspace.highlightBlock(id),
      onToast: (msg) => this.showToast(msg),
    });

    // Topbar listeners
    this.nameInput.addEventListener('input', () => {
      const project = this.store.getProject();
      project.name = this.nameInput.value;
      this.refreshGeneratedOnly();
    });

    this.root.querySelector('#open-presets-btn')?.addEventListener('click', () => {
      this.presetsModal.open();
    });

    this.root.querySelector('#new-blank-btn')?.addEventListener('click', () => {
      this.store.createBlankProject();
      this.inspector.resetSimulation();
      this.showToast('Created blank script workspace');
    });

    this.undoBtn.addEventListener('click', () => this.store.undo());
    this.redoBtn.addEventListener('click', () => this.store.redo());

    this.root.querySelector('#json-blueprint-btn')?.addEventListener('click', () => {
      this.jsonModal.open();
    });

    this.root.querySelector('#guide-shortcut-btn')?.addEventListener('click', () => {
      this.inspector.setTab('setup');
    });

    this.copyCtaBtn.addEventListener('click', () => this.copyScriptToClipboard());

    // Keyboard shortcuts
    window.addEventListener('keydown', (ev) => {
      const target = ev.target as HTMLElement | null;
      const inEditable =
        target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);

      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z' && !inEditable) {
        ev.preventDefault();
        if (ev.shiftKey) this.store.redo();
        else this.store.undo();
      } else if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'y' && !inEditable) {
        ev.preventDefault();
        this.store.redo();
      } else if (ev.key === 'Escape') {
        this.presetsModal.close();
        this.jsonModal.close();
      }
    });

    this.store.subscribe(() => this.renderAll());
    this.renderAll();
  }

  private renderAll(): void {
    const project = this.store.getProject();
    if (document.activeElement !== this.nameInput) {
      this.nameInput.value = project.name;
    }
    this.undoBtn.disabled = !this.store.canUndo();
    this.redoBtn.disabled = !this.store.canRedo();

    this.workspace.render();
    this.refreshGeneratedOnly();
  }

  private refreshGeneratedOnly(): void {
    const project = this.store.getProject();
    this.latestResult = generateSpaceEngineersScript(project);
    this.inspector.update(project, this.latestResult, true);
    try {
      window.localStorage?.setItem('gridlogic_se_project_v1', JSON.stringify(project));
    } catch {
      // Ignore storage write errors
    }
  }

  private copyScriptToClipboard(): void {
    if (!this.latestResult) return;
    const code = this.latestResult.code;
    const onCopied = () => {
      this.copyCtaBtn.innerHTML = `${ICONS.check} <span>Copied!</span>`;
      this.copyCtaBtn.classList.add('is-copied');
      this.showToast('C# script copied — paste into your Space Engineers Programmable Block!');
      window.setTimeout(() => {
        this.copyCtaBtn.innerHTML = `${ICONS.copy} <span>Copy C# for SE</span>`;
        this.copyCtaBtn.classList.remove('is-copied');
      }, 1800);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(onCopied).catch(() => {
        this.fallbackCopy(code);
        onCopied();
      });
    } else {
      this.fallbackCopy(code);
      onCopied();
    }
  }

  private fallbackCopy(text: string): void {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
    } catch {
      // Ignore
    }
    document.body.removeChild(ta);
  }

  private downloadCsFile(): void {
    if (!this.latestResult) return;
    const project = this.store.getProject();
    const safeName =
      (project.name || 'se_script')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '') || 'se_script';
    const blob = new Blob([this.latestResult.code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeName}.cs`;
    a.click();
    URL.revokeObjectURL(url);
    this.showToast(`Downloaded ${safeName}.cs`);
  }

  private showToast(message: string): void {
    this.toastEl.textContent = message;
    this.toastEl.hidden = false;
    this.toastEl.classList.add('show');
    if (this.toastTimer) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toastEl.classList.remove('show');
      this.toastEl.hidden = true;
    }, 2800);
  }
}
