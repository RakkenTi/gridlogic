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
    pbCustomData: 'minBatt=25\nminO2=65\nauxTag=[Aux]\n',
  };
}

interface SimVirtualBlock {
  name: string;
  kind: string;
  value: number;
  enabled: boolean;
  data: string;
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
  private blockCustomData: Record<string, string> = {};
  private activeGuiOps: SimGuiOp[] | null = null;
  private initialized = false;
  private ticksRun = 0;

  // Native loop & function runtime state
  private loopName = '';
  private loopValue = 0;
  private loopIndex = 0;
  private loopCount = 0;
  private loopEnabled = false;
  private loopData = '';
  private loopKind = 'functional';
  private functionsMap = new Map<string, ScriptBlock[]>();
  private callDepth = 0;

  reset(): void {
    this.numVars = {};
    this.strVars = {};
    this.timers = {};
    this.lcds = {};
    this.blocks = {};
    this.enabledBlocks = {};
    this.blockCustomData = {};
    this.activeGuiOps = null;
    this.initialized = false;
    this.ticksRun = 0;
    this.loopName = '';
    this.loopValue = 0;
    this.loopIndex = 0;
    this.loopCount = 0;
    this.loopEnabled = false;
    this.loopData = '';
  }

  step(
    project: ScriptProject,
    inputs: SimShipInputs,
    argument = '',
    deltaSeconds = 1.66
  ): SimExecutionResult {
    const echoLog: string[] = [];

    // Register defined functions before running setup or main
    this.functionsMap.clear();
    for (const b of project.blocks) {
      if (!b.disabled && b.type === 'define_function') {
        const key = String(b.params.name ?? 'Routine').trim().toLowerCase();
        if (key) this.functionsMap.set(key, b.children ?? []);
      }
    }
    this.callDepth = 0;

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

  private getVirtualGridBlocks(inputs: SimShipInputs): SimVirtualBlock[] {
    const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n * 10) / 10));
    const isEnabled = (name: string, def = true) => {
      const k = name.toLowerCase();
      return k in this.enabledBlocks ? this.enabledBlocks[k] : def;
    };
    const getData = (name: string, def = '') => this.blockCustomData[name.toLowerCase()] ?? def;

    return [
      { name: 'Battery 1 (Core)', kind: 'battery', value: clamp(inputs.batteryPct + 8), enabled: isEnabled('Battery 1 (Core)'), data: getData('Battery 1 (Core)', 'bank=A') },
      { name: 'Battery 2 (Port)', kind: 'battery', value: clamp(inputs.batteryPct - 4), enabled: isEnabled('Battery 2 (Port)'), data: getData('Battery 2 (Port)', 'bank=A') },
      { name: 'Battery 3 (Stbd)', kind: 'battery', value: clamp(inputs.batteryPct + 2), enabled: isEnabled('Battery 3 (Stbd)'), data: getData('Battery 3 (Stbd)', 'bank=B') },
      { name: 'Battery 4 (Aux)', kind: 'battery', value: clamp(inputs.batteryPct - 11), enabled: isEnabled('Battery 4 (Aux)'), data: getData('Battery 4 (Aux)', 'bank=B') },
      { name: '[Auto] Bridge Door', kind: 'door', value: inputs.doorOpen ? 100 : 0, enabled: isEnabled('[Auto] Bridge Door'), data: getData('[Auto] Bridge Door') },
      { name: '[Auto] Hangar Door', kind: 'door', value: inputs.doorOpen ? 100 : 0, enabled: isEnabled('[Auto] Hangar Door'), data: getData('[Auto] Hangar Door') },
      { name: 'Airlock Outer Door', kind: 'door', value: 0, enabled: isEnabled('Airlock Outer Door'), data: getData('Airlock Outer Door') },
      { name: 'Bridge Vent', kind: 'airvent', value: clamp(inputs.ventO2Pct), enabled: isEnabled('Bridge Vent'), data: getData('Bridge Vent') },
      { name: 'Medbay Vent', kind: 'airvent', value: clamp(Math.min(100, inputs.ventO2Pct + 6)), enabled: isEnabled('Medbay Vent'), data: getData('Medbay Vent') },
      { name: 'Airlock Vent', kind: 'airvent', value: clamp(Math.max(0, inputs.ventO2Pct - 8)), enabled: isEnabled('Airlock Vent'), data: getData('Airlock Vent') },
      { name: 'Assembler [Aux]', kind: 'assembler', value: isEnabled('Assembler [Aux]') ? 1 : 0, enabled: isEnabled('Assembler [Aux]'), data: getData('Assembler [Aux]', 'priority=low') },
      { name: 'Refinery [Aux]', kind: 'refinery', value: isEnabled('Refinery [Aux]') ? 1 : 0, enabled: isEnabled('Refinery [Aux]'), data: getData('Refinery [Aux]', 'priority=low') },
      { name: 'Floodlight [Aux]', kind: 'light', value: isEnabled('Floodlight [Aux]') ? 1 : 0, enabled: isEnabled('Floodlight [Aux]'), data: getData('Floodlight [Aux]', 'priority=low') },
      { name: 'Large Cargo 1', kind: 'cargo', value: clamp(inputs.cargoPct + 9), enabled: true, data: getData('Large Cargo 1') },
      { name: 'Large Cargo 2', kind: 'cargo', value: clamp(inputs.cargoPct - 9), enabled: true, data: getData('Large Cargo 2') },
      { name: 'Hydrogen Tank 1', kind: 'gastank', value: clamp(inputs.h2Pct), enabled: true, data: getData('Hydrogen Tank 1') },
      { name: 'Oxygen Tank 1', kind: 'gastank', value: clamp(inputs.o2Pct), enabled: true, data: getData('Oxygen Tank 1') },
      { name: 'Solar Array 1', kind: 'solar', value: inputs.solarMw, enabled: true, data: getData('Solar Array 1') },
      { name: 'Backup Reactor', kind: 'reactor', value: inputs.reactorMw, enabled: isEnabled('Backup Reactor', inputs.reactorMw > 0), data: getData('Backup Reactor') },
      { name: 'Docking Connector', kind: 'connector', value: inputs.connectorStatus === 'Connected' ? 1 : 0, enabled: true, data: getData('Docking Connector') },
      { name: 'Bridge Light', kind: 'light', value: isEnabled('Bridge Light') ? 1 : 0, enabled: isEnabled('Bridge Light'), data: getData('Bridge Light') },
    ];
  }

  private queryVirtualBlocks(
    blockType: string,
    matchMode: string,
    filter: string,
    inputs: SimShipInputs
  ): SimVirtualBlock[] {
    const flt = filter.trim().toLowerCase();
    return this.getVirtualGridBlocks(inputs).filter((b) => {
      const kindMatch = blockType === 'functional' ? true : b.kind === blockType;
      if (!kindMatch) return false;
      if (matchMode === 'tag' && flt && !b.name.toLowerCase().includes(flt)) return false;
      if (matchMode === 'group' && flt && !b.name.toLowerCase().includes(flt)) return false;
      return true;
    });
  }

  private evalNumericOperand(raw: unknown, inputs: SimShipInputs): number {
    const s = String(raw ?? '0').trim();
    const m = /^\{([a-zA-Z0-9_]+)\}$/.exec(s);
    if (m) {
      const key = m[1];
      switch (key) {
        case 'battery':
          return inputs.batteryPct;
        case 'h2':
          return inputs.h2Pct;
        case 'o2':
          return inputs.o2Pct;
        case 'cargo':
          return inputs.cargoPct;
        case 'speed':
          return inputs.shipSpeed;
        case 'gravity':
          return inputs.gravityG;
        case 'solar':
          return inputs.solarMw;
        case 'reactor':
          return inputs.reactorMw;
        case '_value':
          return this.loopValue;
        case '_index':
          return this.loopIndex;
        case '_count':
          return this.loopCount;
        case '_enabled':
          return this.loopEnabled ? 1 : 0;
        default:
          return this.numVars[key] ?? (Number(this.strVars[key]) || 0);
      }
    }
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
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
      case 'loop_value':
        return this.loopValue;
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
    out = out.replaceAll('{_name}', this.loopName);
    out = out.replaceAll('{_value}', this.loopValue.toFixed(1).replace(/\.0$/, ''));
    out = out.replaceAll('{_index}', String(this.loopIndex));
    out = out.replaceAll('{_count}', String(this.loopCount));
    out = out.replaceAll('{_enabled}', this.loopEnabled ? '1' : '0');
    out = out.replaceAll('{_data}', this.loopData);

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

  private evalSingleCondition(
    source: ConditionSource,
    rawVal: string,
    op: string,
    boolExpect: boolean,
    target: string,
    varName: string,
    itemCategory: string,
    itemSubtype: string,
    inputs: SimShipInputs,
    argument: string
  ): boolean {
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
        case 'loop_enabled':
          actual = this.loopEnabled;
          break;
      }
      return boolExpect ? actual : !actual;
    }

    if (source === 'variable') {
      const vn = varName.trim() || 'state';
      const trimmedVal = rawVal.trim();
      const isVarToken = /^\{[a-zA-Z0-9_]+\}$/.test(trimmedVal);
      if (!isVarToken && Number.isNaN(Number(trimmedVal)) && (op === '==' || op === '!=')) {
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
        lhs = this.getItemCount(inputs, itemCategory, itemSubtype);
        break;
      case 'loop_value':
        lhs = this.loopValue;
        break;
      case 'loop_index':
        lhs = this.loopIndex;
        break;
      case 'loop_count':
        lhs = this.loopCount;
        break;
      case 'variable': {
        const vn = varName.trim() || 'state';
        lhs = this.numVars[vn] ?? 0;
        break;
      }
    }

    const rhs = this.evalNumericOperand(rawVal, inputs);
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

  private evalCondition(block: ScriptBlock, inputs: SimShipInputs, argument: string): boolean {
    const first = this.evalSingleCondition(
      String(block.params.source ?? 'battery_pct') as ConditionSource,
      String(block.params.value ?? '0'),
      String(block.params.operator ?? '<'),
      String(block.params.boolExpect ?? 'true') === 'true',
      String(block.params.target ?? '').trim(),
      String(block.params.varName ?? 'state'),
      String(block.params.itemCategory ?? 'MyObjectBuilder_Ingot'),
      String(block.params.itemSubtype ?? 'Uranium'),
      inputs,
      argument
    );

    const join = String(block.params.logicJoin ?? 'none');
    if (join === 'AND' || join === 'OR') {
      const second = this.evalSingleCondition(
        String(block.params.source2 ?? 'connector_connected') as ConditionSource,
        String(block.params.value2 ?? '0'),
        String(block.params.operator2 ?? '<'),
        String(block.params.boolExpect2 ?? 'false') === 'true',
        String(block.params.target2 ?? '').trim(),
        String(block.params.varName2 ?? 'state'),
        'MyObjectBuilder_Ingot',
        'Uranium',
        inputs,
        argument
      );
      return join === 'AND' ? first && second : first || second;
    }
    return first;
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
        case 'define_function':
          break;

        case 'call_function': {
          const fnKey = String(block.params.name ?? '').trim().toLowerCase();
          const fnBody = this.functionsMap.get(fnKey);
          if (fnBody && this.callDepth < 16) {
            this.callDepth++;
            this.execList(fnBody, inputs, argument, deltaSeconds, echoLog);
            this.callDepth--;
          }
          break;
        }

        case 'for_each_block': {
          const bType = String(block.params.blockType ?? 'functional');
          const mMode = String(block.params.matchMode ?? 'tag');
          const flt = String(block.params.filter ?? '').trim();
          const matched = this.queryVirtualBlocks(bType, mMode, flt, inputs);
          this.loopCount = matched.length;
          for (let i = 0; i < matched.length; i++) {
            const vb = matched[i];
            this.loopIndex = i;
            this.loopName = vb.name;
            this.loopValue = vb.value;
            this.loopEnabled = vb.enabled;
            this.loopData = vb.data;
            this.loopKind = vb.kind;
            this.execList(block.children ?? [], inputs, argument, deltaSeconds, echoLog);
          }
          break;
        }

        case 'repeat_times': {
          const count = Math.max(0, Math.min(200, Math.round(this.evalNumericOperand(block.params.count, inputs))));
          const iv = String(block.params.indexVar ?? 'i').trim() || 'i';
          for (let i = 0; i < count; i++) {
            this.numVars[iv] = i;
            this.strVars[iv] = String(i);
            this.execList(block.children ?? [], inputs, argument, deltaSeconds, echoLog);
          }
          break;
        }

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
          } else if (src === 'loop_name') {
            this.strVars[vn] = this.loopName;
          } else {
            let v = 0;
            switch (src) {
              case 'number':
                v = this.evalNumericOperand(block.params.value, inputs);
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
              case 'loop_value':
                v = this.loopValue;
                break;
              case 'loop_index':
                v = this.loopIndex;
                break;
              case 'loop_count':
                v = this.loopCount;
                break;
              case 'loop_enabled':
                v = this.loopEnabled ? 1 : 0;
                break;
            }
            this.numVars[vn] = v;
            this.strVars[vn] = Number.isInteger(v) ? String(v) : v.toFixed(1);
          }
          break;
        }

        case 'math_op': {
          const dest = String(block.params.destVar ?? 'result').trim() || 'result';
          const a = this.evalNumericOperand(block.params.left, inputs);
          const b = this.evalNumericOperand(block.params.right, inputs);
          const op = String(block.params.op ?? '+');
          let r = 0;
          switch (op) {
            case '+': r = a + b; break;
            case '-': r = a - b; break;
            case '*': r = a * b; break;
            case '/': r = b !== 0 ? a / b : 0; break;
            case '%': r = b !== 0 ? a % b : 0; break;
            case 'min': r = Math.min(a, b); break;
            case 'max': r = Math.max(a, b); break;
            case 'round': r = Math.round(a); break;
            default: r = a + b;
          }
          this.numVars[dest] = r;
          this.strVars[dest] = Number.isInteger(r) ? String(r) : r.toFixed(2);
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

        case 'read_block_prop': {
          const vn = String(block.params.varName ?? 'val').trim() || 'val';
          const mode = String(block.params.targetMode ?? 'named');
          const bName = String(block.params.blockName ?? '').trim();
          const prop = String(block.params.property ?? 'enabled');
          if (mode === 'tag_count') {
            const count = this.queryVirtualBlocks('functional', 'tag', bName, inputs).length;
            this.numVars[vn] = count;
            this.strVars[vn] = String(count);
          } else {
            const vb =
              mode === 'loop'
                ? { name: this.loopName, kind: this.loopKind, value: this.loopValue, enabled: this.loopEnabled, data: this.loopData }
                : this.getVirtualGridBlocks(inputs).find((x) => x.name.toLowerCase() === bName.toLowerCase()) ?? null;
            if (prop === 'custom_data') {
              this.strVars[vn] = vb ? vb.data : '';
            } else {
              let v = 0;
              if (vb) {
                if (prop === 'enabled' || prop === 'working') v = vb.enabled ? 1 : 0;
                else v = vb.value;
              }
              this.numVars[vn] = v;
              this.strVars[vn] = Number.isInteger(v) ? String(v) : v.toFixed(1);
            }
          }
          break;
        }

        case 'custom_data_io': {
          const mode = String(block.params.mode ?? 'read_ini');
          const target = String(block.params.target ?? 'self');
          const bName = String(block.params.blockName ?? '').trim();
          const iniKey = String(block.params.iniKey ?? 'minBatt').trim().toLowerCase();
          const vn = String(block.params.varName ?? 'minBatt').trim() || 'minBatt';
          const fb = String(block.params.fallbackOrText ?? '25');
          const key = target === 'self' ? '__pb_me__' : target === 'loop' ? this.loopName.toLowerCase() : bName.toLowerCase();
          const rawData =
            target === 'self'
              ? this.blockCustomData.__pb_me__ ?? inputs.pbCustomData ?? 'minBatt=25\nminO2=65\n'
              : target === 'loop'
              ? this.loopData
              : this.blockCustomData[key] ?? '';

          if (mode === 'write') {
            const formatted = this.formatTemplate(fb, inputs);
            this.blockCustomData[key] = formatted;
            if (target === 'loop') this.loopData = formatted;
          } else if (mode === 'read_all') {
            this.strVars[vn] = rawData;
          } else {
            let found = fb;
            for (const line of rawData.split('\n')) {
              const t = line.trim();
              if (!t || t.startsWith('#') || t.startsWith(';')) continue;
              const eq = t.indexOf('=');
              if (eq > 0 && t.slice(0, eq).trim().toLowerCase() === iniKey) {
                found = t.slice(eq + 1).trim();
                break;
              }
            }
            const parsed = Number(found);
            if (found !== '' && Number.isFinite(parsed)) {
              this.numVars[vn] = parsed;
              this.strVars[vn] = Number.isInteger(parsed) ? String(parsed) : parsed.toFixed(1);
            } else {
              this.strVars[vn] = found;
            }
          }
          break;
        }

        case 'loop_block_action': {
          const nm = this.loopName || 'Loop Block';
          const act = String(block.params.action ?? 'off');
          if (act === 'on' || act === 'off' || act === 'toggle') {
            const nextOn = act === 'on' ? true : act === 'off' ? false : !this.loopEnabled;
            this.enabledBlocks[nm.toLowerCase()] = nextOn;
            this.loopEnabled = nextOn;
            this.blocks[`loop:${nm}`] = {
              name: nm,
              kind: 'Loop Block',
              state: nextOn ? 'ON' : 'OFF',
              accent: nextOn ? 'ok' : 'neutral',
            };
          } else if (act === 'door_open' || act === 'door_close') {
            this.blocks[`door:${nm}`] = {
              name: nm,
              kind: 'Door',
              state: act === 'door_open' ? 'OPEN' : 'CLOSED',
              accent: act === 'door_open' ? 'warn' : 'ok',
            };
          } else if (act === 'battery_auto' || act === 'battery_recharge') {
            this.blocks[`bat:${nm}`] = {
              name: nm,
              kind: 'Battery',
              state: act === 'battery_recharge' ? 'RECHARGE' : 'AUTO',
              accent: act === 'battery_recharge' ? 'warn' : 'ok',
            };
          } else if (act === 'light_color') {
            const c = String(block.params.color ?? '#FF3B30').toUpperCase();
            this.blocks[`light:${nm}`] = { name: nm, kind: 'Light', state: `ON ${c}`, accent: 'warn', color: c };
          } else if (act === 'custom_data') {
            const txt = this.formatTemplate(String(block.params.value ?? ''), inputs);
            this.blockCustomData[nm.toLowerCase()] = txt;
            this.loopData = txt;
          } else {
            const idStr = String(block.params.actionOrProp ?? 'Action');
            const vNum = this.evalNumericOperand(block.params.value, inputs);
            this.blocks[`term:${nm}`] = {
              name: nm,
              kind: 'Terminal',
              state: act === 'terminal_float' ? `${idStr} = ${vNum}` : `ACTION: ${idStr}`,
              accent: 'ok',
            };
          }
          break;
        }

        case 'terminal_action': {
          const tMode = String(block.params.targetMode ?? 'block');
          const nm = tMode === 'loop' ? this.loopName || 'Loop Block' : String(block.params.name ?? 'Block').trim() || 'Block';
          const opKind = String(block.params.opKind ?? 'action');
          const propId = String(block.params.propId ?? 'Action').trim() || 'Action';
          const vNum = this.evalNumericOperand(block.params.value, inputs);
          this.blocks[`term:${nm}`] = {
            name: nm,
            kind: 'Terminal',
            state: opKind === 'action' ? `ACTION: ${propId}` : `${propId} = ${opKind === 'bool' ? (String(block.params.value).toLowerCase() === 'true' || String(block.params.value) === '1' ? 'TRUE' : 'FALSE') : vNum}`,
            accent: 'ok',
          };
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
