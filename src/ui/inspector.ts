import { renderHighlightedCSharp } from '../codegen/highlight';
import { createDefaultSimInputs, ShipSimulatorSession } from '../simulator/engine';
import type {
  GeneratedScriptResult,
  ScriptProject,
  SimExecutionResult,
  SimShipInputs,
} from '../types';
import { renderGuiScreenToCanvas, type LcdAspectMode } from './guiCanvasRenderer';
import { ICONS } from './icons';

export type InspectorTab = 'code' | 'simulator' | 'setup';

export interface InspectorOptions {
  container: HTMLElement;
  onCopyCode: () => void;
  onDownloadCs: () => void;
  onJumpToBlock: (blockId: string) => void;
  onToast: (msg: string) => void;
}

export class InspectorView {
  private container: HTMLElement;
  private onCopyCode: () => void;
  private onDownloadCs: () => void;
  private onJumpToBlock: (blockId: string) => void;
  private onToast: (msg: string) => void;

  private activeTab: InspectorTab = 'simulator';
  private project!: ScriptProject;
  private generated!: GeneratedScriptResult;

  private simSession = new ShipSimulatorSession();
  private simInputs: SimShipInputs = createDefaultSimInputs();
  private simResult: SimExecutionResult | null = null;
  private activeLcdName: string | null = null;
  private lcdAspect: LcdAspectMode = 'square';

  private tabBarEl!: HTMLElement;
  private bodyEl!: HTMLElement;

  // Sub-elements inside simulator tab so dragging sliders never destroys slider DOM
  private simMounted = false;
  private simOutputEl: HTMLElement | null = null;
  private simArgsEl: HTMLElement | null = null;

  constructor(opts: InspectorOptions) {
    this.container = opts.container;
    this.onCopyCode = opts.onCopyCode;
    this.onDownloadCs = opts.onDownloadCs;
    this.onJumpToBlock = opts.onJumpToBlock;
    this.onToast = opts.onToast;
    this.mount();
  }

  private mount(): void {
    this.container.innerHTML = `
      <div class="inspector-tabs" id="inspector-tabs" role="tablist" aria-label="Output views"></div>
      <div class="inspector-body" id="inspector-body"></div>
    `;
    this.tabBarEl = this.container.querySelector('#inspector-tabs') as HTMLElement;
    this.bodyEl = this.container.querySelector('#inspector-body') as HTMLElement;
  }

  setTab(tab: InspectorTab): void {
    if (this.activeTab === tab) return;
    this.activeTab = tab;
    this.simMounted = false;
    this.renderTabs();
    this.renderBody();
  }

  resetSimulation(): void {
    this.simSession.reset();
    if (this.project) {
      this.simResult = this.simSession.step(this.project, this.simInputs, '');
    }
    if (this.activeTab === 'simulator') {
      this.renderSimOutput();
    }
  }

  update(project: ScriptProject, generated: GeneratedScriptResult, resetSim = false): void {
    this.project = project;
    this.generated = generated;
    if (resetSim) {
      this.simSession.reset();
    }
    this.simResult = this.simSession.step(project, this.simInputs, '');
    this.renderTabs();
    if (this.activeTab === 'simulator' && this.simMounted) {
      this.renderSimArguments();
      this.renderSimOutput();
    } else {
      this.renderBody();
    }
  }

  private renderTabs(): void {
    const reqCount = this.generated?.requiredBlocks.length ?? 0;
    const errCount = this.generated?.issues.filter((i) => i.severity === 'error').length ?? 0;
    const warnCount = this.generated?.issues.filter((i) => i.severity === 'warning').length ?? 0;

    const codeBadge =
      errCount > 0
        ? `<span class="tab-badge danger">${errCount}</span>`
        : warnCount > 0
        ? `<span class="tab-badge warn">${warnCount}</span>`
        : `<span class="tab-badge ok">OK</span>`;

    this.tabBarEl.innerHTML = `
      <button type="button" id="tab-code" class="inspector-tab ${this.activeTab === 'code' ? 'active' : ''}" role="tab" aria-selected="${this.activeTab === 'code'}">
        ${ICONS.code}
        <span>C# Script</span>
        ${codeBadge}
      </button>
      <button type="button" id="tab-simulator" class="inspector-tab ${this.activeTab === 'simulator' ? 'active' : ''}" role="tab" aria-selected="${this.activeTab === 'simulator'}">
        ${ICONS.sim}
        <span>Ship Simulator</span>
      </button>
      <button type="button" id="tab-setup" class="inspector-tab ${this.activeTab === 'setup' ? 'active' : ''}" role="tab" aria-selected="${this.activeTab === 'setup'}">
        ${ICONS.checklist}
        <span>Ship Setup</span>
        <span class="tab-badge neutral">${reqCount}</span>
      </button>
    `;

    this.tabBarEl.querySelector('#tab-code')?.addEventListener('click', () => this.setTab('code'));
    this.tabBarEl.querySelector('#tab-simulator')?.addEventListener('click', () => this.setTab('simulator'));
    this.tabBarEl.querySelector('#tab-setup')?.addEventListener('click', () => this.setTab('setup'));
  }

  private renderBody(): void {
    if (!this.generated || !this.project) return;
    if (this.activeTab === 'code') {
      this.simMounted = false;
      this.renderCodeTab();
    } else if (this.activeTab === 'simulator') {
      this.mountSimulatorTab();
    } else {
      this.simMounted = false;
      this.renderSetupTab();
    }
  }

  private renderCodeTab(): void {
    const g = this.generated;
    const pct = Math.min(100, (g.charCount / g.charLimit) * 100);
    const hasErrors = g.issues.some((i) => i.severity === 'error');

    const issuesHtml =
      g.issues.length > 0
        ? `<div class="code-issues">
            ${g.issues
              .map(
                (iss) => `
              <div class="issue-row ${iss.severity}">
                <span class="issue-tag">${iss.severity.toUpperCase()}</span>
                <span class="issue-msg">${this.escapeHtml(iss.message)}</span>
                ${
                  iss.blockId
                    ? `<button type="button" class="issue-jump" data-jump="${this.escapeHtml(iss.blockId)}">Locate</button>`
                    : ''
                }
              </div>
            `
              )
              .join('')}
          </div>`
        : '';

    this.bodyEl.innerHTML = `
      <div class="code-toolbar">
        <div class="code-stats">
          <span class="status-pill ${hasErrors ? 'danger' : 'ok'}">
            ${hasErrors ? 'Check Issues' : 'SE C# 6.0 Ready'}
          </span>
          <span class="char-meter" title="Space Engineers Programmable Block character limit is 100,000">
            ${g.charCount.toLocaleString()} / ${g.charLimit.toLocaleString()} chars (${g.lineCount} lines)
          </span>
        </div>
        <div class="code-actions">
          <button type="button" class="btn btn-sm btn-secondary" id="code-download-btn" title="Download .cs file">
            ${ICONS.download} <span>.cs</span>
          </button>
          <button type="button" class="btn btn-sm btn-primary" id="code-copy-btn">
            ${ICONS.copy} <span>Copy</span>
          </button>
        </div>
      </div>
      <div class="char-bar-track"><div class="char-bar-fill" style="width:${pct.toFixed(1)}%"></div></div>
      ${issuesHtml}
      <div class="code-viewer" id="csharp-code-viewer" tabindex="0" aria-label="Generated Space Engineers C# Code">
        ${renderHighlightedCSharp(g.code)}
      </div>
    `;

    this.bodyEl.querySelector('#code-copy-btn')?.addEventListener('click', () => this.onCopyCode());
    this.bodyEl.querySelector('#code-download-btn')?.addEventListener('click', () => this.onDownloadCs());
    this.bodyEl.querySelectorAll<HTMLButtonElement>('[data-jump]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.jump) this.onJumpToBlock(btn.dataset.jump);
      });
    });
  }

  private mountSimulatorTab(): void {
    this.simMounted = true;
    this.bodyEl.innerHTML = `
      <div class="sim-layout">
        <div class="sim-output-section" id="sim-output-section"></div>
        <div class="sim-controls-section">
          <div class="sim-section-hdr">
            <span>Virtual Ship Sensors</span>
            <button type="button" class="btn btn-xs btn-secondary" id="sim-reset-btn" title="Reset simulator state & variables">
              ${ICONS.reset} Reset
            </button>
          </div>
          <div class="sim-args-bar" id="sim-args-bar"></div>
          <div class="sim-sliders">
            ${this.sliderRow('batteryPct', 'Battery Charge', this.simInputs.batteryPct, 0, 100, 1, '%')}
            ${this.sliderRow('h2Pct', 'Hydrogen Tanks', this.simInputs.h2Pct, 0, 100, 1, '%')}
            ${this.sliderRow('o2Pct', 'Oxygen Tanks', this.simInputs.o2Pct, 0, 100, 1, '%')}
            ${this.sliderRow('cargoPct', 'Cargo Fill', this.simInputs.cargoPct, 0, 100, 1, '%')}
            ${this.sliderRow('ventO2Pct', 'Air Vent O2', this.simInputs.ventO2Pct, 0, 100, 1, '%')}
            ${this.sliderRow('shipSpeed', 'Ship Speed', this.simInputs.shipSpeed, 0, 100, 1, ' m/s')}
          </div>
          <div class="sim-toggles">
            <label class="sim-select-row">
              <span>Connector</span>
              <select id="sim-connector-select" class="se-input se-select">
                <option value="Unconnected" ${this.simInputs.connectorStatus === 'Unconnected' ? 'selected' : ''}>Unconnected</option>
                <option value="Connectable" ${this.simInputs.connectorStatus === 'Connectable' ? 'selected' : ''}>Ready to Lock</option>
                <option value="Connected" ${this.simInputs.connectorStatus === 'Connected' ? 'selected' : ''}>Connected</option>
              </select>
            </label>
            <div class="sim-switch-grid">
              <label class="ui-switch">
                <input type="checkbox" id="sim-turret-chk" ${this.simInputs.turretHasTarget ? 'checked' : ''} />
                <span class="ui-switch-track"></span>
                <span>Turret Target</span>
              </label>
              <label class="ui-switch">
                <input type="checkbox" id="sim-sensor-chk" ${this.simInputs.sensorActive ? 'checked' : ''} />
                <span class="ui-switch-track"></span>
                <span>Sensor Active</span>
              </label>
              <label class="ui-switch">
                <input type="checkbox" id="sim-door-chk" ${this.simInputs.doorOpen ? 'checked' : ''} />
                <span class="ui-switch-track"></span>
                <span>Door Open</span>
              </label>
            </div>
          </div>
          <label class="sim-cdata-row">
            <span>PB CustomData (INI)</span>
            <textarea id="sim-pb-cdata" class="sim-cdata-input" rows="2" spellcheck="false">${this.escapeHtml(this.simInputs.pbCustomData ?? 'minBatt=25\nminO2=65\n')}</textarea>
          </label>
        </div>
      </div>
    `;

    this.simOutputEl = this.bodyEl.querySelector('#sim-output-section');
    this.simArgsEl = this.bodyEl.querySelector('#sim-args-bar');

    const cdataEl = this.bodyEl.querySelector('#sim-pb-cdata') as HTMLTextAreaElement | null;
    cdataEl?.addEventListener('input', () => {
      this.simInputs.pbCustomData = cdataEl.value;
      this.simResult = this.simSession.step(this.project, this.simInputs, '');
      this.renderSimOutput();
    });

    this.bodyEl.querySelector('#sim-reset-btn')?.addEventListener('click', () => {
      this.simInputs = createDefaultSimInputs();
      this.simSession.reset();
      this.simResult = this.simSession.step(this.project, this.simInputs, '');
      this.simMounted = false;
      this.mountSimulatorTab();
    });

    const sliderKeys: Array<keyof Pick<SimShipInputs, 'batteryPct' | 'h2Pct' | 'o2Pct' | 'cargoPct' | 'ventO2Pct' | 'shipSpeed'>> = [
      'batteryPct',
      'h2Pct',
      'o2Pct',
      'cargoPct',
      'ventO2Pct',
      'shipSpeed',
    ];
    for (const key of sliderKeys) {
      const slider = this.bodyEl.querySelector(`#sim-slider-${key}`) as HTMLInputElement | null;
      const readout = this.bodyEl.querySelector(`#sim-val-${key}`) as HTMLElement | null;
      if (slider) {
        slider.addEventListener('input', () => {
          const val = parseFloat(slider.value);
          this.simInputs[key] = val;
          if (readout) readout.textContent = `${val}${slider.dataset.unit || ''}`;
          this.simResult = this.simSession.step(this.project, this.simInputs, '');
          this.renderSimOutput();
        });
      }
    }

    const connSel = this.bodyEl.querySelector('#sim-connector-select') as HTMLSelectElement | null;
    connSel?.addEventListener('change', () => {
      this.simInputs.connectorStatus = connSel.value as SimShipInputs['connectorStatus'];
      this.simResult = this.simSession.step(this.project, this.simInputs, '');
      this.renderSimOutput();
    });

    const bindChk = (id: string, prop: 'turretHasTarget' | 'sensorActive' | 'doorOpen') => {
      const el = this.bodyEl.querySelector(id) as HTMLInputElement | null;
      el?.addEventListener('change', () => {
        this.simInputs[prop] = el.checked;
        this.simResult = this.simSession.step(this.project, this.simInputs, '');
        this.renderSimOutput();
      });
    };
    bindChk('#sim-turret-chk', 'turretHasTarget');
    bindChk('#sim-sensor-chk', 'sensorActive');
    bindChk('#sim-door-chk', 'doorOpen');

    this.renderSimArguments();
    this.renderSimOutput();
  }

  private sliderRow(
    key: string,
    label: string,
    val: number,
    min: number,
    max: number,
    step: number,
    unit: string
  ): string {
    return `
      <div class="sim-slider-row">
        <div class="sim-slider-top">
          <label for="sim-slider-${key}">${label}</label>
          <span class="sim-slider-val" id="sim-val-${key}">${val}${unit}</span>
        </div>
        <input
          type="range"
          id="sim-slider-${key}"
          class="sim-range"
          min="${min}"
          max="${max}"
          step="${step}"
          value="${val}"
          data-unit="${unit}"
        />
      </div>
    `;
  }

  private renderSimArguments(): void {
    if (!this.simArgsEl) return;
    const args = this.generated.detectedArguments;
    if (args.length === 0) {
      this.simArgsEl.innerHTML = '';
      this.simArgsEl.style.display = 'none';
      return;
    }
    this.simArgsEl.style.display = 'flex';
    this.simArgsEl.innerHTML = `
      <span class="sim-args-label">Trigger Argument:</span>
      ${args
        .map(
          (a) =>
            `<button type="button" class="btn btn-xs btn-amber-outline sim-arg-btn" data-arg="${this.escapeHtml(a)}">${ICONS.play} "${this.escapeHtml(a)}"</button>`
        )
        .join('')}
    `;
    this.simArgsEl.querySelectorAll<HTMLButtonElement>('.sim-arg-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const arg = btn.dataset.arg || '';
        this.simResult = this.simSession.step(this.project, this.simInputs, arg);
        this.renderSimOutput();
        this.onToast(`Triggered script with argument "${arg}"`);
      });
    });
  }

  private renderSimOutput(): void {
    if (!this.simOutputEl || !this.simResult) return;
    const res = this.simResult;
    const lcdNames = Object.keys(res.lcds);
    if (lcdNames.length > 0 && (!this.activeLcdName || !res.lcds[this.activeLcdName])) {
      this.activeLcdName = lcdNames[0];
    }

    const activeLcd = this.activeLcdName ? res.lcds[this.activeLcdName] : null;
    const blockList = Object.values(res.blocks);
    const varEntries = Object.entries(res.variables);

    const lcdHtml = activeLcd
      ? activeLcd.mode === 'gui'
        ? `
        <div class="sim-lcd-bezel">
          <div class="sim-lcd-bar">
            <span class="sim-lcd-tag">VECTOR GUI HUD</span>
            <div class="sim-lcd-bar-right">
              <div class="sim-aspect-pills" role="group" aria-label="LCD shape">
                <button type="button" class="sim-aspect-btn ${this.lcdAspect === 'square' ? 'active' : ''}" data-aspect="square" title="Standard 1:1 LCD">1:1</button>
                <button type="button" class="sim-aspect-btn ${this.lcdAspect === 'wide' ? 'active' : ''}" data-aspect="wide" title="Wide 2:1 LCD">Wide</button>
                <button type="button" class="sim-aspect-btn ${this.lcdAspect === 'cockpit' ? 'active' : ''}" data-aspect="cockpit" title="Cockpit Screen">Cockpit</button>
              </div>
              ${
                lcdNames.length > 1
                  ? `<select id="sim-lcd-picker" class="sim-lcd-select">
                      ${lcdNames
                        .map(
                          (n) =>
                            `<option value="${this.escapeHtml(n)}" ${n === activeLcd.name ? 'selected' : ''}>${this.escapeHtml(n)}</option>`
                        )
                        .join('')}
                    </select>`
                  : `<span class="sim-lcd-name">${this.escapeHtml(activeLcd.name)}</span>`
              }
            </div>
          </div>
          <div class="sim-gui-stage">
            <canvas id="sim-gui-canvas" class="sim-gui-canvas aspect-${this.lcdAspect}"></canvas>
          </div>
        </div>
      `
        : `
        <div class="sim-lcd-bezel">
          <div class="sim-lcd-bar">
            <span class="sim-lcd-tag">TEXT LCD PREVIEW</span>
            ${
              lcdNames.length > 1
                ? `<select id="sim-lcd-picker" class="sim-lcd-select">
                    ${lcdNames
                      .map(
                        (n) =>
                          `<option value="${this.escapeHtml(n)}" ${n === activeLcd.name ? 'selected' : ''}>${this.escapeHtml(n)}</option>`
                      )
                      .join('')}
                  </select>`
                : `<span class="sim-lcd-name">${this.escapeHtml(activeLcd.name)}</span>`
            }
          </div>
          <pre
            class="sim-lcd-screen"
            style="
              color: ${this.escapeHtml(activeLcd.fontColor)};
              background-color: ${this.escapeHtml(activeLcd.bgColor)};
              text-align: ${activeLcd.alignment.toLowerCase()};
              font-family: ${activeLcd.font === 'Monospace' ? 'var(--font-mono)' : 'var(--font-sans)'};
              font-size: ${Math.max(10.5, Math.min(16, activeLcd.fontSize * 12.5))}px;
            "
          >${this.escapeHtml(activeLcd.text || '(LCD screen is blank)')}</pre>
        </div>
      `
      : `
        <div class="sim-lcd-empty">
          No LCD blocks in script yet — add a <strong>GUI Screen Canvas</strong> or <strong>Text LCD</strong> block to preview your screen live.
        </div>
      `;

    const blocksHtml =
      blockList.length > 0
        ? `
          <div class="sim-block-grid">
            ${blockList
              .map(
                (b) => `
              <div class="sim-block-chip accent-${b.accent}">
                <div class="sim-chip-top">
                  <span class="sim-chip-kind">${this.escapeHtml(b.kind)}</span>
                  ${
                    b.color
                      ? `<span class="sim-light-dot ${b.blinking ? 'is-blinking' : ''}" style="background:${this.escapeHtml(b.color)}"></span>`
                      : ''
                  }
                </div>
                <div class="sim-chip-name">${this.escapeHtml(b.name)}</div>
                <div class="sim-chip-state">${this.escapeHtml(b.state)}</div>
              </div>
            `
              )
              .join('')}
          </div>
        `
        : '';

    const varsHtml =
      varEntries.length > 0
        ? `
          <div class="sim-vars-strip">
            <span class="sim-mini-label">Variables:</span>
            ${varEntries
              .map(
                ([k, v]) =>
                  `<span class="sim-var-pill"><strong>${this.escapeHtml(k)}</strong> = ${this.escapeHtml(String(v))}</span>`
              )
              .join('')}
          </div>
        `
        : '';

    const echoHtml =
      res.echoLog.length > 0
        ? `
          <div class="sim-echo-box">
            <div class="sim-mini-label">PB Console (Echo)</div>
            ${res.echoLog.map((l) => `<div class="sim-echo-line">&gt; ${this.escapeHtml(l)}</div>`).join('')}
          </div>
        `
        : '';

    this.simOutputEl.innerHTML = `${lcdHtml}${blocksHtml}${varsHtml}${echoHtml}`;

    if (activeLcd && activeLcd.mode === 'gui') {
      const canvas = this.simOutputEl.querySelector('#sim-gui-canvas') as HTMLCanvasElement | null;
      if (canvas) {
        renderGuiScreenToCanvas(canvas, activeLcd, this.lcdAspect);
      }
      this.simOutputEl.querySelectorAll<HTMLButtonElement>('.sim-aspect-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const next = btn.dataset.aspect as LcdAspectMode;
          if (next) {
            this.lcdAspect = next;
            this.renderSimOutput();
          }
        });
      });
    }

    const picker = this.simOutputEl.querySelector('#sim-lcd-picker') as HTMLSelectElement | null;
    picker?.addEventListener('change', () => {
      this.activeLcdName = picker.value;
      this.renderSimOutput();
    });
  }

  private renderSetupTab(): void {
    const reqs = this.generated.requiredBlocks;
    const args = this.generated.detectedArguments;

    const reqRows =
      reqs.length > 0
        ? reqs
            .map(
              (r) => `
          <div class="setup-row">
            <div class="setup-row-main">
              <div class="setup-name-line">
                <code class="setup-block-name">${this.escapeHtml(r.name)}</code>
                <span class="setup-mode-pill">${this.escapeHtml(r.matchMode)}</span>
              </div>
              <div class="setup-row-meta">${this.escapeHtml(r.blockType)} — ${this.escapeHtml(r.purpose)}</div>
            </div>
            ${
              r.matchMode !== 'All on Ship'
                ? `<button type="button" class="btn btn-xs btn-secondary copy-name-btn" data-copy-name="${this.escapeHtml(r.name)}" title="Copy exact block name">
                    ${ICONS.copy}
                  </button>`
                : ''
            }
          </div>
        `
            )
            .join('')
        : `<div class="setup-empty">Add blocks to your script to automatically generate your ship block checklist.</div>`;

    const argsSection =
      args.length > 0
        ? `
          <div class="setup-card">
            <h3 class="setup-heading">Button / Cockpit Toolbar Arguments</h3>
            <p class="setup-note">
              Bind a Button Panel or Cockpit hotbar slot to your Programmable Block → <strong>Run</strong>, and enter one of these arguments:
            </p>
            <div class="setup-arg-chips">
              ${args
                .map(
                  (a) => `
                <button type="button" class="setup-arg-chip copy-name-btn" data-copy-name="${this.escapeHtml(a)}" title="Click to copy argument">
                  <code>${this.escapeHtml(a)}</code> ${ICONS.copy}
                </button>
              `
                )
                .join('')}
            </div>
          </div>
        `
        : '';

    this.bodyEl.innerHTML = `
      <div class="setup-scroll">
        <div class="setup-card">
          <h3 class="setup-heading">Required Blocks on Your Ship (${reqs.length})</h3>
          <p class="setup-note">
            Make sure these blocks or block groups exist in your ship's Terminal (<strong>K</strong>) with matching names:
          </p>
          <div class="setup-list">${reqRows}</div>
        </div>
        ${argsSection}
        <div class="setup-card">
          <h3 class="setup-heading">How to Install in Space Engineers</h3>
          <ol class="setup-steps">
            <li>Enable <strong>In-Game Scripts</strong> in your World Settings → Advanced (Experimental Mode ON).</li>
            <li>Build a <strong>Programmable Block</strong> on your ship or station and ensure ownership matches your blocks.</li>
            <li>Open the ship Terminal (<strong>K</strong>), select the Programmable Block, and click <strong>Edit</strong>.</li>
            <li>Click <strong>Copy C#</strong> above, clear the editor (<code>Ctrl+A</code>), and paste (<code>Ctrl+V</code>).</li>
            <li>Click <strong>Check Code</strong> (should say <em>Compilation successful</em>), then click <strong>OK</strong>. Your script starts automatically!</li>
          </ol>
        </div>
      </div>
    `;

    this.bodyEl.querySelectorAll<HTMLButtonElement>('.copy-name-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const text = btn.dataset.copyName || '';
        navigator.clipboard?.writeText(text).catch(() => {});
        this.onToast(`Copied "${text}"`);
      });
    });
  }

  private escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}
