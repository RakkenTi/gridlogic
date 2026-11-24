import {
  ASCII_BAR_VARIABLES,
  BUILTIN_GLOBAL_VARIABLES,
  applyVariableInsertion,
  extractCustomVariables,
  findOpenBraceContext,
  getAvailableTemplateVariables,
  type OpenBraceContext,
  type TemplateVariableDef,
} from '../blocks/variables';
import type { ScriptBlock } from '../types';

export interface ActiveInputEntry {
  input: HTMLInputElement;
  fieldLabel: string;
  onValueChange: (val: string) => void;
}

export interface VariableAutocompleteOptions {
  getBlocks: () => ScriptBlock[];
  onToast?: (msg: string) => void;
}

/**
 * Unified floating controller for:
 *  1) Live `{` autocomplete dropdown on every template-capable text input
 *  2) Inline `{}` quick-insert picker button on every template-capable text input
 *  3) Workspace-level `{ } Variables` reference popover (browse, insert, or copy)
 */
export class VariableAutocompleteController {
  private getBlocks: () => ScriptBlock[];
  private onToast?: (msg: string) => void;

  // Floating autocomplete / picker menu
  private menuEl: HTMLDivElement;
  private isOpen = false;
  private openMode: 'brace' | 'picker' = 'brace';
  private activeEntry: ActiveInputEntry | null = null;
  private activeBraceCtx: OpenBraceContext | null = null;
  private items: TemplateVariableDef[] = [];
  private activeIndex = 0;

  // Last-focused var-capable input (so Workspace Variables popover can insert directly into it)
  private lastFocusedEntry: ActiveInputEntry | null = null;

  // Workspace reference popover
  private refEl: HTMLDivElement;
  private isRefOpen = false;
  private refAnchorBtn: HTMLElement | null = null;

  constructor(opts: VariableAutocompleteOptions) {
    this.getBlocks = opts.getBlocks;
    this.onToast = opts.onToast;

    this.menuEl = document.createElement('div');
    this.menuEl.id = 'var-autocomplete-menu';
    this.menuEl.className = 'var-ac-menu';
    this.menuEl.setAttribute('role', 'listbox');
    this.menuEl.hidden = true;
    document.body.appendChild(this.menuEl);

    this.refEl = document.createElement('div');
    this.refEl.id = 'var-reference-popover';
    this.refEl.className = 'var-ref-popover';
    this.refEl.setAttribute('role', 'dialog');
    this.refEl.setAttribute('aria-label', 'Live ship variables reference');
    this.refEl.hidden = true;
    document.body.appendChild(this.refEl);

    this.bindGlobalListeners();
  }

  private bindGlobalListeners(): void {
    document.addEventListener('mousedown', (ev) => {
      const target = ev.target as Node | null;
      if (!target) return;

      if (this.isOpen) {
        const insideMenu = this.menuEl.contains(target);
        const isActiveInput = this.activeEntry?.input === target;
        const isTriggerBtn = (target as HTMLElement).closest?.('.se-var-trigger') != null;
        if (!insideMenu && !isActiveInput && !isTriggerBtn) {
          this.closeMenu();
        }
      }

      if (this.isRefOpen) {
        const insideRef = this.refEl.contains(target);
        const insideAnchor = this.refAnchorBtn?.contains(target) ?? false;
        if (!insideRef && !insideAnchor) {
          this.closeReference();
        }
      }
    });

    window.addEventListener('resize', () => {
      if (this.isOpen) this.positionMenu();
      if (this.isRefOpen) this.positionReference();
    });

    window.addEventListener(
      'scroll',
      (ev) => {
        const t = ev.target as Node | null;
        if (this.isOpen && t && !this.menuEl.contains(t)) {
          this.positionMenu();
        }
        if (this.isRefOpen && t && !this.refEl.contains(t)) {
          this.positionReference();
        }
      },
      true
    );

    window.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') {
        if (this.isOpen) {
          this.closeMenu();
        }
        if (this.isRefOpen) {
          this.closeReference();
        }
      }
    });
  }

  /**
   * Attaches live `{` autocomplete + tracks last-focused input on a template-capable text input.
   */
  attachToInput(
    input: HTMLInputElement,
    fieldLabel: string,
    onValueChange: (val: string) => void
  ): void {
    const entry: ActiveInputEntry = { input, fieldLabel, onValueChange };

    input.addEventListener('focus', () => {
      this.lastFocusedEntry = entry;
      this.checkBraceTrigger(entry);
    });

    input.addEventListener('input', () => {
      this.lastFocusedEntry = entry;
      this.checkBraceTrigger(entry);
    });

    input.addEventListener('click', () => {
      this.lastFocusedEntry = entry;
      this.checkBraceTrigger(entry);
    });

    input.addEventListener('keyup', (ev) => {
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(ev.key)) {
        this.checkBraceTrigger(entry);
      }
    });

    input.addEventListener('keydown', (ev) => {
      if (!this.isOpen || this.activeEntry?.input !== input) return;

      if (ev.key === 'ArrowDown') {
        ev.preventDefault();
        if (this.items.length > 0) {
          this.activeIndex = (this.activeIndex + 1) % this.items.length;
          this.renderMenuItems();
        }
      } else if (ev.key === 'ArrowUp') {
        ev.preventDefault();
        if (this.items.length > 0) {
          this.activeIndex = (this.activeIndex - 1 + this.items.length) % this.items.length;
          this.renderMenuItems();
        }
      } else if (ev.key === 'Enter' || ev.key === 'Tab') {
        if (this.items.length > 0) {
          ev.preventDefault();
          const chosen = this.items[this.activeIndex] ?? this.items[0];
          if (chosen) this.acceptVariable(chosen);
        }
      } else if (ev.key === 'Escape') {
        ev.preventDefault();
        ev.stopPropagation();
        this.closeMenu();
      }
    });

    input.addEventListener('blur', () => {
      // Delay slightly so mousedown on menu item runs first
      window.setTimeout(() => {
        if (this.isOpen && this.activeEntry?.input === input && document.activeElement !== input) {
          this.closeMenu();
        }
      }, 120);
    });
  }

  /**
   * Opens (or toggles) the full variable picker directly anchored to a specific input.
   * Triggered when the user clicks the inline `{}` button on a text field.
   */
  togglePickerForInput(
    input: HTMLInputElement,
    fieldLabel: string,
    onValueChange: (val: string) => void
  ): void {
    if (this.isOpen && this.openMode === 'picker' && this.activeEntry?.input === input) {
      this.closeMenu();
      return;
    }

    this.closeReference();
    const entry: ActiveInputEntry = { input, fieldLabel, onValueChange };
    this.lastFocusedEntry = entry;
    this.activeEntry = entry;
    this.openMode = 'picker';

    const cursor = input.selectionStart ?? input.value.length;
    this.activeBraceCtx = findOpenBraceContext(input.value, cursor);
    const query = this.activeBraceCtx?.query ?? '';
    this.items = getAvailableTemplateVariables(this.getBlocks(), query, true);
    this.activeIndex = 0;

    input.focus();
    this.openMenu();
  }

  /**
   * Toggles the Workspace-level `{ } Variables` reference popover.
   */
  toggleReferencePopover(anchorBtn: HTMLElement): void {
    if (this.isRefOpen) {
      this.closeReference();
      return;
    }
    this.closeMenu();
    this.refAnchorBtn = anchorBtn;
    this.isRefOpen = true;
    this.renderReferenceContent();
    this.refEl.hidden = false;
    this.positionReference();
  }

  closeAll(): void {
    this.closeMenu();
    this.closeReference();
  }

  closeMenu(): void {
    this.isOpen = false;
    this.activeEntry = null;
    this.activeBraceCtx = null;
    this.menuEl.hidden = true;
  }

  closeReference(): void {
    this.isRefOpen = false;
    this.refEl.hidden = true;
  }

  private checkBraceTrigger(entry: ActiveInputEntry): void {
    const cursor = entry.input.selectionStart ?? entry.input.value.length;
    const ctx = findOpenBraceContext(entry.input.value, cursor);

    if (!ctx) {
      if (this.isOpen && this.openMode === 'brace' && this.activeEntry?.input === entry.input) {
        this.closeMenu();
      }
      return;
    }

    this.closeReference();
    this.activeEntry = entry;
    this.activeBraceCtx = ctx;
    this.openMode = 'brace';

    // Show ASCII bar tags only if user types "bar" or ":" — keeps `{` menu crisp and focused on live values
    const includeBars =
      ctx.query.toLowerCase().includes('bar') || ctx.query.includes(':');
    this.items = getAvailableTemplateVariables(this.getBlocks(), ctx.query, includeBars);
    this.activeIndex = 0;

    this.openMenu();
  }

  private openMenu(): void {
    this.isOpen = true;
    this.renderMenuItems();
    this.menuEl.hidden = false;
    this.positionMenu();
  }

  private renderMenuItems(): void {
    const headerTitle =
      this.openMode === 'brace'
        ? `Insert Variable${this.activeBraceCtx?.query ? ` — "{${this.escapeHtml(this.activeBraceCtx.query)}"` : ''}`
        : `Insert Live Variable`;

    let bodyHtml = '';
    if (this.items.length === 0) {
      bodyHtml = `<div class="var-ac-empty">No matching ship variables. Create custom ones with a <strong>Set Variable</strong> block.</div>`;
    } else {
      let lastCategory: string | null = null;
      const rows: string[] = [];

      this.items.forEach((v, idx) => {
        if (v.category !== lastCategory) {
          lastCategory = v.category;
          const secTitle =
            v.category === 'telemetry'
              ? 'Built-In Ship Telemetry'
              : v.category === 'custom'
              ? 'Your Script Variables'
              : 'Classic Text Bars';
          rows.push(`<div class="var-ac-section">${secTitle}</div>`);
        }

        const isActive = idx === this.activeIndex;
        const sample = v.unitHint ? `${v.sampleValue} ${v.unitHint}` : v.sampleValue;
        rows.push(`
          <button
            type="button"
            class="var-ac-item ${isActive ? 'is-active' : ''}"
            data-var-idx="${idx}"
            role="option"
            aria-selected="${isActive}"
          >
            <span class="var-ac-left">
              <span class="var-ac-dot" style="background:${v.color}"></span>
              <code class="var-ac-token">${this.escapeHtml(v.token)}</code>
              <span class="var-ac-label">${this.escapeHtml(v.label)}</span>
            </span>
            <span class="var-ac-sample">${this.escapeHtml(sample)}</span>
          </button>
        `);
      });

      bodyHtml = rows.join('');
    }

    this.menuEl.innerHTML = `
      <div class="var-ac-header">
        <span>${headerTitle}</span>
        <span class="var-ac-keys">↑↓ · Enter · Esc</span>
      </div>
      <div class="var-ac-list">${bodyHtml}</div>
    `;

    this.menuEl.querySelectorAll<HTMLButtonElement>('.var-ac-item').forEach((btn) => {
      btn.addEventListener('mousedown', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const idx = Number(btn.dataset.varIdx);
        const item = this.items[idx];
        if (item) this.acceptVariable(item);
      });
      btn.addEventListener('mouseenter', () => {
        const idx = Number(btn.dataset.varIdx);
        if (Number.isFinite(idx) && idx !== this.activeIndex) {
          this.activeIndex = idx;
          this.menuEl.querySelectorAll('.var-ac-item.is-active').forEach((el) => el.classList.remove('is-active'));
          btn.classList.add('is-active');
        }
      });
    });

    const activeEl = this.menuEl.querySelector<HTMLElement>('.var-ac-item.is-active');
    activeEl?.scrollIntoView({ block: 'nearest' });
  }

  private acceptVariable(item: TemplateVariableDef): void {
    const entry = this.activeEntry;
    if (!entry) return;

    const input = entry.input;
    const selStart = input.selectionStart ?? input.value.length;
    const selEnd = input.selectionEnd ?? selStart;

    // Re-check brace context fresh at insertion time
    const freshBrace = findOpenBraceContext(input.value, selStart);
    const { value: nextVal, cursorPos } = applyVariableInsertion(
      input.value,
      selStart,
      selEnd,
      item.token,
      freshBrace
    );

    input.value = nextVal;
    input.focus();
    try {
      input.setSelectionRange(cursorPos, cursorPos);
    } catch {
      // Ignore if input doesn't support selection range
    }

    entry.onValueChange(nextVal);
    this.closeMenu();
  }

  private positionMenu(): void {
    if (!this.activeEntry) return;
    const input = this.activeEntry.input;
    if (!input.isConnected) {
      this.closeMenu();
      return;
    }

    const rect = input.getBoundingClientRect();
    const menuWidth = Math.min(340, Math.max(270, rect.width + 48));
    this.menuEl.style.width = `${menuWidth}px`;

    // Measure actual height after making visible
    const menuHeight = Math.min(336, this.menuEl.offsetHeight || 310);
    const spaceBelow = window.innerHeight - rect.bottom;
    const openAbove = spaceBelow < menuHeight + 12 && rect.top > menuHeight + 12;

    const top = openAbove ? Math.max(8, rect.top - menuHeight - 4) : rect.bottom + 4;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - menuWidth - 8));

    this.menuEl.style.top = `${Math.round(top)}px`;
    this.menuEl.style.left = `${Math.round(left)}px`;
  }

  private renderReferenceContent(): void {
    const customVars = extractCustomVariables(this.getBlocks());
    const hasTargetInput = Boolean(this.lastFocusedEntry && this.lastFocusedEntry.input.isConnected);
    const actionHint = hasTargetInput
      ? `Click a tag to insert into <strong>${this.escapeHtml(this.lastFocusedEntry!.fieldLabel)}</strong>`
      : `Click a tag to copy — or type <code>{</code> inside any text field`;

    const renderChips = (vars: TemplateVariableDef[]) =>
      vars
        .map((v) => {
          const sample = v.unitHint ? `${v.sampleValue} ${v.unitHint}` : v.sampleValue;
          return `
            <button
              type="button"
              class="var-ref-chip"
              data-var-token="${this.escapeHtml(v.token)}"
              title="${this.escapeHtml(v.description)}"
            >
              <div class="var-ref-chip-top">
                <span class="var-ac-dot" style="background:${v.color}"></span>
                <code class="var-ref-token">${this.escapeHtml(v.token)}</code>
                <span class="var-ref-sample">${this.escapeHtml(sample)}</span>
              </div>
              <div class="var-ref-desc">${this.escapeHtml(v.label)} — ${this.escapeHtml(v.description)}</div>
            </button>
          `;
        })
        .join('');

    const customSection =
      customVars.length > 0
        ? `
          <div class="var-ref-section">
            <div class="var-ref-sec-title">Your Script Variables (${customVars.length})</div>
            <div class="var-ref-grid">${renderChips(customVars)}</div>
          </div>
        `
        : `
          <div class="var-ref-section">
            <div class="var-ref-sec-title">Your Script Variables</div>
            <div class="var-ref-empty">Add a <strong>Set Variable</strong> or <strong>Change Variable</strong> block to create custom <code>{name}</code> tags — they appear here automatically.</div>
          </div>
        `;

    this.refEl.innerHTML = `
      <div class="var-ref-header">
        <div>
          <div class="var-ref-title">Live Ship Variables</div>
          <div class="var-ref-sub">${actionHint}</div>
        </div>
        <button type="button" class="var-ref-close" id="var-ref-close-btn" aria-label="Close">×</button>
      </div>
      <div class="var-ref-body">
        <div class="var-ref-tip">
          <strong>Pro tip:</strong> Type <code>{</code> inside any GUI or LCD text box (or click its <code>{}</code> icon) for instant autocomplete.
        </div>
        <div class="var-ref-section">
          <div class="var-ref-sec-title">Built-In Ship Telemetry (${BUILTIN_GLOBAL_VARIABLES.length})</div>
          <div class="var-ref-grid">${renderChips(BUILTIN_GLOBAL_VARIABLES)}</div>
        </div>
        ${customSection}
        <div class="var-ref-section">
          <div class="var-ref-sec-title">Classic Text LCD Bars</div>
          <div class="var-ref-bars">
            ${ASCII_BAR_VARIABLES.map(
              (v) => `
              <button type="button" class="var-ref-mini-chip" data-var-token="${this.escapeHtml(v.token)}" title="${this.escapeHtml(v.description)}">
                <code>${this.escapeHtml(v.token)}</code>
              </button>
            `
            ).join('')}
          </div>
        </div>
      </div>
    `;

    this.refEl.querySelector('#var-ref-close-btn')?.addEventListener('click', () => {
      this.closeReference();
    });

    this.refEl.querySelectorAll<HTMLButtonElement>('[data-var-token]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const token = btn.dataset.varToken;
        if (!token) return;
        this.insertOrCopyToken(token);
      });
    });
  }

  private insertOrCopyToken(token: string): void {
    const entry = this.lastFocusedEntry;
    if (entry && entry.input.isConnected) {
      const input = entry.input;
      const selStart = input.selectionStart ?? input.value.length;
      const selEnd = input.selectionEnd ?? selStart;
      const freshBrace = findOpenBraceContext(input.value, selStart);
      const { value: nextVal, cursorPos } = applyVariableInsertion(
        input.value,
        selStart,
        selEnd,
        token,
        freshBrace
      );
      input.value = nextVal;
      input.focus();
      try {
        input.setSelectionRange(cursorPos, cursorPos);
      } catch {
        // Ignore
      }
      entry.onValueChange(nextVal);
      this.closeReference();
      this.onToast?.(`Inserted ${token} into ${entry.fieldLabel}`);
      return;
    }

    this.copyTokenToClipboard(token);
    this.onToast?.(`Copied ${token} — paste into any text field or type { to autocomplete`);
  }

  private copyTokenToClipboard(text: string): void {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => this.fallbackCopy(text));
    } else {
      this.fallbackCopy(text);
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

  private positionReference(): void {
    if (!this.refAnchorBtn || !this.refAnchorBtn.isConnected) {
      this.closeReference();
      return;
    }
    const rect = this.refAnchorBtn.getBoundingClientRect();
    const popW = Math.min(440, window.innerWidth - 16);
    this.refEl.style.width = `${popW}px`;
    const preferredLeft =
      rect.left + popW <= window.innerWidth - 8 ? rect.left : rect.right - popW;
    const left = Math.max(8, Math.min(preferredLeft, window.innerWidth - popW - 8));
    const top = Math.min(rect.bottom + 8, window.innerHeight - 240);
    this.refEl.style.top = `${Math.round(Math.max(8, top))}px`;
    this.refEl.style.left = `${Math.round(left)}px`;
  }

  private escapeHtml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
