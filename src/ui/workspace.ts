import { BLOCK_MAP, CATEGORY_MAP } from '../blocks/catalog';
import { countAllBlocks, type ContainerSlot, type DropTarget, type ProjectStore } from '../state/store';
import type { BlockFieldSchema, ScriptBlock, UpdateFrequencyOption } from '../types';
import { getActiveDrag, setActiveDrag } from './dragState';
import { ICONS } from './icons';
import { VariableAutocompleteController } from './varAutocomplete';

export type WorkspaceLayoutMode = 'board' | 'list';

export interface WorkspaceOptions {
  container: HTMLElement;
  store: ProjectStore;
  onParamTextEdit: () => void;
  onOpenPresets: () => void;
  onToast?: (msg: string) => void;
}

interface BoardSection {
  id: string;
  badge: string;
  title: string;
  color: string;
  kind: 'module' | 'main';
  entries: Array<{ block: ScriptBlock; rootIndex: number }>;
}

export class WorkspaceView {
  private container: HTMLElement;
  private store: ProjectStore;
  private onParamTextEdit: () => void;
  private onOpenPresets: () => void;
  private varAc: VariableAutocompleteController;

  private layoutMode: WorkspaceLayoutMode = 'board';
  private headerEl!: HTMLElement;
  private jumpBarEl!: HTMLElement;
  private stackHostEl!: HTMLElement;

  constructor(opts: WorkspaceOptions) {
    this.container = opts.container;
    this.store = opts.store;
    this.onParamTextEdit = opts.onParamTextEdit;
    this.onOpenPresets = opts.onOpenPresets;
    this.varAc = new VariableAutocompleteController({
      getBlocks: () => this.store.getProject().blocks,
      onToast: opts.onToast,
    });
    this.mount();
  }

  private mount(): void {
    this.container.innerHTML = `
      <div class="workspace-hat" id="workspace-hat"></div>
      <div class="workspace-jump-bar" id="workspace-jump-bar" hidden></div>
      <div class="workspace-scroll" id="workspace-scroll">
        <div class="workspace-stack-host" id="workspace-stack-host"></div>
      </div>
    `;
    this.headerEl = this.container.querySelector('#workspace-hat') as HTMLElement;
    this.jumpBarEl = this.container.querySelector('#workspace-jump-bar') as HTMLElement;
    this.stackHostEl = this.container.querySelector('#workspace-stack-host') as HTMLElement;

    const scrollEl = this.container.querySelector('#workspace-scroll') as HTMLElement;
    scrollEl.addEventListener('click', (ev) => {
      if (ev.target === scrollEl || ev.target === this.stackHostEl) {
        this.store.selectBlock(null);
      }
    });

    this.render();
  }

  render(): void {
    this.varAc.closeMenu();
    this.renderHat();
    this.renderStack();
  }

  highlightBlock(blockId: string): void {
    this.store.selectBlock(blockId);
    const el = this.stackHostEl.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(blockId)}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('flash-highlight');
      setTimeout(() => el.classList.remove('flash-highlight'), 1100);
    }
  }

  private buildBoardSections(rootBlocks: ScriptBlock[]): BoardSection[] {
    const sections: BoardSection[] = [];
    const mainEntries: Array<{ block: ScriptBlock; rootIndex: number }> = [];

    const isDedicatedModule = (b: ScriptBlock) =>
      b.type === 'define_function' ||
      b.type === 'on_setup' ||
      b.type === 'on_argument' ||
      b.type === 'gui_screen';

    rootBlocks.forEach((block, rootIndex) => {
      if (isDedicatedModule(block)) {
        let badge = 'MOD';
        let title = BLOCK_MAP[block.type]?.label ?? block.type;
        let color = CATEGORY_MAP[BLOCK_MAP[block.type]?.category ?? 'control']?.color ?? '#C98A3A';
        if (block.type === 'define_function') {
          badge = 'FN';
          title = String(block.params.name || 'Routine');
        } else if (block.type === 'on_setup') {
          badge = 'INIT';
          title = 'On Script Start';
        } else if (block.type === 'on_argument') {
          badge = 'ARG';
          title = `"${String(block.params.argument || 'toggle')}"`;
        } else if (block.type === 'gui_screen') {
          badge = 'HUD';
          title = String(block.params.lcdName || 'Status LCD');
          color = CATEGORY_MAP.gui.color;
        }
        sections.push({
          id: `sec_${block.id}`,
          badge,
          title,
          color,
          kind: 'module',
          entries: [{ block, rootIndex }],
        });
      } else {
        mainEntries.push({ block, rootIndex });
      }
    });

    if (mainEntries.length > 0) {
      // Place Main Loop right after functions/setup, before HUD screens for clear reading order
      const firstHudIdx = sections.findIndex((s) => s.badge === 'HUD');
      const mainSec: BoardSection = {
        id: 'sec_main_loop',
        badge: 'MAIN',
        title: 'Main Loop',
        color: '#D98A2B',
        kind: 'main',
        entries: mainEntries,
      };
      if (firstHudIdx >= 0) sections.splice(firstHudIdx, 0, mainSec);
      else sections.push(mainSec);
    }

    return sections;
  }

  private renderHat(): void {
    const project = this.store.getProject();
    const total = countAllBlocks(project.blocks);

    this.headerEl.innerHTML = `
      <div class="hat-left">
        <span class="hat-badge">MAIN</span>
        <select id="project-freq-select" class="hat-select" title="Script execution rate in Space Engineers">
          <option value="Update100" ${project.updateFrequency === 'Update100' ? 'selected' : ''}>1.6s (Update100)</option>
          <option value="Update10" ${project.updateFrequency === 'Update10' ? 'selected' : ''}>0.16s (Update10)</option>
          <option value="Update1" ${project.updateFrequency === 'Update1' ? 'selected' : ''}>Tick (Update1)</option>
          <option value="None" ${project.updateFrequency === 'None' ? 'selected' : ''}>Manual Only</option>
        </select>
        <label class="hat-checkbox" title="Uses Me.IsSameConstructAs so docked ships do not interfere">
          <input id="project-same-grid" type="checkbox" ${project.sameGridOnly ? 'checked' : ''} />
          <span>Same Grid</span>
        </label>
      </div>
      <div class="hat-right">
        <div class="layout-seg" role="group" aria-label="Workspace layout">
          <button type="button" id="layout-board-btn" class="layout-seg-btn ${this.layoutMode === 'board' ? 'active' : ''}" title="Side-by-side multi-column modules (less scrolling)">Board</button>
          <button type="button" id="layout-list-btn" class="layout-seg-btn ${this.layoutMode === 'list' ? 'active' : ''}" title="Classic single-column top-down outline">List</button>
        </div>
        <button type="button" id="ws-add-fn-btn" class="hat-tool-btn" title="Add a reusable Define Function subroutine">+ Fn</button>
        <button type="button" id="ws-collapse-all-btn" class="hat-tool-btn" title="Collapse all container blocks">Fold</button>
        <button type="button" id="ws-expand-all-btn" class="hat-tool-btn" title="Expand all container blocks">Unfold</button>
        <button type="button" id="open-vars-ref-btn" class="hat-vars-btn" title="Browse & insert live ship variables like {speed}, {battery}, {_name} — or type { in any field">
          <span class="hat-vars-brace">{ }</span>
          <span>Vars</span>
        </button>
        <span class="hat-metric">${total}</span>
      </div>
    `;

    const freqSel = this.headerEl.querySelector('#project-freq-select') as HTMLSelectElement;
    freqSel.addEventListener('change', () => {
      this.store.updateProjectMeta({
        updateFrequency: freqSel.value as UpdateFrequencyOption,
      });
    });

    const sameGridChk = this.headerEl.querySelector('#project-same-grid') as HTMLInputElement;
    sameGridChk.addEventListener('change', () => {
      this.store.updateProjectMeta({ sameGridOnly: sameGridChk.checked });
    });

    this.headerEl.querySelector('#layout-board-btn')?.addEventListener('click', () => {
      if (this.layoutMode !== 'board') {
        this.layoutMode = 'board';
        this.render();
      }
    });
    this.headerEl.querySelector('#layout-list-btn')?.addEventListener('click', () => {
      if (this.layoutMode !== 'list') {
        this.layoutMode = 'list';
        this.render();
      }
    });
    this.headerEl.querySelector('#ws-add-fn-btn')?.addEventListener('click', () => {
      this.store.addBlock('define_function');
    });
    this.headerEl.querySelector('#ws-collapse-all-btn')?.addEventListener('click', () => {
      this.store.setAllCollapsed(true);
    });
    this.headerEl.querySelector('#ws-expand-all-btn')?.addEventListener('click', () => {
      this.store.setAllCollapsed(false);
    });

    const varsBtn = this.headerEl.querySelector('#open-vars-ref-btn') as HTMLButtonElement | null;
    varsBtn?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.varAc.toggleReferencePopover(varsBtn);
    });
  }

  private renderJumpBar(sections: BoardSection[]): void {
    if (sections.length < 2) {
      this.jumpBarEl.hidden = true;
      this.jumpBarEl.innerHTML = '';
      return;
    }

    this.jumpBarEl.hidden = false;
    this.jumpBarEl.innerHTML = sections
      .map(
        (s) => `
        <button type="button" class="jump-pill" data-jump-sec="${s.id}" style="--pill-color:${s.color}">
          <span class="jump-pill-badge">${s.badge}</span>
          <span class="jump-pill-title">${this.escapeHtml(s.title)}</span>
        </button>
      `
      )
      .join('');

    this.jumpBarEl.querySelectorAll<HTMLButtonElement>('.jump-pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        const secId = btn.dataset.jumpSec;
        if (!secId) return;
        const target =
          this.stackHostEl.querySelector<HTMLElement>(`[data-section-id="${CSS.escape(secId)}"]`) ||
          this.stackHostEl.querySelector<HTMLElement>(
            `[data-block-id="${CSS.escape(secId.replace(/^sec_/, ''))}"]`
          );
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
          target.classList.add('flash-highlight');
          setTimeout(() => target.classList.remove('flash-highlight'), 900);
        }
      });
    });
  }

  private renderStack(): void {
    const project = this.store.getProject();
    this.stackHostEl.innerHTML = '';

    if (project.blocks.length === 0) {
      this.jumpBarEl.hidden = true;
      const empty = document.createElement('div');
      empty.className = 'workspace-empty';
      empty.innerHTML = `
        <div class="empty-kicker">EMPTY PROGRAMMABLE BLOCK</div>
        <h3 class="empty-title">Build custom ship logic from native blocks or start from an example</h3>
        <p class="empty-desc">
          Combine Loops, Functions, Math, CustomData INI, Hardware Controls, and Vector GUI widgets — zero preset lock-in.
        </p>
        <div class="empty-actions">
          <button type="button" class="btn btn-primary" id="empty-load-native">Load Native Power Balancer</button>
          <button type="button" class="btn btn-secondary" id="empty-load-hud">Load Bridge Telemetry HUD</button>
          <button type="button" class="btn btn-ghost" id="empty-browse-presets">Browse All 11 Examples</button>
        </div>
      `;
      this.attachDropZoneHandlers(empty, { parentId: null, slot: 'root', index: 0 });
      this.stackHostEl.appendChild(empty);

      empty.querySelector('#empty-load-native')?.addEventListener('click', () => {
        this.store.loadPreset('native-power-grid-balancer');
      });
      empty.querySelector('#empty-load-hud')?.addEventListener('click', () => {
        this.store.loadPreset('bridge-telemetry-hud');
      });
      empty.querySelector('#empty-browse-presets')?.addEventListener('click', () => {
        this.onOpenPresets();
      });
      return;
    }

    const sections = this.buildBoardSections(project.blocks);
    this.renderJumpBar(sections);

    if (this.layoutMode === 'board' && sections.length >= 2) {
      const board = document.createElement('div');
      board.className = 'workspace-board';
      const totalRoot = project.blocks.length;

      for (const sec of sections) {
        const col = document.createElement('div');
        col.className = 'board-module';
        col.dataset.sectionId = sec.id;
        col.style.setProperty('--mod-color', sec.color);

        const modCount = sec.entries.reduce((acc, e) => acc + countAllBlocks([e.block]), 0);
        const modHead = document.createElement('div');
        modHead.className = 'board-module-head';
        modHead.innerHTML = `
          <span class="board-mod-badge">${sec.badge}</span>
          <span class="board-mod-title">${this.escapeHtml(sec.title)}</span>
          <span class="board-mod-count">${modCount} blk</span>
        `;
        col.appendChild(modHead);

        const modBody = document.createElement('div');
        modBody.className = 'board-module-body';

        if (sec.kind === 'main') {
          sec.entries.forEach((entry) => {
            modBody.appendChild(this.createDropZone({ parentId: null, slot: 'root', index: entry.rootIndex }, false));
            modBody.appendChild(this.renderBlockNode(entry.block, entry.rootIndex, totalRoot));
          });
          const lastIdx = sec.entries[sec.entries.length - 1].rootIndex + 1;
          modBody.appendChild(this.createDropZone({ parentId: null, slot: 'root', index: lastIdx }, false));
        } else {
          const entry = sec.entries[0];
          modBody.appendChild(this.renderBlockNode(entry.block, entry.rootIndex, totalRoot));
        }

        col.appendChild(modBody);
        board.appendChild(col);
      }

      this.stackHostEl.appendChild(board);
      return;
    }

    const listEl = this.renderBlockList(project.blocks, null, 'root');
    this.stackHostEl.appendChild(listEl);
  }

  private renderBlockList(
    blocks: ScriptBlock[],
    parentId: string | null,
    slot: ContainerSlot
  ): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = parentId === null ? 'block-stack root-stack' : 'block-stack nested-stack';

    wrap.appendChild(this.createDropZone({ parentId, slot, index: 0 }, blocks.length === 0));

    blocks.forEach((block, index) => {
      wrap.appendChild(this.renderBlockNode(block, index, blocks.length));
      wrap.appendChild(this.createDropZone({ parentId, slot, index: index + 1 }, false));
    });

    return wrap;
  }

  private createDropZone(target: DropTarget, isEmptySlot: boolean): HTMLElement {
    const dz = document.createElement('div');
    dz.className = isEmptySlot ? 'drop-zone drop-zone-empty' : 'drop-zone';
    if (isEmptySlot) {
      dz.innerHTML = `<span>Drop block here or select parent &amp; click toolbox</span>`;
    }
    this.attachDropZoneHandlers(dz, target);
    return dz;
  }

  private attachDropZoneHandlers(el: HTMLElement, target: DropTarget): void {
    el.addEventListener('dragover', (ev) => {
      if (!getActiveDrag()) return;
      ev.preventDefault();
      ev.stopPropagation();
      el.classList.add('is-over');
      if (ev.dataTransfer) {
        ev.dataTransfer.dropEffect = getActiveDrag()?.kind === 'palette' ? 'copy' : 'move';
      }
    });

    el.addEventListener('dragleave', (ev) => {
      ev.stopPropagation();
      el.classList.remove('is-over');
    });

    el.addEventListener('drop', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      el.classList.remove('is-over');
      const payload = getActiveDrag();
      setActiveDrag(null);
      if (!payload) return;

      if (payload.kind === 'palette') {
        this.store.addBlock(payload.blockType, target);
      } else if (payload.kind === 'existing') {
        this.store.moveBlock(payload.blockId, target);
      }
    });
  }

  private renderBlockNode(block: ScriptBlock, index: number, siblingCount: number): HTMLElement {
    const def = BLOCK_MAP[block.type];
    const cat = CATEGORY_MAP[def.category];
    const isSelected = this.store.getSelectedBlockId() === block.id;

    const card = document.createElement('div');
    card.className = [
      'se-block',
      def.isContainer ? 'is-container' : 'is-leaf',
      isSelected ? 'is-selected' : '',
      block.disabled ? 'is-disabled' : '',
      block.type === 'comment' ? 'is-comment' : '',
    ]
      .filter(Boolean)
      .join(' ');
    card.dataset.blockId = block.id;
    card.dataset.blockType = block.type;
    card.style.setProperty('--block-color', cat.color);
    card.style.setProperty('--block-bg-tint', cat.accentBg);
    card.draggable = true;

    card.addEventListener('dragstart', (ev) => {
      const targetEl = ev.target as HTMLElement | null;
      if (targetEl && ['INPUT', 'SELECT', 'TEXTAREA', 'OPTION', 'BUTTON'].includes(targetEl.tagName)) {
        ev.preventDefault();
        return;
      }
      ev.stopPropagation();
      setActiveDrag({ kind: 'existing', blockId: block.id });
      card.classList.add('is-dragging');
      if (ev.dataTransfer) {
        ev.dataTransfer.effectAllowed = 'move';
        ev.dataTransfer.setData('text/plain', `existing:${block.id}`);
      }
    });

    card.addEventListener('dragend', (ev) => {
      ev.stopPropagation();
      card.classList.remove('is-dragging');
      setActiveDrag(null);
    });

    card.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (this.store.getSelectedBlockId() !== block.id) {
        const targetEl = ev.target as HTMLElement | null;
        const inControl = Boolean(
          targetEl &&
            (['INPUT', 'SELECT', 'TEXTAREA', 'OPTION', 'BUTTON'].includes(targetEl.tagName) ||
              targetEl.closest('.se-field'))
        );
        if (inControl) {
          this.store.selectBlock(block.id, true);
          this.stackHostEl.querySelectorAll('.se-block.is-selected').forEach((el) => {
            el.classList.remove('is-selected');
          });
          card.classList.add('is-selected');
        } else {
          this.store.selectBlock(block.id);
        }
      }
    });

    // Compact unified top row: [grip] [chevron?] [label] [inline fields] [collapsed badge?] [actions]
    const topRow = document.createElement('div');
    topRow.className = 'se-block-row';

    const lead = document.createElement('div');
    lead.className = 'se-block-lead';

    const grip = document.createElement('span');
    grip.className = 'se-block-grip';
    grip.innerHTML = ICONS.grip;
    grip.title = 'Drag to reorder or nest';
    lead.appendChild(grip);

    if (def.isContainer) {
      const collapseBtn = document.createElement('button');
      collapseBtn.type = 'button';
      collapseBtn.className = `se-collapse-btn ${block.collapsed ? 'is-collapsed' : ''}`;
      collapseBtn.innerHTML = ICONS.chevron;
      collapseBtn.title = block.collapsed ? 'Expand block' : 'Collapse block';
      collapseBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.store.toggleBlockCollapsed(block.id);
      });
      lead.appendChild(collapseBtn);
    }

    const labelEl = document.createElement('span');
    labelEl.className = 'se-block-label';
    labelEl.textContent = def.label;
    lead.appendChild(labelEl);

    if (block.disabled) {
      const mutedBadge = document.createElement('span');
      mutedBadge.className = 'se-muted-tag';
      mutedBadge.textContent = 'OFF';
      lead.appendChild(mutedBadge);
    }

    if (def.isContainer && block.collapsed) {
      const childTotal =
        countAllBlocks(block.children ?? []) + countAllBlocks(block.elseChildren ?? []);
      const foldBadge = document.createElement('span');
      foldBadge.className = 'se-fold-count';
      foldBadge.textContent = `${childTotal} blk`;
      lead.appendChild(foldBadge);
    }

    topRow.appendChild(lead);

    // Inline parameter fields directly inside the same compact row!
    const visibleFields = def.fields.filter(
      (f) => !f.visibleWhen || f.visibleWhen(block.params)
    );
    if (visibleFields.length > 0) {
      const fieldsRow = document.createElement('div');
      fieldsRow.className = 'se-block-fields';
      for (const field of visibleFields) {
        fieldsRow.appendChild(this.renderFieldControl(block, field));
      }
      topRow.appendChild(fieldsRow);
    }

    // Hover/selected compact action bar
    const actions = document.createElement('div');
    actions.className = 'se-block-actions';

    if (def.supportsElse) {
      const hasElse = Boolean(block.params.hasElse);
      const elseBtn = document.createElement('button');
      elseBtn.type = 'button';
      elseBtn.className = `se-mini-pill ${hasElse ? 'active' : ''}`;
      elseBtn.textContent = hasElse ? '−Else' : '+Else';
      elseBtn.title = hasElse ? 'Remove Else branch' : 'Add Else branch';
      elseBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.store.updateBlockParam(block.id, 'hasElse', !hasElse);
      });
      actions.appendChild(elseBtn);
    }

    const mkBtn = (
      icon: string,
      title: string,
      onClick: () => void,
      extraClass = '',
      disabled = false
    ) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `se-icon-btn ${extraClass}`;
      btn.innerHTML = icon;
      btn.title = title;
      btn.disabled = disabled;
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        onClick();
      });
      return btn;
    };

    actions.appendChild(
      mkBtn(ICONS.up, 'Move up', () => this.store.nudgeBlock(block.id, -1), '', index === 0)
    );
    actions.appendChild(
      mkBtn(
        ICONS.down,
        'Move down',
        () => this.store.nudgeBlock(block.id, 1),
        '',
        index === siblingCount - 1
      )
    );
    actions.appendChild(
      mkBtn(ICONS.duplicate, 'Duplicate', () => this.store.duplicateBlock(block.id))
    );
    actions.appendChild(
      mkBtn(
        block.disabled ? ICONS.eyeOff : ICONS.eye,
        block.disabled ? 'Enable' : 'Mute',
        () => this.store.toggleBlockDisabled(block.id)
      )
    );
    actions.appendChild(
      mkBtn(ICONS.trash, 'Delete', () => this.store.deleteBlock(block.id), 'danger')
    );

    topRow.appendChild(actions);
    card.appendChild(topRow);

    // Container body
    if (def.isContainer && !block.collapsed) {
      const bodyWrap = document.createElement('div');
      bodyWrap.className = 'se-container-body';
      if (block.type === 'if_condition') {
        const thenLabel = document.createElement('div');
        thenLabel.className = 'se-branch-label';
        thenLabel.textContent = 'THEN';
        bodyWrap.appendChild(thenLabel);
      }
      bodyWrap.appendChild(this.renderBlockList(block.children ?? [], block.id, 'children'));
      card.appendChild(bodyWrap);

      if (def.supportsElse && block.params.hasElse) {
        const elseWrap = document.createElement('div');
        elseWrap.className = 'se-container-body se-else-body';
        const elseLabel = document.createElement('div');
        elseLabel.className = 'se-branch-label se-else-label';
        elseLabel.textContent = 'ELSE';
        elseWrap.appendChild(elseLabel);
        elseWrap.appendChild(
          this.renderBlockList(block.elseChildren ?? [], block.id, 'elseChildren')
        );
        card.appendChild(elseWrap);
      }
    }

    return card;
  }

  private renderFieldControl(block: ScriptBlock, field: BlockFieldSchema): HTMLElement {
    const wrap = document.createElement('label');
    wrap.className = `se-field se-field-${field.type} ${field.width ? `w-${field.width}` : ''}`;

    const val = block.params[field.key];

    if (field.type === 'boolean') {
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = Boolean(val);
      input.addEventListener('change', () => {
        this.store.updateBlockParam(block.id, field.key, input.checked);
      });
      const lbl = document.createElement('span');
      lbl.className = 'se-field-label';
      lbl.textContent = field.label;
      wrap.appendChild(input);
      wrap.appendChild(lbl);
      return wrap;
    }

    if (field.label) {
      const lbl = document.createElement('span');
      lbl.className = 'se-field-label';
      lbl.textContent = field.label;
      wrap.appendChild(lbl);
    }

    if (field.type === 'select') {
      const select = document.createElement('select');
      select.className = 'se-input se-select';
      for (const opt of field.options ?? []) {
        const o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label;
        if (String(val) === opt.value) o.selected = true;
        select.appendChild(o);
      }
      select.addEventListener('change', () => {
        this.store.updateBlockParam(block.id, field.key, select.value);
      });
      wrap.appendChild(select);
    } else if (field.type === 'color') {
      const colorWrap = document.createElement('div');
      colorWrap.className = 'se-color-wrap';
      const input = document.createElement('input');
      input.type = 'color';
      input.className = 'se-color-input';
      input.value = String(val || '#FFFFFF');
      input.title = input.value.toUpperCase();
      input.addEventListener('input', () => {
        input.title = input.value.toUpperCase();
        block.params[field.key] = input.value;
        this.onParamTextEdit();
      });
      input.addEventListener('change', () => {
        this.store.updateBlockParam(block.id, field.key, input.value);
      });
      colorWrap.appendChild(input);
      wrap.appendChild(colorWrap);
    } else if (field.type === 'number') {
      const input = document.createElement('input');
      input.type = 'number';
      input.className = 'se-input se-number';
      input.value = String(val ?? 0);
      if (field.min !== undefined) input.min = String(field.min);
      if (field.max !== undefined) input.max = String(field.max);
      if (field.step !== undefined) input.step = String(field.step);
      input.addEventListener('input', () => {
        const parsed = parseFloat(input.value);
        block.params[field.key] = Number.isFinite(parsed) ? parsed : 0;
        this.onParamTextEdit();
      });
      input.addEventListener('blur', () => {
        const parsed = parseFloat(input.value);
        this.store.updateBlockParam(block.id, field.key, Number.isFinite(parsed) ? parsed : 0, false);
      });
      wrap.appendChild(input);
    } else {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'se-input se-text';
      input.value = String(val ?? '');
      if (field.placeholder) input.placeholder = field.placeholder;

      const supportsVars =
        Boolean(field.supportsVars) &&
        !(block.type === 'set_variable' && block.params.source !== 'text');

      const applyChange = (nextVal: string) => {
        block.params[field.key] = nextVal;
        this.onParamTextEdit();
      };

      input.addEventListener('input', () => {
        applyChange(input.value);
      });

      if (supportsVars) {
        input.classList.add('se-has-var-btn');
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.dataset.supportsVars = 'true';

        this.varAc.attachToInput(input, field.label || field.key, applyChange);

        const inputWrap = document.createElement('div');
        inputWrap.className = 'se-var-input-wrap';
        inputWrap.appendChild(input);

        const triggerBtn = document.createElement('button');
        triggerBtn.type = 'button';
        triggerBtn.className = 'se-var-trigger';
        triggerBtn.textContent = '{}';
        triggerBtn.title = 'Insert live ship variable (or type { )';
        triggerBtn.setAttribute('aria-label', `Insert variable into ${field.label || field.key}`);
        triggerBtn.addEventListener('mousedown', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
        });
        triggerBtn.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          this.varAc.togglePickerForInput(input, field.label || field.key, applyChange);
        });

        inputWrap.appendChild(triggerBtn);
        wrap.appendChild(inputWrap);
      } else {
        wrap.appendChild(input);
      }
    }

    return wrap;
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
