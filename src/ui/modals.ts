import { PRESET_SCRIPTS } from '../presets/presets';
import { countAllBlocks } from '../state/store';
import type { PresetScript } from '../types';
import { ICONS } from './icons';

export class PresetsModal {
  private backdrop: HTMLElement;
  private onSelect: (presetId: string) => void;
  private activeFilter = 'All';

  constructor(onSelect: (presetId: string) => void) {
    this.onSelect = onSelect;
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'modal-backdrop';
    this.backdrop.id = 'presets-modal';
    this.backdrop.hidden = true;
    this.backdrop.addEventListener('click', (ev) => {
      if (ev.target === this.backdrop) this.close();
    });
    document.body.appendChild(this.backdrop);
  }

  open(): void {
    this.backdrop.hidden = false;
    this.render();
  }

  close(): void {
    this.backdrop.hidden = true;
  }

  private render(): void {
    const categories = ['All', ...Array.from(new Set(PRESET_SCRIPTS.map((p) => p.category)))];
    const filtered =
      this.activeFilter === 'All'
        ? PRESET_SCRIPTS
        : PRESET_SCRIPTS.filter((p) => p.category === this.activeFilter);

    this.backdrop.innerHTML = `
      <div class="modal-dialog modal-lg" role="dialog" aria-modal="true" aria-labelledby="presets-modal-title">
        <div class="modal-header">
          <div>
            <h2 id="presets-modal-title" class="modal-title">Space Engineers Preset Scripts</h2>
            <p class="modal-subtitle">Load a ready-to-paste ship script and customize its blocks, names, or thresholds</p>
          </div>
          <button type="button" class="se-icon-btn modal-close-btn" aria-label="Close presets">${ICONS.close}</button>
        </div>
        <div class="preset-filter-bar">
          ${categories
            .map(
              (c) => `
            <button type="button" class="cat-pill ${this.activeFilter === c ? 'active' : ''}" data-pcat="${c}">${c}</button>
          `
            )
            .join('')}
        </div>
        <div class="presets-grid">
          ${filtered.map((p) => this.renderCard(p)).join('')}
        </div>
      </div>
    `;

    this.backdrop.querySelector('.modal-close-btn')?.addEventListener('click', () => this.close());
    this.backdrop.querySelectorAll<HTMLButtonElement>('[data-pcat]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.activeFilter = btn.dataset.pcat || 'All';
        this.render();
      });
    });
    this.backdrop.querySelectorAll<HTMLButtonElement>('[data-load-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.loadPreset;
        if (id) {
          this.onSelect(id);
          this.close();
        }
      });
    });
  }

  private renderCard(preset: PresetScript): string {
    const blocks = countAllBlocks(preset.project.blocks);
    return `
      <article class="preset-card">
        <div class="preset-card-top">
          <span class="preset-cat">${preset.category}</span>
          <span class="preset-diff diff-${preset.difficulty.toLowerCase()}">${preset.difficulty}</span>
        </div>
        <h3 class="preset-name">${preset.name}</h3>
        <p class="preset-summary">${preset.summary}</p>
        <div class="preset-hint"><strong>In-Game Blocks:</strong> ${preset.setupHint}</div>
        <div class="preset-card-footer">
          <span class="preset-meta">${blocks} blocks · ${preset.project.updateFrequency}</span>
          <button type="button" class="btn btn-sm btn-primary" data-load-preset="${preset.id}">Load Script</button>
        </div>
      </article>
    `;
  }
}

export class ProjectJsonModal {
  private backdrop: HTMLElement;
  private getJson: () => string;
  private onImport: (json: string) => { ok: boolean; error?: string };
  private onToast: (msg: string) => void;

  constructor(opts: {
    getJson: () => string;
    onImport: (json: string) => { ok: boolean; error?: string };
    onToast: (msg: string) => void;
  }) {
    this.getJson = opts.getJson;
    this.onImport = opts.onImport;
    this.onToast = opts.onToast;
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'modal-backdrop';
    this.backdrop.id = 'json-modal';
    this.backdrop.hidden = true;
    this.backdrop.addEventListener('click', (ev) => {
      if (ev.target === this.backdrop) this.close();
    });
    document.body.appendChild(this.backdrop);
  }

  open(): void {
    this.backdrop.hidden = false;
    const currentJson = this.getJson();

    this.backdrop.innerHTML = `
      <div class="modal-dialog modal-md" role="dialog" aria-modal="true" aria-labelledby="json-modal-title">
        <div class="modal-header">
          <div>
            <h2 id="json-modal-title" class="modal-title">Save / Share Block Blueprint (JSON)</h2>
            <p class="modal-subtitle">Export your visual blocks to share with friends or import a saved GridLogic blueprint</p>
          </div>
          <button type="button" class="se-icon-btn modal-close-btn" aria-label="Close modal">${ICONS.close}</button>
        </div>
        <div class="json-modal-body">
          <textarea id="project-json-area" class="json-textarea" spellcheck="false"></textarea>
          <div id="json-error-msg" class="json-error" hidden></div>
          <div class="json-modal-actions">
            <button type="button" class="btn btn-sm btn-secondary" id="json-copy-btn">${ICONS.copy} Copy JSON</button>
            <button type="button" class="btn btn-sm btn-secondary" id="json-download-btn">${ICONS.download} Download .json</button>
            <span class="spacer"></span>
            <button type="button" class="btn btn-sm btn-primary" id="json-import-btn">${ICONS.upload} Load JSON into Editor</button>
          </div>
        </div>
      </div>
    `;

    const area = this.backdrop.querySelector('#project-json-area') as HTMLTextAreaElement;
    const errEl = this.backdrop.querySelector('#json-error-msg') as HTMLElement;
    area.value = currentJson;

    this.backdrop.querySelector('.modal-close-btn')?.addEventListener('click', () => this.close());
    this.backdrop.querySelector('#json-copy-btn')?.addEventListener('click', () => {
      navigator.clipboard?.writeText(area.value).catch(() => {});
      this.onToast('Project JSON copied to clipboard');
    });
    this.backdrop.querySelector('#json-download-btn')?.addEventListener('click', () => {
      const blob = new Blob([area.value], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'gridlogic-blueprint.json';
      a.click();
      URL.revokeObjectURL(url);
      this.onToast('Downloaded gridlogic-blueprint.json');
    });
    this.backdrop.querySelector('#json-import-btn')?.addEventListener('click', () => {
      const res = this.onImport(area.value);
      if (res.ok) {
        this.onToast('Blueprint loaded into editor');
        this.close();
      } else {
        errEl.textContent = res.error || 'Could not import JSON.';
        errEl.hidden = false;
      }
    });
  }

  close(): void {
    this.backdrop.hidden = true;
  }
}
