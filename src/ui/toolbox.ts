import { BLOCK_CATALOG, BLOCK_CATEGORIES, CATEGORY_MAP } from '../blocks/catalog';
import type { BlockCategory, BlockType } from '../types';
import { setActiveDrag } from './dragState';
import { ICONS } from './icons';

export interface ToolboxOptions {
  container: HTMLElement;
  onAddBlock: (type: BlockType) => void;
}

export class ToolboxView {
  private container: HTMLElement;
  private onAddBlock: (type: BlockType) => void;
  private activeCategory: BlockCategory | 'all' = 'all';
  private searchQuery = '';
  private listEl!: HTMLElement;
  private catBarEl!: HTMLElement;
  private detailEl!: HTMLElement;

  constructor(opts: ToolboxOptions) {
    this.container = opts.container;
    this.onAddBlock = opts.onAddBlock;
    this.mount();
  }

  private mount(): void {
    this.container.innerHTML = `
      <div class="toolbox-header">
        <div class="pane-title-row">
          <span class="pane-title">BLOCKS</span>
          <span class="pane-hint">Click or drag</span>
        </div>
        <div class="search-box">
          <span class="search-icon">${ICONS.search}</span>
          <input
            id="toolbox-search"
            type="search"
            class="search-input"
            placeholder="Filter blocks (loop, math, gui...)"
            autocomplete="off"
          />
        </div>
        <div class="cat-pills" id="toolbox-categories" role="tablist" aria-label="Block categories"></div>
      </div>
      <div class="toolbox-list" id="toolbox-list"></div>
      <div class="toolbox-detail" id="toolbox-detail">
        <div class="tb-detail-title">Hover a block for SE API details</div>
        <div class="tb-detail-api">Click any block to insert, or drag directly into a slot</div>
      </div>
    `;

    this.catBarEl = this.container.querySelector('#toolbox-categories') as HTMLElement;
    this.listEl = this.container.querySelector('#toolbox-list') as HTMLElement;
    this.detailEl = this.container.querySelector('#toolbox-detail') as HTMLElement;

    const searchInput = this.container.querySelector('#toolbox-search') as HTMLInputElement;
    searchInput.addEventListener('input', () => {
      this.searchQuery = searchInput.value.trim().toLowerCase();
      this.renderList();
    });

    this.renderCategories();
    this.renderList();
  }

  private renderCategories(): void {
    const allPill = `
      <button
        type="button"
        class="cat-pill ${this.activeCategory === 'all' ? 'active' : ''}"
        data-cat="all"
        role="tab"
        aria-selected="${this.activeCategory === 'all'}"
      >All</button>
    `;
    const pills = BLOCK_CATEGORIES.map(
      (cat) => `
      <button
        type="button"
        class="cat-pill ${this.activeCategory === cat.id ? 'active' : ''}"
        data-cat="${cat.id}"
        role="tab"
        aria-selected="${this.activeCategory === cat.id}"
      >
        <span class="cat-dot" style="background:${cat.color}"></span>
        ${cat.shortLabel}
      </button>
    `
    ).join('');

    this.catBarEl.innerHTML = allPill + pills;
    this.catBarEl.querySelectorAll<HTMLButtonElement>('.cat-pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.activeCategory = (btn.dataset.cat as BlockCategory | 'all') || 'all';
        this.renderCategories();
        this.renderList();
      });
    });
  }

  private renderList(): void {
    const filtered = BLOCK_CATALOG.filter((def) => {
      if (this.activeCategory !== 'all' && def.category !== this.activeCategory) return false;
      if (!this.searchQuery) return true;
      const hay = `${def.label} ${def.shortDesc} ${def.seApiSummary} ${def.category}`.toLowerCase();
      return hay.includes(this.searchQuery);
    });

    if (filtered.length === 0) {
      this.listEl.innerHTML = `
        <div class="toolbox-empty">
          No blocks match "<strong>${this.escapeHtml(this.searchQuery)}</strong>".
        </div>
      `;
      return;
    }

    const showGroupHeaders = this.activeCategory === 'all' && !this.searchQuery;
    const frag = document.createDocumentFragment();
    let lastCat: BlockCategory | null = null;

    for (const def of filtered) {
      const cat = CATEGORY_MAP[def.category];
      if (showGroupHeaders && def.category !== lastCat) {
        lastCat = def.category;
        const heading = document.createElement('div');
        heading.className = 'toolbox-group-heading';
        heading.innerHTML = `<span class="cat-dot" style="background:${cat.color}"></span><span>${cat.label}</span>`;
        frag.appendChild(heading);
      }

      const item = document.createElement('div');
      item.className = 'palette-block';
      item.draggable = true;
      item.dataset.blockType = def.type;
      item.style.setProperty('--block-color', cat.color);
      item.title = `${def.shortDesc}\nSE API: ${def.seApiSummary}`;

      item.innerHTML = `
        <span class="palette-dot" style="background:${cat.color}"></span>
        <span class="palette-block-title">${this.escapeHtml(def.label)}</span>
        ${def.isContainer ? '<span class="palette-c-badge" title="Container block">{ }</span>' : ''}
        <button type="button" class="palette-add-btn" aria-label="Add ${this.escapeHtml(def.label)}" title="Insert block">
          ${ICONS.plus}
        </button>
      `;

      item.addEventListener('mouseenter', () => {
        this.detailEl.innerHTML = `
          <div class="tb-detail-title">${this.escapeHtml(def.shortDesc)}</div>
          <div class="tb-detail-api">${this.escapeHtml(def.seApiSummary)}</div>
        `;
      });

      item.addEventListener('dragstart', (ev) => {
        setActiveDrag({ kind: 'palette', blockType: def.type });
        item.classList.add('is-dragging');
        if (ev.dataTransfer) {
          ev.dataTransfer.effectAllowed = 'copy';
          ev.dataTransfer.setData('text/plain', `palette:${def.type}`);
        }
      });

      item.addEventListener('dragend', () => {
        item.classList.remove('is-dragging');
        setActiveDrag(null);
      });

      item.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.onAddBlock(def.type);
      });

      frag.appendChild(item);
    }

    this.listEl.innerHTML = '';
    this.listEl.appendChild(frag);
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
