import { BOOLEAN_CONDITION_SOURCES } from '../blocks/catalog';
import type {
  ConditionSource,
  ScriptBlock,
  ScriptProject,
  SimBlockStatus,
  SimExecutionResult,
  SimGuiOp,
  SimInventoryItem,
  SimLcdScreen,
  SimShipInputs,
} from '../types';

export function createDefaultSimInputs(): SimShipInputs {
  return {
    batteryPct: 74,
    h2Pct: 68,
    o2Pct: 86,
    cargoPct: 54,
    ventO2Pct: 100,
    shipSpeed: 12.4,
    gravityG: 0.0,
    solarMw: 2.4,
    reactorMw: 0.0,
    projectorRemaining: 42,
    doorOpen: false,
    connectorStatus: 'Unconnected',
    sensorActive: false,
    turretHasTarget: false,
    inventory: [
      { category: 'Ore', subtype: 'Iron', displayName: 'Iron (Ore)', amount: 48200 },
      { category: 'Ore', subtype: 'Ice', displayName: 'Ice (Ore)', amount: 31500 },
      { category: 'Ore', subtype: 'Cobalt', displayName: 'Cobalt (Ore)', amount: 12400 },
      { category: 'Ingot', subtype: 'Iron', displayName: 'Iron (Ingot)', amount: 64800 },
      { category: 'Ingot', subtype: 'Nickel', displayName: 'Nickel (Ingot)', amount: 8950 },
      { category: 'Ingot', subtype: 'Silicon', displayName: 'Silicon (Ingot)', amount: 7300 },
      { category: 'Ingot', subtype: 'Uranium', displayName: 'Uranium (Ingot)', amount: 145 },
      { category: 'Ingot', subtype: 'Platinum', displayName: 'Platinum (Ingot)', amount: 320 },
      { category: 'Component', subtype: 'SteelPlate', displayName: 'SteelPlate', amount: 4280 },
      { category: 'Component', subtype: 'Construction', displayName: 'Construction', amount: 1640 },
      { category: 'Component', subtype: 'InteriorPlate', displayName: 'InteriorPlate', amount: 1250 },
      { category: 'Component', subtype: 'Motor', displayName: 'Motor', amount: 610 },
      { category: 'Component', subtype: 'Computer', displayName: 'Computer', amount: 480 },
      { category: 'Component', subtype: 'PowerCell', displayName: 'PowerCell', amount: 185 },
      { category: 'Ammo', subtype: 'NATO_25x184mm', displayName: 'NATO_25x184mm', amount: 96 },
      { category: 'Ammo', subtype: 'Missile200mm', displayName: 'Missile200mm', amount: 24 },
    ],
  };
}

export function buildAsciiBar(percent: number, width: number): string {
  const clamped = Math.max(0, Math.min(100, percent));
  const filled = Math.round((clamped / 100) * width);
  return `[${'#'.repeat(filled)}${'-'.repeat(width - filled)}]`;
}

export function formatSimAmount(amount: number): string {
  if (amount >= 1000000) return `${(amount / 1000000).toFixed(2)}M`;
  if (amount >= 1000) return `${(amount / 1000).toFixed(1)}k`;
  if (Math.abs(amount - Math.round(amount)) < 0.05) return String(Math.round(amount));
  return amount.toFixed(1);
}

export function computeGuiAutoColor(pct: number, mode: string, customColor: string): string {
  if (mode === 'custom') return customColor || '#38A3D1';
  if (mode === 'auto_high_bad') {
    if (pct >= 90) return '#EF4444';
    if (pct >= 70) return '#F59E0B';
    return '#38D9A9';
  }
  if (pct < 20) return '#EF4444';
  if (pct < 45) return '#F59E0B';
  return '#22C55E';
}

export class ShipSimulatorSession {
  private numVars: Record<string, number> = {};
  private strVars: Record<string, string> = {};
  private timers: Record<string, number> = {};
  private lcds: Record<string, SimLcdScreen> = {};
  private blocks: Record<string, SimBlockStatus> = {};
  private enabledBlocks: Record<string, boolean> = {};
  private activeGuiOps: SimGuiOp[] | null = null;
  private initialized = false;
  private ticksRun = 0;

  reset(): void {
    this.numVars = {};
    this.strVars = {};
    this.timers = {};
    this.lcds = {};
    this.blocks = {};
    this.enabledBlocks = {};
    this.activeGuiOps = null;
    this.initialized = false;
    this.ticksRun = 0;
  }

  step(
    project: ScriptProject,
    inputs: SimShipInputs,
    argument = '',
    deltaSeconds = 1.66
  ): SimExecutionResult {
    const echoLog: string[] = [];

    if (!this.initialized) {
      this.initialized = true;
      for (const b of project.blocks) {
        if (!b.disabled && b.type === 'on_setup') {
          this.execList(b.children ?? [], inputs, '', 0, echoLog);
        }
      }
    }

    this.ticksRun += 1;
    this.activeGuiOps = null;
    this.execList(project.blocks, inputs, argument, deltaSeconds, echoLog);

    const variables: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(this.strVars)) {
      variables[k] = v;
    }
    for (const [k, v] of Object.entries(this.numVars)) {
      variables[k] = Number(v.toFixed(2));
    }

    return {
      lcds: JSON.parse(JSON.stringify(this.lcds)),
      blocks: JSON.parse(JSON.stringify(this.blocks)),
      variables,
      echoLog,
      ticksRun: this.ticksRun,
    };
  }

  private getOrCreateLcd(name: string): SimLcdScreen {
    const key = name.trim() || 'LCD Panel';
    if (!this.lcds[key]) {
      this.lcds[key] = {
        name: key,
        mode: 'text',
        text: '',
        fontSize: 1.0,
        font: 'Monospace',
        fontColor: '#38D9A9',
        bgColor: '#0A1118',
        alignment: 'LEFT',
      };
    }
    return this.lcds[key];
  }

  private evalPercentSource(source: string, target: string, inputs: SimShipInputs): number {
    switch (source) {
      case 'battery_pct':
        return inputs.batteryPct;
      case 'h2_pct':
        return inputs.h2Pct;
      case 'o2_pct':
        return inputs.o2Pct;
      case 'cargo_pct':
        return inputs.cargoPct;
      case 'vent_o2_pct':
        return inputs.ventO2Pct;
      case 'ship_speed':
        return Math.min(100, inputs.shipSpeed);
      case 'variable': {
        const vn = target.trim() || 'val';
        return this.numVars[vn] ?? 0;
      }
      default:
        return 0;
    }
  }

  private formatTemplate(raw: string, inputs: SimShipInputs): string {
    let out = String(raw ?? '');
    out = out.replaceAll('{battery}', inputs.batteryPct.toFixed(1).replace(/\.0$/, ''));
    out = out.replaceAll('{bar:battery}', buildAsciiBar(inputs.batteryPct, 12));
    out = out.replaceAll('{h2}', inputs.h2Pct.toFixed(1).replace(/\.0$/, ''));
    out = out.replaceAll('{bar:h2}', buildAsciiBar(inputs.h2Pct, 12));
    out = out.replaceAll('{o2}', inputs.o2Pct.toFixed(1).replace(/\.0$/, ''));
    out = out.replaceAll('{bar:o2}', buildAsciiBar(inputs.o2Pct, 12));
    out = out.replaceAll('{cargo}', inputs.cargoPct.toFixed(1).replace(/\.0$/, ''));
    out = out.replaceAll('{bar:cargo}', buildAsciiBar(inputs.cargoPct, 12));
    out = out.replaceAll('{speed}', inputs.shipSpeed.toFixed(1));
    out = out.replaceAll('{gravity}', inputs.gravityG.toFixed(2));
    out = out.replaceAll('{solar}', inputs.solarMw.toFixed(2));
    out = out.replaceAll('{reactor}', inputs.reactorMw.toFixed(2));

    for (const [k, v] of Object.entries(this.strVars)) {
      out = out.replaceAll(`{${k}}`, v);
      const num = this.numVars[k] ?? Number(v);
      if (Number.isFinite(num)) {
        out = out.replaceAll(`{bar:${k}}`, buildAsciiBar(num, 12));
      }
    }
    return out;
  }

  private getItemCount(inputs: SimShipInputs, typeId: string, subtype: string): number {
    const catLower = typeId.toLowerCase();
    const subLower = subtype.trim().toLowerCase();
    return inputs.inventory
      .filter((item) => {
        const catMatch =
          (catLower.includes('ore') && item.category === 'Ore') ||
          (catLower.includes('ingot') && item.category === 'Ingot') ||
          (catLower.includes('component') && item.category === 'Component') ||
          (catLower.includes('ammo') && item.category === 'Ammo');
        return catMatch && item.subtype.toLowerCase() === subLower;
      })
      .reduce((acc, item) => acc + item.amount, 0);
  }

  private evalCondition(block: ScriptBlock, inputs: SimShipInputs, argument: string): boolean {
    const source = String(block.params.source ?? 'battery_pct') as ConditionSource;
    const rawVal = String(block.params.value ?? '0');
    const op = String(block.params.operator ?? '<');
    const boolExpect = String(block.params.boolExpect ?? 'true') === 'true';
    const target = String(block.params.target ?? '').trim();

    if (source === 'argument_equals') {
      return argument.trim().toLowerCase() === rawVal.trim().toLowerCase();
    }

    if (BOOLEAN_CONDITION_SOURCES.includes(source)) {
      let actual = false;
      switch (source) {
        case 'door_is_open':
          actual = inputs.doorOpen;
          break;
        case 'connector_connected':
          actual = inputs.connectorStatus === 'Connected';
          break;
        case 'connector_ready':
          actual = inputs.connectorStatus === 'Connectable';
          break;
        case 'sensor_active':
          actual = inputs.sensorActive;
          break;
        case 'turret_has_target':
          actual = inputs.turretHasTarget;
          break;
        case 'block_enabled':
          actual = Boolean(this.enabledBlocks[target.toLowerCase()]);
          break;
      }
      return boolExpect ? actual : !actual;
    }

    if (source === 'variable') {
      const vn = String(block.params.varName ?? 'state').trim() || 'state';
      if (Number.isNaN(Number(rawVal)) && (op === '==' || op === '!=')) {
        const eq = (this.strVars[vn] ?? '').toLowerCase() === rawVal.toLowerCase();
        return op === '==' ? eq : !eq;
      }
    }

    let lhs = 0;
    switch (source) {
      case 'battery_pct':
        lhs = inputs.batteryPct;
        break;
      case 'h2_pct':
        lhs = inputs.h2Pct;
        break;
      case 'o2_pct':
        lhs = inputs.o2Pct;
        break;
      case 'cargo_pct':
        lhs = inputs.cargoPct;
        break;
      case 'vent_o2_pct':
        lhs = inputs.ventO2Pct;
        break;
      case 'ship_speed':
        lhs = inputs.shipSpeed;
        break;
      case 'gravity_g':
        lhs = inputs.gravityG;
        break;
      case 'solar_mw':
        lhs = inputs.solarMw;
        break;
      case 'reactor_mw':
        lhs = inputs.reactorMw;
        break;
      case 'projector_remaining':
        lhs = inputs.projectorRemaining;
        break;
      case 'item_count':
        lhs = this.getItemCount(
          inputs,
          String(block.params.itemCategory ?? 'MyObjectBuilder_Ingot'),
          String(block.params.itemSubtype ?? 'Uranium')
        );
        break;
      case 'variable': {
        const vn = String(block.params.varName ?? 'state').trim() || 'state';
        lhs = this.numVars[vn] ?? 0;
        break;
      }
    }

    const rhs = Number(rawVal) || 0;
    switch (op) {
      case '<':
        return lhs < rhs;
      case '<=':
        return lhs <= rhs;
      case '>':
        return lhs > rhs;
      case '>=':
        return lhs >= rhs;
      case '==':
        return Math.abs(lhs - rhs) < 0.0001;
      case '!=':
        return Math.abs(lhs - rhs) >= 0.0001;
      default:
        return false;
    }
  }

  private execList(
    blocks: ScriptBlock[],
    inputs: SimShipInputs,
    argument: string,
    deltaSeconds: number,
    echoLog: string[]
  ): void {
    for (const block of blocks) {
      if (block.disabled) continue;

      switch (block.type) {
        case 'on_setup':
        case 'comment':
          break;

        // ======================== MODERN GUI BLOCKS ========================
        case 'gui_screen': {
          const baseName = String(block.params.lcdName ?? 'Status LCD').trim() || 'Status LCD';
          const surfIdx = Math.max(0, Math.round(Number(block.params.surfaceIndex) || 0));
          const screenKey = surfIdx > 0 ? `${baseName} [#${surfIdx}]` : baseName;
          const ops: SimGuiOp[] = [];
          const prevOps = this.activeGuiOps;
          this.activeGuiOps = ops;
          this.execList(block.children ?? [], inputs, argument, deltaSeconds, echoLog);
          this.activeGuiOps = prevOps;

          this.lcds[screenKey] = {
            name: screenKey,
            mode: 'gui',
            text: '',
            fontSize: 1.0,
            font: 'Monospace',
            fontColor: '#E2E8F0',
            bgColor: String(block.params.bgColor ?? '#08111A'),
            alignment: 'LEFT',
            surfaceIndex: surfIdx,
            frameColor: String(block.params.frameColor ?? '#2B9FD9'),
            showFrame: Boolean(block.params.showFrame),
            showGrid: Boolean(block.params.showGrid),
            guiOps: ops,
          };
          break;
        }

        case 'gui_header': {
          if (!this.activeGuiOps) break;
          this.activeGuiOps.push({
            kind: 'header',
            title: this.formatTemplate(String(block.params.title ?? 'SHIP TELEMETRY'), inputs),
            badge: this.formatTemplate(String(block.params.badge ?? ''), inputs),
            accentColor: String(block.params.accentColor ?? '#38A3D1'),
          });
          break;
        }

        case 'gui_bar': {
          if (!this.activeGuiOps) break;
          const pct = Math.max(
            0,
            Math.min(
              100,
              this.evalPercentSource(
                String(block.params.source ?? 'battery_pct'),
                String(block.params.target ?? ''),
                inputs
              )
            )
          );
          const colorMode = String(block.params.colorMode ?? 'auto');
          const color = computeGuiAutoColor(pct, colorMode, String(block.params.color ?? '#22C55E'));
          const styleRaw = String(block.params.style ?? 'segmented');
          const style = styleRaw === 'smooth' || styleRaw === 'compact' ? styleRaw : 'segmented';
          const iconRaw = String(block.params.icon ?? 'none');
          const icon = ['energy', 'hydrogen', 'oxygen', 'cargo', 'danger'].includes(iconRaw)
            ? (iconRaw as 'energy' | 'hydrogen' | 'oxygen' | 'cargo' | 'danger')
            : 'none';
          this.activeGuiOps.push({
            kind: 'bar',
            label: this.formatTemplate(String(block.params.label ?? 'BATTERY'), inputs),
            percent: pct,
            valueText: `${Math.round(pct)}%`,
            style,
            icon,
            color,
          });
          break;
        }

        case 'gui_gauges': {
          if (!this.activeGuiOps) break;
          const count = String(block.params.count ?? '3') === '2' ? 2 : 3;
          const items = [];
          for (let i = 1; i <= count; i++) {
            const pct = Math.max(
              0,
              Math.min(
                100,
                this.evalPercentSource(String(block.params[`source${i}`] ?? 'battery_pct'), '', inputs)
              )
            );
            items.push({
              label: String(block.params[`label${i}`] ?? `GAUGE ${i}`),
              percent: pct,
              color: computeGuiAutoColor(pct, 'auto', '#38D9A9'),
            });
          }
          this.activeGuiOps.push({ kind: 'gauges', items });
          break;
        }

        case 'gui_metrics': {
          if (!this.activeGuiOps) break;
          const count = String(block.params.count ?? '3') === '2' ? 2 : 3;
          const cards = [];
          for (let i = 1; i <= count; i++) {
            cards.push({
              label: String(block.params[`label${i}`] ?? `STAT ${i}`),
              value: this.formatTemplate(String(block.params[`val${i}`] ?? '0'), inputs),
            });
          }
          this.activeGuiOps.push({
            kind: 'metrics',
            accentColor: String(block.params.accentColor ?? '#38A3D1'),
            cards,
          });
          break;
        }

        case 'gui_alert': {
          if (!this.activeGuiOps) break;
          const sevRaw = String(block.params.severity ?? 'critical');
          const severity =
            sevRaw === 'warning' || sevRaw === 'nominal' || sevRaw === 'info' ? sevRaw : 'critical';
          this.activeGuiOps.push({
            kind: 'alert',
            message: this.formatTemplate(String(block.params.message ?? 'ALERT'), inputs),
            severity,
          });
          break;
        }

        case 'gui_inventory': {
          if (!this.activeGuiOps) break;
          const category = String(block.params.category ?? 'all');
          const sortBy = String(block.params.sortBy ?? 'amount_desc');
          const maxItems = Math.max(1, Math.round(Number(block.params.maxItems) || 8));
          const filtered: SimInventoryItem[] = inputs.inventory.filter((item) => {
            if (category === 'ore') return item.category === 'Ore';
            if (category === 'ingot') return item.category === 'Ingot';
            if (category === 'component') return item.category === 'Component';
            if (category === 'ammo') return item.category === 'Ammo';
            if (category === 'ore_ingot') return item.category === 'Ore' || item.category === 'Ingot';
            return true;
          });
          const sorted = [...filtered].sort((a, b) =>
            sortBy === 'name_asc' ? a.displayName.localeCompare(b.displayName) : b.amount - a.amount
          );
          const topVal = sorted.length > 0 ? Math.max(1, sorted[0].amount) : 1;
          const rows = sorted.slice(0, maxItems).map((it) => ({
            name: it.displayName,
            amountText: formatSimAmount(it.amount),
            ratio: Math.min(1, it.amount / topVal),
          }));
          this.activeGuiOps.push({
            kind: 'inventory',
            cargoPct: inputs.cargoPct,
            accentColor: String(block.params.accentColor ?? '#38D9A9'),
            rows,
            extraCount: Math.max(0, sorted.length - maxItems),
          });
          break;
        }

        case 'gui_text': {
          if (!this.activeGuiOps) break;
          const sz = String(block.params.size ?? 'body');
          const align = String(block.params.align ?? 'CENTER');
          this.activeGuiOps.push({
            kind: 'text',
            text: this.formatTemplate(String(block.params.text ?? ''), inputs),
            size: sz === 'heading' || sz === 'caption' ? sz : 'body',
            align: align === 'LEFT' || align === 'RIGHT' ? align : 'CENTER',
            color: String(block.params.color ?? '#E2E8F0'),
          });
          break;
        }

        case 'gui_divider': {
          if (!this.activeGuiOps) break;
          this.activeGuiOps.push({
            kind: 'divider',
            label: this.formatTemplate(String(block.params.label ?? '').trim(), inputs),
            color: String(block.params.color ?? '#334155'),
          });
          break;
        }

        // ======================== CONTROL & LOGIC ========================
        case 'on_argument': {
          const expected = String(block.params.argument ?? '').trim();
          if (expected && argument.trim().toLowerCase() === expected.toLowerCase()) {
            this.execList(block.children ?? [], inputs, argument, deltaSeconds, echoLog);
          }
          break;
        }

        case 'if_condition': {
          const matched = this.evalCondition(block, inputs, argument);
          if (matched) {
            this.execList(block.children ?? [], inputs, argument, deltaSeconds, echoLog);
          } else if (block.params.hasElse) {
            this.execList(block.elseChildren ?? [], inputs, argument, deltaSeconds, echoLog);
          }
          break;
        }

        case 'cooldown': {
          const sec = Math.max(0.1, Number(block.params.seconds) || 5);
          const cur = (this.timers[block.id] ?? sec) + deltaSeconds;
          if (cur >= sec) {
            this.timers[block.id] = 0;
            this.execList(block.children ?? [], inputs, argument, deltaSeconds, echoLog);
          } else {
            this.timers[block.id] = cur;
          }
          break;
        }

        case 'set_variable': {
          const vn = String(block.params.varName ?? 'val').trim() || 'val';
          const src = String(block.params.source ?? 'battery_pct');
          if (src === 'text') {
            this.strVars[vn] = this.formatTemplate(String(block.params.value ?? ''), inputs);
          } else {
            let v = 0;
            switch (src) {
              case 'number':
                v = Number(block.params.value) || 0;
                break;
              case 'battery_pct':
                v = inputs.batteryPct;
                break;
              case 'h2_pct':
                v = inputs.h2Pct;
                break;
              case 'o2_pct':
                v = inputs.o2Pct;
                break;
              case 'cargo_pct':
                v = inputs.cargoPct;
                break;
              case 'vent_o2_pct':
                v = inputs.ventO2Pct;
                break;
              case 'ship_speed':
                v = inputs.shipSpeed;
                break;
              case 'gravity_g':
                v = inputs.gravityG;
                break;
              case 'solar_mw':
                v = inputs.solarMw;
                break;
              case 'reactor_mw':
                v = inputs.reactorMw;
                break;
              case 'item_count':
                v = this.getItemCount(
                  inputs,
                  String(block.params.itemCategory ?? 'MyObjectBuilder_Ore'),
                  String(block.params.itemSubtype ?? 'Ice')
                );
                break;
            }
            this.numVars[vn] = v;
            this.strVars[vn] = Number.isInteger(v) ? String(v) : v.toFixed(1);
          }
          break;
        }

        case 'change_variable': {
          const vn = String(block.params.varName ?? 'counter').trim() || 'counter';
          const delta = Number(block.params.delta) || 0;
          const next = (this.numVars[vn] ?? 0) + delta;
          this.numVars[vn] = next;
          this.strVars[vn] = Number.isInteger(next) ? String(next) : next.toFixed(1);
          break;
        }

        // ======================== CLASSIC TEXT LCDS ========================
        case 'lcd_inventory': {
          const lcd = this.getOrCreateLcd(String(block.params.lcdName ?? 'Inventory LCD'));
          lcd.mode = 'text';
          const title = String(block.params.title ?? 'SHIP INVENTORY');
          const category = String(block.params.category ?? 'all');
          const sortBy = String(block.params.sortBy ?? 'amount_desc');
          const showBar = Boolean(block.params.showBar);
          const maxItems = Math.max(1, Math.round(Number(block.params.maxItems) || 14));

          const filtered: SimInventoryItem[] = inputs.inventory.filter((item) => {
            if (category === 'ore') return item.category === 'Ore';
            if (category === 'ingot') return item.category === 'Ingot';
            if (category === 'component') return item.category === 'Component';
            if (category === 'ammo') return item.category === 'Ammo';
            if (category === 'ore_ingot') return item.category === 'Ore' || item.category === 'Ingot';
            return true;
          });

          const sorted = [...filtered].sort((a, b) =>
            sortBy === 'name_asc' ? a.displayName.localeCompare(b.displayName) : b.amount - a.amount
          );

          const outLines: string[] = [`=== ${title} ===`];
          if (showBar) {
            outLines.push(`Cargo: ${buildAsciiBar(inputs.cargoPct, 16)} ${inputs.cargoPct.toFixed(1)}%`);
          }
          outLines.push('--------------------------------');
          if (sorted.length === 0) {
            outLines.push('  (No matching items found)');
          } else {
            const slice = sorted.slice(0, maxItems);
            for (const item of slice) {
              const label = item.displayName.slice(0, 21).padEnd(22, ' ');
              const amt = formatSimAmount(item.amount).padStart(10, ' ');
              outLines.push(`${label}${amt}`);
            }
            if (sorted.length > maxItems) {
              outLines.push(`  ... +${sorted.length - maxItems} more item types`);
            }
          }
          lcd.text = outLines.join('\n');
          break;
        }

        case 'lcd_power': {
          const lcd = this.getOrCreateLcd(String(block.params.lcdName ?? 'Power LCD'));
          lcd.mode = 'text';
          const title = String(block.params.title ?? 'POWER TELEMETRY');
          const showSources = Boolean(block.params.showSources);
          const showBar = Boolean(block.params.showBar);
          const append = Boolean(block.params.append);
          const maxMwh = 12.0;
          const stored = (inputs.batteryPct / 100) * maxMwh;
          const outLines = [`=== ${title} ===`];
          outLines.push(
            showBar
              ? `Batt:  ${buildAsciiBar(inputs.batteryPct, 16)} ${inputs.batteryPct.toFixed(1)}%`
              : `Batteries (4): ${inputs.batteryPct.toFixed(1)}%`
          );
          outLines.push(`Stored: ${stored.toFixed(2)} / ${maxMwh.toFixed(2)} MWh`);
          outLines.push(`Flow:   +${inputs.solarMw.toFixed(2)} MW / -${(1.8 + inputs.reactorMw * 0.4).toFixed(2)} MW`);
          if (showSources) {
            outLines.push(`Solar:  ${inputs.solarMw.toFixed(2)} MW (8)`);
            outLines.push(`React:  ${inputs.reactorMw.toFixed(2)} MW (2)`);
          }
          const chunk = outLines.join('\n') + '\n';
          lcd.text = append ? lcd.text + chunk : chunk;
          break;
        }

        case 'lcd_gas': {
          const lcd = this.getOrCreateLcd(String(block.params.lcdName ?? 'Status LCD'));
          lcd.mode = 'text';
          const title = String(block.params.title ?? 'GAS STORAGE');
          const gasType = String(block.params.gasType ?? 'both');
          const showBar = Boolean(block.params.showBar);
          const append = Boolean(block.params.append);
          const outLines = [`=== ${title} ===`];
          if (gasType === 'both' || gasType === 'hydrogen') {
            outLines.push(`H2 (2): ${showBar ? buildAsciiBar(inputs.h2Pct, 14) + ' ' : ''}${inputs.h2Pct.toFixed(1)}%`);
          }
          if (gasType === 'both' || gasType === 'oxygen') {
            outLines.push(`O2 (2): ${showBar ? buildAsciiBar(inputs.o2Pct, 14) + ' ' : ''}${inputs.o2Pct.toFixed(1)}%`);
          }
          const chunk = outLines.join('\n') + '\n';
          lcd.text = append ? lcd.text + chunk : chunk;
          break;
        }

        case 'lcd_clear': {
          const lcd = this.getOrCreateLcd(String(block.params.lcdName ?? 'Status LCD'));
          lcd.mode = 'text';
          lcd.text = '';
          break;
        }

        case 'lcd_write': {
          const lcd = this.getOrCreateLcd(String(block.params.lcdName ?? 'Status LCD'));
          lcd.mode = 'text';
          const line = this.formatTemplate(String(block.params.text ?? ''), inputs) + '\n';
          lcd.text = block.params.append ? lcd.text + line : line;
          break;
        }

        case 'lcd_style': {
          const lcd = this.getOrCreateLcd(String(block.params.lcdName ?? 'Status LCD'));
          lcd.font = String(block.params.font ?? 'Monospace') === 'Debug' ? 'Debug' : 'Monospace';
          lcd.fontSize = Number(block.params.fontSize) || 1.0;
          lcd.fontColor = String(block.params.fontColor ?? '#38D9A9');
          lcd.bgColor = String(block.params.bgColor ?? '#0A1118');
          const align = String(block.params.alignment ?? 'LEFT');
          lcd.alignment = align === 'CENTER' || align === 'RIGHT' ? align : 'LEFT';
          break;
        }

        case 'pb_echo': {
          echoLog.push(this.formatTemplate(String(block.params.text ?? ''), inputs));
          break;
        }

        // ======================== SHIP HARDWARE BLOCKS ========================
        case 'door_action': {
          const name = String(block.params.name ?? 'Door').trim() || 'Door';
          const action = String(block.params.action ?? 'close');
          const labelMap: Record<string, { state: string; accent: SimBlockStatus['accent'] }> = {
            open: { state: 'OPEN', accent: 'warn' },
            close: { state: 'CLOSED', accent: 'ok' },
            toggle: { state: 'TOGGLED', accent: 'neutral' },
            lock: { state: 'LOCKED (OFF)', accent: 'danger' },
            unlock: { state: 'UNLOCKED', accent: 'ok' },
          };
          const meta = labelMap[action] ?? { state: action.toUpperCase(), accent: 'neutral' };
          this.blocks[`door:${name}`] = { name, kind: 'Door', ...meta };
          break;
        }

        case 'airvent_action': {
          const name = String(block.params.name ?? 'Air Vent').trim() || 'Air Vent';
          const action = String(block.params.action ?? 'pressurize');
          this.blocks[`vent:${name}`] = {
            name,
            kind: 'Air Vent',
            state:
              action === 'depressurize'
                ? 'DEPRESSURIZING'
                : action === 'pressurize'
                ? 'PRESSURIZING'
                : action.toUpperCase(),
            accent: action === 'depressurize' ? 'warn' : action === 'pressurize' ? 'ok' : 'neutral',
          };
          break;
        }

        case 'light_action': {
          const mode = String(block.params.targetMode ?? 'group');
          const name = mode === 'all' ? 'All Ship Lights' : String(block.params.name ?? 'Lights').trim() || 'Lights';
          const action = String(block.params.action ?? 'style');
          const color = String(block.params.color ?? '#FFFFFF');
          const blink = Number(block.params.blinkSeconds) || 0;
          this.blocks[`light:${name}`] = {
            name,
            kind: 'Lights',
            state:
              action === 'off'
                ? 'OFF'
                : action === 'style'
                ? blink > 0
                  ? `BLINK ${blink}s`
                  : 'SOLID ON'
                : action.toUpperCase(),
            accent: action === 'off' ? 'neutral' : blink > 0 ? 'danger' : 'ok',
            color: action === 'off' ? '#475569' : color,
            blinking: action === 'style' && blink > 0,
          };
          break;
        }

        case 'block_power': {
          const name = String(block.params.name ?? 'Block').trim() || 'Block';
          const action = String(block.params.action ?? 'on');
          const prev = Boolean(this.enabledBlocks[name.toLowerCase()]);
          const next = action === 'on' ? true : action === 'off' ? false : !prev;
          this.enabledBlocks[name.toLowerCase()] = next;
          this.blocks[`power:${name}`] = {
            name,
            kind: 'Power',
            state: next ? 'ONLINE' : 'OFFLINE',
            accent: next ? 'ok' : 'neutral',
          };
          break;
        }

        case 'battery_mode': {
          const mode = String(block.params.targetMode ?? 'all');
          const name = mode === 'all' ? 'All Ship Batteries' : String(block.params.name ?? 'Batteries').trim();
          const chargeMode = String(block.params.mode ?? 'Auto');
          this.blocks[`batt:${name}`] = {
            name,
            kind: 'Batteries',
            state: chargeMode.toUpperCase(),
            accent: chargeMode === 'Recharge' ? 'warn' : 'ok',
          };
          break;
        }

        case 'tank_stockpile': {
          const gasType = String(block.params.gasType ?? 'hydrogen');
          const on = String(block.params.stockpile ?? 'on') === 'on';
          const name = `${gasType.toUpperCase()} Tanks`;
          this.blocks[`tank:${name}`] = {
            name,
            kind: 'Gas Tanks',
            state: on ? 'STOCKPILE ON' : 'NORMAL',
            accent: on ? 'warn' : 'ok',
          };
          break;
        }

        case 'connector_action': {
          const name = String(block.params.name ?? 'Connector').trim() || 'Connector';
          const action = String(block.params.action ?? 'toggle');
          this.blocks[`conn:${name}`] = {
            name,
            kind: 'Connector',
            state: action.toUpperCase(),
            accent: action === 'connect' ? 'ok' : 'warn',
          };
          break;
        }

        case 'thruster_override': {
          const mode = String(block.params.targetMode ?? 'group');
          const name = mode === 'all' ? 'All Thrusters' : String(block.params.name ?? 'Thrusters');
          const pct = Number(block.params.percent) || 0;
          this.blocks[`thrust:${name}`] = {
            name,
            kind: 'Thrusters',
            state: pct > 0 ? `OVERRIDE ${pct}%` : 'NORMAL (0%)',
            accent: pct > 0 ? 'warn' : 'neutral',
          };
          break;
        }

        case 'sound_action': {
          const name = String(block.params.name ?? 'Sound Block').trim() || 'Sound Block';
          const action = String(block.params.action ?? 'play');
          this.blocks[`sound:${name}`] = {
            name,
            kind: 'Sound',
            state: action === 'play' ? 'PLAYING ALARM' : 'SILENT',
            accent: action === 'play' ? 'danger' : 'neutral',
          };
          break;
        }

        case 'timer_action': {
          const name = String(block.params.name ?? 'Timer').trim() || 'Timer';
          const action = String(block.params.action ?? 'trigger');
          this.blocks[`timer:${name}`] = {
            name,
            kind: 'Timer',
            state: action === 'trigger' ? 'TRIGGERED' : action === 'start' ? 'COUNTING' : 'STOPPED',
            accent: action === 'stop' ? 'neutral' : 'ok',
          };
          break;
        }

        case 'broadcast_text': {
          const dev = String(block.params.deviceType ?? 'antenna');
          const name = String(block.params.name ?? 'Antenna').trim() || 'Antenna';
          const hud = this.formatTemplate(String(block.params.hudText ?? ''), inputs);
          this.blocks[`radio:${name}`] = {
            name,
            kind: dev === 'beacon' ? 'Beacon' : 'Antenna',
            state: hud || '(Empty)',
            accent: 'ok',
          };
          break;
        }

        case 'piston_action': {
          const name = String(block.params.name ?? 'Piston').trim() || 'Piston';
          const action = String(block.params.action ?? 'extend');
          this.blocks[`piston:${name}`] = {
            name,
            kind: 'Piston',
            state: action.toUpperCase(),
            accent: action === 'stop' ? 'neutral' : 'ok',
          };
          break;
        }

        case 'rotor_action': {
          const name = String(block.params.name ?? 'Rotor').trim() || 'Rotor';
          const action = String(block.params.action ?? 'spin');
          const rpm = Number(block.params.rpm) || 0;
          this.blocks[`rotor:${name}`] = {
            name,
            kind: 'Rotor/Hinge',
            state: action === 'spin' ? `${rpm} RPM` : action.toUpperCase(),
            accent: action === 'lock' ? 'warn' : 'ok',
          };
          break;
        }
      }
    }
  }
}
