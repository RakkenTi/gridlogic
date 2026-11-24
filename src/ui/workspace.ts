import { BLOCK_MAP, CATEGORY_MAP } from '../blocks/catalog';
import { countAllBlocks, type ContainerSlot, type DropTarget, type ProjectStore } from '../state/store';
import type { BlockFieldSchema, ScriptBlock, UpdateFrequencyOption } from '../types';
import { getActiveDrag, setActiveDrag } from './dragState';
import { ICONS } from './icons';
import { VariableAutocompleteController } from './varAutocomplete';

export interface WorkspaceOptions {
  container: HTMLElement;
  store: ProjectStore;
  onParamTextEdit: () => void;
  onOpenPresets: () => void;
  onToast?: (msg: string) => void;
}

export class WorkspaceView {
  private container: HTMLElement;
  private store: ProjectStore;
  private onParamTextEdit: () => void;
  private onOpenPresets: () => void;
  private varAc: VariableAutocompleteController;

  private headerEl!: HTMLElement;
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
      <div class="workspace-scroll" id="workspace-scroll">
        <div class="workspace-stack-host" id="workspace-stack-host"></div>
      </div>
    `;
    this.headerEl = this.container.querySelector('#workspace-hat') as HTMLElement;
    this.stackHostEl = this.container.querySelector('#workspace-stack-host') as HTMLElement;

    // Clicking blank workspace clears selection
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

  private renderHat(): void {
    const project = this.store.getProject();
    const total = countAllBlocks(project.blocks);

    this.headerEl.innerHTML = `
      <div class="hat-left">
        <div class="hat-badge">WHEN SCRIPT RUNS</div>
        <label class="hat-control">
          <span class="hat-label">Update Rate</span>
          <select id="project-freq-select" class="hat-select">
            <option value="Update100" ${project.updateFrequency === 'Update100' ? 'selected' : ''}>Every 1.6s (Update100)</option>
            <option value="Update10" ${project.updateFrequency === 'Update10' ? 'selected' : ''}>Every 0.16s (Update10)</option>
            <option value="Update1" ${project.updateFrequency === 'Update1' ? 'selected' : ''}>Every Tick (Update1)</option>
            <option value="None" ${project.updateFrequency === 'None' ? 'selected' : ''}>Manual / Button Only</option>
          </select>
        </label>
        <label class="hat-checkbox" title="Uses Me.IsSameConstructAs so docked ships do not hijack your base or ship blocks">
          <input id="project-same-grid" type="checkbox" ${project.sameGridOnly ? 'checked' : ''} />
          <span>Same Ship Only</span>
        </label>
      </div>
      <div class="hat-right">
        <button type="button" id="open-vars-ref-btn" class="hat-vars-btn" title="Browse & insert built-in ship variables like {speed}, {battery}, {h2} — or type { in any text field">
          <span class="hat-vars-brace">{ }</span>
          <span>Variables</span>
        </button>
        <span class="hat-metric">${total} block${total === 1 ? '' : 's'}</span>
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

    const varsBtn = this.headerEl.querySelector('#open-vars-ref-btn') as HTMLButtonElement | null;
    varsBtn?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.varAc.toggleReferencePopover(varsBtn);
    });
  }

  private renderStack(): void {
    const project = this.store.getProject();
    this.stackHostEl.innerHTML = '';

    if (project.blocks.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'workspace-empty';
      empty.innerHTML = `
        <div class="empty-kicker">EMPTY PROGRAMMABLE BLOCK</div>
        <h3 class="empty-title">Snap logic blocks together to build your ship script</h3>
        <p class="empty-desc">
          Click or drag any block from the left toolbox, or start from a tested Space Engineers template.
        </p>
        <div class="empty-actions">
          <button type="button" class="btn btn-primary" id="empty-load-hud">Load Bridge Telemetry HUD</button>
          <button type="button" class="btn btn-secondary" id="empty-browse-presets">Browse All 8 Presets</button>
        </div>
      `;
      this.attachDropZoneHandlers(empty, { parentId: null, slot: 'root', index: 0 });
      this.stackHostEl.appendChild(empty);

      empty.querySelector('#empty-load-hud')?.addEventListener('click', () => {
        this.store.loadPreset('bridge-telemetry-hud');
      });
      empty.querySelector('#empty-browse-presets')?.addEventListener('click', () => {
        this.onOpenPresets();
      });
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
      dz.innerHTML = `<span>Drop blocks here or select parent and click a toolbox block</span>`;
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

    // Prevent dragging when interacting with inputs or buttons
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

    // Header bar
    const header = document.createElement('div');
    header.className = 'se-block-header';

    const titleCluster = document.createElement('div');
    titleCluster.className = 'se-block-title-cluster';

    const grip = document.createElement('span');
    grip.className = 'se-block-grip';
    grip.innerHTML = ICONS.grip;
    grip.title = 'Drag to reorder or nest';
    titleCluster.appendChild(grip);

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
      titleCluster.appendChild(collapseBtn);
    }

    const labelEl = document.createElement('span');
    labelEl.className = 'se-block-label';
    labelEl.textContent = def.label;
    titleCluster.appendChild(labelEl);

    if (block.disabled) {
      const mutedBadge = document.createElement('span');
      mutedBadge.className = 'se-muted-tag';
      mutedBadge.textContent = 'MUTED';
      titleCluster.appendChild(mutedBadge);
    }

    header.appendChild(titleCluster);

    // Block action buttons
    const actions = document.createElement('div');
    actions.className = 'se-block-actions';

    if (def.supportsElse) {
      const hasElse = Boolean(block.params.hasElse);
      const elseBtn = document.createElement('button');
      elseBtn.type = 'button';
      elseBtn.className = `se-mini-pill ${hasElse ? 'active' : ''}`;
      elseBtn.textContent = hasElse ? '− Else' : '+ Else';
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
      mkBtn(ICONS.duplicate, 'Duplicate block', () => this.store.duplicateBlock(block.id))
    );
    actions.appendChild(
      mkBtn(
        block.disabled ? ICONS.eyeOff : ICONS.eye,
        block.disabled ? 'Enable block' : 'Temporarily mute block',
        () => this.store.toggleBlockDisabled(block.id)
      )
    );
    actions.appendChild(
      mkBtn(ICONS.trash, 'Delete block', () => this.store.deleteBlock(block.id), 'danger')
    );

    header.appendChild(actions);
    card.appendChild(header);

    // Inline parameter fields
    const visibleFields = def.fields.filter(
      (f) => !f.visibleWhen || f.visibleWhen(block.params)
    );
    if (visibleFields.length > 0) {
      const fieldsRow = document.createElement('div');
      fieldsRow.className = 'se-block-fields';
      for (const field of visibleFields) {
        fieldsRow.appendChild(this.renderFieldControl(block, field));
      }
      card.appendChild(fieldsRow);
    }

    // Container children ("THEN" / body)
    if (def.isContainer && !block.collapsed) {
      const bodyWrap = document.createElement('div');
      bodyWrap.className = 'se-container-body';
      if (block.type === 'if_condition') {
        const thenLabel = document.createElement('div');
        thenLabel.className = 'se-branch-label';
        thenLabel.textContent = 'THEN DO';
        bodyWrap.appendChild(thenLabel);
      }
      bodyWrap.appendChild(this.renderBlockList(block.children ?? [], block.id, 'children'));
      card.appendChild(bodyWrap);

      // Optional ELSE branch
      if (def.supportsElse && block.params.hasElse) {
        const elseWrap = document.createElement('div');
        elseWrap.className = 'se-container-body se-else-body';
        const elseLabel = document.createElement('div');
        elseLabel.className = 'se-branch-label se-else-label';
        elseLabel.textContent = 'ELSE (OTHERWISE)';
        elseWrap.appendChild(elseLabel);
        elseWrap.appendChild(
          this.renderBlockList(block.elseChildren ?? [], block.id, 'elseChildren')
        );
        card.appendChild(elseWrap);
      }

      const footerCap = document.createElement('div');
      footerCap.className = 'se-container-cap';
      card.appendChild(footerCap);
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

    const lbl = document.createElement('span');
    lbl.className = 'se-field-label';
    lbl.textContent = field.label;
    wrap.appendChild(lbl);

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
      const hexSpan = document.createElement('span');
      hexSpan.className = 'se-color-hex';
      hexSpan.textContent = input.value.toUpperCase();
      input.addEventListener('input', () => {
        hexSpan.textContent = input.value.toUpperCase();
        // Mutate silently without tearing down DOM
        block.params[field.key] = input.value;
        this.onParamTextEdit();
      });
      input.addEventListener('change', () => {
        this.store.updateBlockParam(block.id, field.key, input.value);
      });
      colorWrap.appendChild(input);
      colorWrap.appendChild(hexSpan);
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
        // Direct update + live preview refresh so focus & caret NEVER jump!
        applyChange(input.value);
      });

      if (supportsVars) {
        input.classList.add('se-has-var-btn');
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.dataset.supportsVars = 'true';

        this.varAc.attachToInput(input, field.label, applyChange);

        const inputWrap = document.createElement('div');
        inputWrap.className = 'se-var-input-wrap';
        inputWrap.appendChild(input);

        const triggerBtn = document.createElement('button');
        triggerBtn.type = 'button';
        triggerBtn.className = 'se-var-trigger';
        triggerBtn.textContent = '{}';
        triggerBtn.title = 'Insert live ship variable (or type { )';
        triggerBtn.setAttribute('aria-label', `Insert variable into ${field.label}`);
        triggerBtn.addEventListener('mousedown', (ev) => {
          // Keep current input focus & selection intact before toggling picker
          ev.preventDefault();
          ev.stopPropagation();
        });
        triggerBtn.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          this.varAc.togglePickerForInput(input, field.label, applyChange);
        });

        inputWrap.appendChild(triggerBtn);
        wrap.appendChild(inputWrap);
      } else {
        wrap.appendChild(input);
      }
    }

    return wrap;
  }
}
