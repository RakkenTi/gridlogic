import { BLOCK_MAP, BOOLEAN_CONDITION_SOURCES } from '../blocks/catalog';
import type {
  ConditionSource,
  GeneratedScriptResult,
  RequiredShipBlock,
  ScriptBlock,
  ScriptProject,
  ValidationIssue,
} from '../types';
import { validateGeneratedCSharp } from './validator';

interface GenContext {
  helpers: Set<string>;
  cooldownTimers: string[];
  requiredBlocks: Map<string, RequiredShipBlock>;
  detectedArguments: Set<string>;
  issues: ValidationIssue[];
  sameGridOnly: boolean;
  insideGuiScreen: boolean;
  loopDepth: number;
  definedFunctions: Map<string, string>;
}

export function sanitizeMethodName(raw: string): string {
  const cleaned = String(raw || 'Routine')
    .trim()
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/^_+/, '');
  return `Fn_${cleaned || 'Routine'}`;
}

export function escapeCSharpString(input: string): string {
  return String(input ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '')
    .replace(/\n/g, '\\n');
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const cleaned = String(hex || '#FFFFFF').replace('#', '').trim();
  if (/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    return {
      r: parseInt(cleaned.slice(0, 2), 16),
      g: parseInt(cleaned.slice(2, 4), 16),
      b: parseInt(cleaned.slice(4, 6), 16),
    };
  }
  return { r: 255, g: 255, b: 255 };
}

function addRequiredBlock(
  ctx: GenContext,
  name: string,
  blockType: string,
  matchMode: RequiredShipBlock['matchMode'],
  purpose: string
): void {
  const cleanName = String(name || '').trim();
  const key = `${matchMode}:${blockType}:${cleanName.toLowerCase()}`;
  if (!ctx.requiredBlocks.has(key)) {
    ctx.requiredBlocks.set(key, {
      name: cleanName || '(All Matching Blocks)',
      blockType,
      matchMode,
      purpose,
    });
  }
}

function numVal(v: string | number | boolean | undefined, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function strVal(v: string | number | boolean | undefined, fallback = ''): string {
  return v === undefined || v === null ? fallback : String(v);
}

function colorExpr(hex: string | number | boolean | undefined, fallback = '#38A3D1'): string {
  const rgb = hexToRgb(strVal(hex, fallback));
  return `new Color(${rgb.r}, ${rgb.g}, ${rgb.b})`;
}

/**
 * Resolves a numeric literal or `{var}` / `{sensor}` token into a C# double expression.
 */
function numericOperandExpr(raw: string | number | boolean | undefined, ctx: GenContext): string {
  const s = strVal(raw, '0').trim();
  const m = /^\{([a-zA-Z0-9_]+)\}$/.exec(s);
  if (m) {
    const key = m[1];
    switch (key) {
      case 'battery':
        ctx.helpers.add('battery_pct');
        return 'GetBatteryPercent("")';
      case 'h2':
        ctx.helpers.add('gas_pct');
        return 'GetGasPercent(true, "")';
      case 'o2':
        ctx.helpers.add('gas_pct');
        return 'GetGasPercent(false, "")';
      case 'cargo':
        ctx.helpers.add('cargo_pct');
        return 'GetCargoPercent("")';
      case 'speed':
        ctx.helpers.add('ship_speed');
        return 'GetShipSpeed()';
      case 'gravity':
        ctx.helpers.add('gravity_g');
        return 'GetGravityG()';
      case 'solar':
        ctx.helpers.add('solar_mw');
        return 'GetSolarOutputMW()';
      case 'reactor':
        ctx.helpers.add('reactor_mw');
        return 'GetReactorOutputMW()';
      case '_value':
        ctx.helpers.add('loop_state');
        return '_loopValue';
      case '_index':
        ctx.helpers.add('loop_state');
        return '(double)_loopIndex';
      case '_count':
        ctx.helpers.add('loop_state');
        return '(double)_loopCount';
      case '_enabled':
        ctx.helpers.add('loop_state');
        return '(_loopEnabled ? 1.0 : 0.0)';
      default:
        ctx.helpers.add('vars');
        return `GetVar("${escapeCSharpString(key)}")`;
    }
  }
  const n = Number(s);
  return Number.isFinite(n) ? String(n) : '0.0';
}

function guiPercentSourceExpr(source: string, target: string, ctx: GenContext, blockId: string): string {
  switch (source) {
    case 'battery_pct':
      ctx.helpers.add('battery_pct');
      addRequiredBlock(ctx, 'Ship Batteries', 'Battery', 'All on Ship', 'Displayed on GUI HUD');
      return 'GetBatteryPercent("")';
    case 'h2_pct':
      ctx.helpers.add('gas_pct');
      addRequiredBlock(ctx, 'Hydrogen Tanks', 'Hydrogen Tank', 'All on Ship', 'Displayed on GUI HUD');
      return 'GetGasPercent(true, "")';
    case 'o2_pct':
      ctx.helpers.add('gas_pct');
      addRequiredBlock(ctx, 'Oxygen Tanks', 'Oxygen Tank', 'All on Ship', 'Displayed on GUI HUD');
      return 'GetGasPercent(false, "")';
    case 'cargo_pct':
      ctx.helpers.add('cargo_pct');
      addRequiredBlock(ctx, 'Cargo Containers', 'Cargo / Inventory', 'All on Ship', 'Displayed on GUI HUD');
      return 'GetCargoPercent("")';
    case 'vent_o2_pct': {
      ctx.helpers.add('vent_o2');
      const t = target.trim();
      if (t) addRequiredBlock(ctx, t, 'Air Vent', 'Exact Name', 'Displayed on GUI HUD');
      else {
        ctx.issues.push({
          severity: 'warning',
          message: 'GUI Bar using Air Vent Oxygen (%) needs an Air Vent name.',
          blockId,
        });
      }
      return `GetVentOxygenPercent("${escapeCSharpString(t)}")`;
    }
    case 'ship_speed':
      ctx.helpers.add('ship_speed');
      addRequiredBlock(ctx, 'Cockpit / Remote Control', 'Ship Controller', 'All on Ship', 'Reads ship speed');
      return 'Math.Min(100.0, GetShipSpeed())';
    case 'variable': {
      ctx.helpers.add('vars');
      const vn = target.trim() || 'val';
      return `GetVar("${escapeCSharpString(vn)}")`;
    }
    case 'loop_value':
      ctx.helpers.add('loop_state');
      return '_loopValue';
    default:
      return '0.0';
  }
}

function templateExpr(text: string, ctx: GenContext): string {
  const raw = strVal(text);
  if (/\{[^}]+\}/.test(raw)) {
    ctx.helpers.add('template');
    if (raw.includes('{battery}') || raw.includes('{bar:battery}')) ctx.helpers.add('battery_pct');
    if (raw.includes('{h2}') || raw.includes('{bar:h2}')) ctx.helpers.add('gas_pct');
    if (raw.includes('{o2}') || raw.includes('{bar:o2}')) ctx.helpers.add('gas_pct');
    if (raw.includes('{cargo}') || raw.includes('{bar:cargo}')) ctx.helpers.add('cargo_pct');
    if (raw.includes('{speed}')) ctx.helpers.add('ship_speed');
    if (raw.includes('{gravity}')) ctx.helpers.add('gravity_g');
    if (raw.includes('{solar}')) ctx.helpers.add('solar_mw');
    if (raw.includes('{reactor}')) ctx.helpers.add('reactor_mw');
    if (
      raw.includes('{_name}') ||
      raw.includes('{_value}') ||
      raw.includes('{_index}') ||
      raw.includes('{_count}') ||
      raw.includes('{_enabled}') ||
      raw.includes('{_data}')
    ) {
      ctx.helpers.add('loop_state');
    }
    if (raw.includes('{bar:')) ctx.helpers.add('bar');
    ctx.helpers.add('vars');
    return `FormatTemplate("${escapeCSharpString(raw)}")`;
  }
  return `"${escapeCSharpString(raw)}"`;
}

function emitSingleCondition(
  blockId: string,
  source: ConditionSource,
  target: string,
  op: string,
  boolExpect: boolean,
  rawVal: string,
  varName: string,
  itemCategory: string,
  itemSubtype: string,
  ctx: GenContext
): string {
  const safeOp = ['<', '<=', '>', '>=', '==', '!='].includes(op) ? op : '<';

  if (source === 'argument_equals') {
    const arg = rawVal.trim();
    if (arg) ctx.detectedArguments.add(arg);
    return `argument.Equals("${escapeCSharpString(arg)}", StringComparison.OrdinalIgnoreCase)`;
  }

  if (BOOLEAN_CONDITION_SOURCES.includes(source)) {
    let expr = 'false';
    switch (source) {
      case 'door_is_open':
        ctx.helpers.add('door_open');
        if (!target) {
          ctx.issues.push({
            severity: 'warning',
            message: 'If Condition (Door Is Open) needs a Door name.',
            blockId,
          });
        } else {
          addRequiredBlock(ctx, target, 'Door', 'Exact Name', 'Checked if open');
        }
        expr = `IsDoorOpen("${escapeCSharpString(target)}")`;
        break;
      case 'connector_connected':
        ctx.helpers.add('connector_state');
        if (target) {
          addRequiredBlock(ctx, target, 'Connector', 'Exact Name', 'Checked for docked connection');
        }
        expr = `IsConnectorStatus("${escapeCSharpString(target)}", MyShipConnectorStatus.Connected)`;
        break;
      case 'connector_ready':
        ctx.helpers.add('connector_state');
        if (target) addRequiredBlock(ctx, target, 'Connector', 'Exact Name', 'Checked if ready to lock');
        expr = `IsConnectorStatus("${escapeCSharpString(target)}", MyShipConnectorStatus.Connectable)`;
        break;
      case 'sensor_active':
        ctx.helpers.add('sensor_active');
        if (!target) {
          ctx.issues.push({
            severity: 'warning',
            message: 'If Condition (Sensor Detecting) needs a Sensor name.',
            blockId,
          });
        } else {
          addRequiredBlock(ctx, target, 'Sensor', 'Exact Name', 'Checked for entity detection');
        }
        expr = `IsSensorActive("${escapeCSharpString(target)}")`;
        break;
      case 'turret_has_target':
        ctx.helpers.add('turret_target');
        addRequiredBlock(
          ctx,
          target || 'Ship Turrets',
          'Turret(s)',
          target ? 'Name Tag' : 'All on Ship',
          'Monitored for hostile targets'
        );
        expr = `AnyTurretHasTarget("${escapeCSharpString(target)}")`;
        break;
      case 'block_enabled':
        ctx.helpers.add('block_enabled');
        if (target) addRequiredBlock(ctx, target, 'Functional Block', 'Exact Name', 'Checked if turned on');
        expr = `IsBlockEnabled("${escapeCSharpString(target)}")`;
        break;
      case 'loop_enabled':
        ctx.helpers.add('loop_state');
        expr = '_loopEnabled';
        break;
    }
    return boolExpect ? expr : `!${expr}`;
  }

  let lhs = '0.0';
  switch (source) {
    case 'battery_pct':
      ctx.helpers.add('battery_pct');
      addRequiredBlock(ctx, 'Ship Batteries', 'Battery', 'All on Ship', 'Monitored charge level');
      lhs = 'GetBatteryPercent("")';
      break;
    case 'h2_pct':
      ctx.helpers.add('gas_pct');
      addRequiredBlock(ctx, 'Hydrogen Tanks', 'Hydrogen Tank', 'All on Ship', 'Monitored H2 level');
      lhs = 'GetGasPercent(true, "")';
      break;
    case 'o2_pct':
      ctx.helpers.add('gas_pct');
      addRequiredBlock(ctx, 'Oxygen Tanks', 'Oxygen Tank', 'All on Ship', 'Monitored O2 level');
      lhs = 'GetGasPercent(false, "")';
      break;
    case 'cargo_pct':
      ctx.helpers.add('cargo_pct');
      addRequiredBlock(ctx, 'Cargo Containers', 'Cargo / Inventory', 'All on Ship', 'Monitored cargo fill %');
      lhs = 'GetCargoPercent("")';
      break;
    case 'vent_o2_pct':
      ctx.helpers.add('vent_o2');
      if (!target) {
        ctx.issues.push({
          severity: 'warning',
          message: 'If Condition (Air Vent Oxygen %) needs an Air Vent name.',
          blockId,
        });
      } else {
        addRequiredBlock(ctx, target, 'Air Vent', 'Exact Name', 'Monitored room oxygen %');
      }
      lhs = `GetVentOxygenPercent("${escapeCSharpString(target)}")`;
      break;
    case 'ship_speed':
      ctx.helpers.add('ship_speed');
      addRequiredBlock(ctx, 'Cockpit / Remote Control', 'Ship Controller', 'All on Ship', 'Reads ship velocity');
      lhs = 'GetShipSpeed()';
      break;
    case 'gravity_g':
      ctx.helpers.add('gravity_g');
      addRequiredBlock(ctx, 'Cockpit / Remote Control', 'Ship Controller', 'All on Ship', 'Reads planetary gravity');
      lhs = 'GetGravityG()';
      break;
    case 'solar_mw':
      ctx.helpers.add('solar_mw');
      addRequiredBlock(ctx, 'Solar Panels', 'Solar Panel', 'All on Ship', 'Reads solar power output');
      lhs = 'GetSolarOutputMW()';
      break;
    case 'reactor_mw':
      ctx.helpers.add('reactor_mw');
      addRequiredBlock(ctx, 'Reactors', 'Reactor', 'All on Ship', 'Reads reactor output');
      lhs = 'GetReactorOutputMW()';
      break;
    case 'projector_remaining':
      ctx.helpers.add('projector_remaining');
      if (target) addRequiredBlock(ctx, target, 'Projector', 'Exact Name', 'Reads remaining blueprint blocks');
      lhs = `GetProjectorRemaining("${escapeCSharpString(target)}")`;
      break;
    case 'item_count': {
      ctx.helpers.add('item_count');
      const sub = itemSubtype.trim();
      if (!sub) {
        ctx.issues.push({
          severity: 'warning',
          message: 'If Condition (Item Amount) needs an Item ID (e.g. Iron, Uranium, SteelPlate).',
          blockId,
        });
      }
      lhs = `GetItemCount("${escapeCSharpString(itemCategory)}", "${escapeCSharpString(sub)}")`;
      break;
    }
    case 'loop_value':
      ctx.helpers.add('loop_state');
      lhs = '_loopValue';
      break;
    case 'loop_index':
      ctx.helpers.add('loop_state');
      lhs = '_loopIndex';
      break;
    case 'loop_count':
      ctx.helpers.add('loop_state');
      lhs = '_loopCount';
      break;
    case 'variable': {
      ctx.helpers.add('vars');
      const vn = varName.trim() || 'state';
      const trimmedVal = rawVal.trim();
      const isVarToken = /^\{[a-zA-Z0-9_]+\}$/.test(trimmedVal);
      if (!isVarToken && Number.isNaN(Number(trimmedVal)) && (safeOp === '==' || safeOp === '!=')) {
        const cmp = `GetTextVar("${escapeCSharpString(vn)}").Equals("${escapeCSharpString(rawVal)}", StringComparison.OrdinalIgnoreCase)`;
        return safeOp === '==' ? cmp : `!${cmp}`;
      }
      lhs = `GetVar("${escapeCSharpString(vn)}")`;
      break;
    }
  }

  const rhs = numericOperandExpr(rawVal, ctx);
  return `${lhs} ${safeOp} ${rhs}`;
}

function emitConditionExpr(block: ScriptBlock, ctx: GenContext): string {
  const first = emitSingleCondition(
    block.id,
    strVal(block.params.source, 'battery_pct') as ConditionSource,
    strVal(block.params.target).trim(),
    strVal(block.params.operator, '<'),
    strVal(block.params.boolExpect, 'true') === 'true',
    strVal(block.params.value, '0'),
    strVal(block.params.varName, 'state'),
    strVal(block.params.itemCategory, 'MyObjectBuilder_Ingot'),
    strVal(block.params.itemSubtype, 'Uranium'),
    ctx
  );

  const join = strVal(block.params.logicJoin, 'none');
  if (join === 'AND' || join === 'OR') {
    const second = emitSingleCondition(
      block.id,
      strVal(block.params.source2, 'connector_connected') as ConditionSource,
      strVal(block.params.target2).trim(),
      strVal(block.params.operator2, '<'),
      strVal(block.params.boolExpect2, 'false') === 'true',
      strVal(block.params.value2, '0'),
      strVal(block.params.varName2, 'state'),
      'MyObjectBuilder_Ingot',
      'Uranium',
      ctx
    );
    const op = join === 'AND' ? '&&' : '||';
    return `(${first}) ${op} (${second})`;
  }

  return first;
}

function emitBlockList(blocks: ScriptBlock[], indent: string, ctx: GenContext): string[] {
  const lines: string[] = [];

  for (const block of blocks) {
    if (block.disabled) continue;

    const def = BLOCK_MAP[block.type];
    if (def?.guiWidget && !ctx.insideGuiScreen) {
      ctx.issues.push({
        severity: 'warning',
        message: `"${def.label}" must be placed inside a "GUI Screen Canvas" block.`,
        blockId: block.id,
      });
      lines.push(`${indent}// Skipped "${def.label}" — drag this block inside a GUI Screen Canvas`);
      continue;
    }

    switch (block.type) {
      case 'on_setup':
        break;

      // ======================== MODERN VECTOR GUI BLOCKS ========================
      case 'gui_screen': {
        if (ctx.insideGuiScreen) {
          ctx.issues.push({
            severity: 'warning',
            message: 'GUI Screen Canvas cannot be nested inside another GUI Screen Canvas.',
            blockId: block.id,
          });
          break;
        }
        ctx.helpers.add('gui_core');
        const lcdName = strVal(block.params.lcdName, 'Status LCD').trim();
        const surfIdx = Math.max(0, Math.round(numVal(block.params.surfaceIndex, 0)));
        const bg = colorExpr(block.params.bgColor, '#08111A');
        const accent = colorExpr(block.params.frameColor, '#2B9FD9');
        const showFrame = Boolean(block.params.showFrame);
        const showGrid = Boolean(block.params.showGrid);

        if (!lcdName) {
          ctx.issues.push({
            severity: 'warning',
            message: 'GUI Screen Canvas needs an LCD Panel or Cockpit block name.',
            blockId: block.id,
          });
        } else {
          addRequiredBlock(
            ctx,
            lcdName,
            surfIdx > 0 ? `Cockpit / Screen #${surfIdx}` : 'LCD Panel or Cockpit',
            'Exact Name',
            'Renders modern vector GUI HUD'
          );
        }

        lines.push(`${indent}{`);
        lines.push(
          `${indent}    IMyTextSurface _guiSurf = GetGuiSurface("${escapeCSharpString(lcdName)}", ${surfIdx}, ${bg});`
        );
        lines.push(`${indent}    if (_guiSurf != null)`);
        lines.push(`${indent}    {`);
        lines.push(
          `${indent}        RectangleF _guiVp = new RectangleF((_guiSurf.TextureSize - _guiSurf.SurfaceSize) / 2f, _guiSurf.SurfaceSize);`
        );
        lines.push(`${indent}        float _guiY = _guiVp.Y + Math.Max(8f, _guiVp.Height * 0.03f);`);
        lines.push(`${indent}        using (MySpriteDrawFrame _guiFrame = _guiSurf.DrawFrame())`);
        lines.push(`${indent}        {`);
        lines.push(
          `${indent}            GuiDrawBackdrop(_guiFrame, _guiVp, ${accent}, ${showFrame ? 'true' : 'false'}, ${showGrid ? 'true' : 'false'});`
        );
        ctx.insideGuiScreen = true;
        const inner = emitBlockList(block.children ?? [], indent + '            ', ctx);
        ctx.insideGuiScreen = false;
        if (inner.length > 0) lines.push(...inner);
        else lines.push(`${indent}            // Add GUI widgets inside this GUI Screen Canvas`);
        lines.push(`${indent}        }`);
        lines.push(`${indent}    }`);
        lines.push(`${indent}}`);
        break;
      }

      case 'gui_header': {
        ctx.helpers.add('gui_core');
        ctx.helpers.add('gui_header');
        const titleExpr = templateExpr(strVal(block.params.title, 'SHIP TELEMETRY'), ctx);
        const badgeExpr = templateExpr(strVal(block.params.badge, ''), ctx);
        const accent = colorExpr(block.params.accentColor, '#38A3D1');
        lines.push(
          `${indent}GuiDrawHeader(_guiFrame, _guiVp, ref _guiY, ${titleExpr}, ${badgeExpr}, ${accent});`
        );
        break;
      }

      case 'gui_bar': {
        ctx.helpers.add('gui_core');
        ctx.helpers.add('gui_bar');
        const labelExpr = templateExpr(strVal(block.params.label, 'BATTERY'), ctx);
        const source = strVal(block.params.source, 'battery_pct');
        const target = strVal(block.params.target);
        const style = strVal(block.params.style, 'segmented');
        const icon = strVal(block.params.icon, 'none');
        const colorMode = strVal(block.params.colorMode, 'auto');
        const customCol = colorExpr(block.params.color, '#22C55E');
        const pctExpr = guiPercentSourceExpr(source, target, ctx, block.id);
        lines.push(
          `${indent}GuiDrawBar(_guiFrame, _guiVp, ref _guiY, ${labelExpr}, ${pctExpr}, "${escapeCSharpString(style)}", "${escapeCSharpString(icon)}", "${escapeCSharpString(colorMode)}", ${customCol});`
        );
        break;
      }

      case 'gui_gauges': {
        ctx.helpers.add('gui_core');
        ctx.helpers.add('gui_gauges');
        const count = strVal(block.params.count, '3') === '2' ? 2 : 3;
        const labels: string[] = [];
        const vals: string[] = [];
        for (let i = 1; i <= count; i++) {
          labels.push(`"${escapeCSharpString(strVal(block.params[`label${i}`], `GAUGE ${i}`))}"`);
          vals.push(
            guiPercentSourceExpr(
              strVal(block.params[`source${i}`], 'battery_pct'),
              '',
              ctx,
              block.id
            )
          );
        }
        lines.push(
          `${indent}GuiDrawGauges(_guiFrame, _guiVp, ref _guiY, new string[] { ${labels.join(', ')} }, new double[] { ${vals.join(', ')} });`
        );
        break;
      }

      case 'gui_metrics': {
        ctx.helpers.add('gui_core');
        ctx.helpers.add('gui_metrics');
        const count = strVal(block.params.count, '3') === '2' ? 2 : 3;
        const accent = colorExpr(block.params.accentColor, '#38A3D1');
        const labels: string[] = [];
        const vals: string[] = [];
        for (let i = 1; i <= count; i++) {
          labels.push(`"${escapeCSharpString(strVal(block.params[`label${i}`], `STAT ${i}`))}"`);
          vals.push(templateExpr(strVal(block.params[`val${i}`], '0'), ctx));
        }
        lines.push(
          `${indent}GuiDrawMetrics(_guiFrame, _guiVp, ref _guiY, ${accent}, new string[] { ${labels.join(', ')} }, new string[] { ${vals.join(', ')} });`
        );
        break;
      }

      case 'gui_alert': {
        ctx.helpers.add('gui_core');
        ctx.helpers.add('gui_alert');
        const severity = strVal(block.params.severity, 'critical');
        const msgExpr = templateExpr(strVal(block.params.message, 'ALERT'), ctx);
        lines.push(
          `${indent}GuiDrawAlert(_guiFrame, _guiVp, ref _guiY, "${escapeCSharpString(severity)}", ${msgExpr});`
        );
        break;
      }

      case 'gui_inventory': {
        ctx.helpers.add('gui_core');
        ctx.helpers.add('gui_bar');
        ctx.helpers.add('format_num');
        ctx.helpers.add('gui_inventory');
        const category = strVal(block.params.category, 'all');
        const sortBy = strVal(block.params.sortBy, 'amount_desc');
        const maxItems = Math.max(1, Math.round(numVal(block.params.maxItems, 8)));
        const accent = colorExpr(block.params.accentColor, '#38D9A9');
        const filter = strVal(block.params.containerFilter).trim();
        addRequiredBlock(
          ctx,
          filter || 'Cargo / Refineries / Assemblers',
          'Inventory Blocks',
          filter ? 'Name Tag' : 'All on Ship',
          'Scanned for GUI inventory bars'
        );
        lines.push(
          `${indent}GuiDrawInventory(_guiFrame, _guiVp, ref _guiY, "${escapeCSharpString(category)}", "${escapeCSharpString(sortBy)}", ${maxItems}, ${accent}, "${escapeCSharpString(filter)}");`
        );
        break;
      }

      case 'gui_text': {
        ctx.helpers.add('gui_core');
        ctx.helpers.add('gui_text');
        const txtExpr = templateExpr(strVal(block.params.text, ''), ctx);
        const size = strVal(block.params.size, 'body');
        const align = strVal(block.params.align, 'CENTER');
        const safeAlign = ['LEFT', 'CENTER', 'RIGHT'].includes(align) ? align : 'CENTER';
        const col = colorExpr(block.params.color, '#E2E8F0');
        lines.push(
          `${indent}GuiDrawText(_guiFrame, _guiVp, ref _guiY, ${txtExpr}, "${escapeCSharpString(size)}", TextAlignment.${safeAlign}, ${col});`
        );
        break;
      }

      case 'gui_divider': {
        ctx.helpers.add('gui_core');
        ctx.helpers.add('gui_divider');
        const lblExpr = templateExpr(strVal(block.params.label, '').trim(), ctx);
        const col = colorExpr(block.params.color, '#334155');
        lines.push(
          `${indent}GuiDrawDivider(_guiFrame, _guiVp, ref _guiY, ${lblExpr}, ${col});`
        );
        break;
      }

      // ======================== CONTROL & LOGIC ========================
      case 'comment': {
        const note = strVal(block.params.text).replace(/\r?\n/g, ' ').trim();
        if (note) lines.push(`${indent}// ${note}`);
        break;
      }

      case 'on_argument': {
        const arg = strVal(block.params.argument, 'toggle').trim();
        if (arg) ctx.detectedArguments.add(arg);
        lines.push(
          `${indent}if (argument.Equals("${escapeCSharpString(arg)}", StringComparison.OrdinalIgnoreCase))`
        );
        lines.push(`${indent}{`);
        const inner = emitBlockList(block.children ?? [], indent + '    ', ctx);
        if (inner.length === 0) {
          lines.push(`${indent}    // Add action blocks inside this argument trigger`);
        } else {
          lines.push(...inner);
        }
        lines.push(`${indent}}`);
        break;
      }

      case 'if_condition': {
        const cond = emitConditionExpr(block, ctx);
        lines.push(`${indent}if (${cond})`);
        lines.push(`${indent}{`);
        const thenLines = emitBlockList(block.children ?? [], indent + '    ', ctx);
        if (thenLines.length === 0) {
          lines.push(`${indent}    // Actions when condition is true`);
        } else {
          lines.push(...thenLines);
        }
        lines.push(`${indent}}`);
        if (block.params.hasElse) {
          lines.push(`${indent}else`);
          lines.push(`${indent}{`);
          const elseLines = emitBlockList(block.elseChildren ?? [], indent + '    ', ctx);
          if (elseLines.length === 0) {
            lines.push(`${indent}    // Actions when condition is false`);
          } else {
            lines.push(...elseLines);
          }
          lines.push(`${indent}}`);
        }
        break;
      }

      case 'define_function':
        // Emitted as a dedicated method on Program in generateSpaceEngineersScript
        break;

      case 'call_function': {
        const rawName = strVal(block.params.name, 'ManagePower').trim();
        const key = rawName.toLowerCase();
        const methodName = ctx.definedFunctions.get(key) || sanitizeMethodName(rawName);
        if (!ctx.definedFunctions.has(key)) {
          ctx.issues.push({
            severity: 'warning',
            message: `Call Function "${rawName || '(empty)'}" has no matching "Define Function" block.`,
            blockId: block.id,
          });
          lines.push(`${indent}// Warning: Define Function "${escapeCSharpString(rawName)}" not found`);
        } else {
          lines.push(`${indent}${methodName}();`);
        }
        break;
      }

      case 'for_each_block': {
        ctx.helpers.add('loop_state');
        ctx.helpers.add('loop_query');
        const bType = strVal(block.params.blockType, 'functional');
        const mMode = strVal(block.params.matchMode, 'tag');
        const flt = strVal(block.params.filter).trim();
        const depth = ctx.loopDepth++;
        const listVar = `_loopList${depth}`;
        const idxVar = `_li${depth}`;

        const reqMode: RequiredShipBlock['matchMode'] =
          mMode === 'group' ? 'Group' : mMode === 'tag' ? 'Name Tag' : 'All on Ship';
        addRequiredBlock(
          ctx,
          mMode === 'all' ? `All ${bType}` : flt || `Matching ${bType}`,
          bType,
          reqMode,
          'Iterated in For Each Block loop'
        );

        lines.push(
          `${indent}List<IMyTerminalBlock> ${listVar} = QueryLoopBlocks("${escapeCSharpString(bType)}", "${escapeCSharpString(mMode)}", "${escapeCSharpString(flt)}");`
        );
        lines.push(`${indent}_loopCount = ${listVar}.Count;`);
        lines.push(`${indent}for (int ${idxVar} = 0; ${idxVar} < ${listVar}.Count; ${idxVar}++)`);
        lines.push(`${indent}{`);
        lines.push(`${indent}    _loopBlock = ${listVar}[${idxVar}];`);
        lines.push(`${indent}    _loopIndex = ${idxVar};`);
        lines.push(`${indent}    _loopName = _loopBlock.CustomName;`);
        lines.push(`${indent}    _loopData = _loopBlock.CustomData;`);
        lines.push(`${indent}    IMyFunctionalBlock _fb${depth} = _loopBlock as IMyFunctionalBlock;`);
        lines.push(`${indent}    _loopEnabled = _fb${depth} != null && _fb${depth}.Enabled;`);
        lines.push(`${indent}    _loopValue = ReadBlockPrimaryValue(_loopBlock);`);
        const inner = emitBlockList(block.children ?? [], indent + '    ', ctx);
        if (inner.length > 0) lines.push(...inner);
        else lines.push(`${indent}    // Add blocks to run for each matching block`);
        lines.push(`${indent}}`);
        break;
      }

      case 'repeat_times': {
        ctx.helpers.add('vars');
        const depth = ctx.loopDepth++;
        const cntExpr = numericOperandExpr(block.params.count, ctx);
        const iv = strVal(block.params.indexVar, 'i').trim() || 'i';
        const limVar = `_repMax${depth}`;
        const idxVar = `_ri${depth}`;
        lines.push(`${indent}int ${limVar} = Math.Max(0, Math.Min(200, (int)Math.Round(${cntExpr})));`);
        lines.push(`${indent}for (int ${idxVar} = 0; ${idxVar} < ${limVar}; ${idxVar}++)`);
        lines.push(`${indent}{`);
        lines.push(`${indent}    SetVar("${escapeCSharpString(iv)}", ${idxVar});`);
        const inner = emitBlockList(block.children ?? [], indent + '    ', ctx);
        if (inner.length > 0) lines.push(...inner);
        lines.push(`${indent}}`);
        break;
      }

      case 'cooldown': {
        const sec = Math.max(0.1, numVal(block.params.seconds, 5));
        const timerIndex = ctx.cooldownTimers.length + 1;
        const fieldName = `_cooldownTimer${timerIndex}`;
        ctx.cooldownTimers.push(fieldName);
        lines.push(`${indent}${fieldName} += Runtime.TimeSinceLastRun.TotalSeconds;`);
        lines.push(`${indent}if (${fieldName} >= ${sec})`);
        lines.push(`${indent}{`);
        lines.push(`${indent}    ${fieldName} = 0.0;`);
        const inner = emitBlockList(block.children ?? [], indent + '    ', ctx);
        if (inner.length > 0) lines.push(...inner);
        lines.push(`${indent}}`);
        break;
      }

      case 'set_variable': {
        ctx.helpers.add('vars');
        const vn = strVal(block.params.varName, 'val').trim() || 'val';
        const src = strVal(block.params.source, 'battery_pct');
        if (src === 'text') {
          lines.push(
            `${indent}SetTextVar("${escapeCSharpString(vn)}", ${templateExpr(strVal(block.params.value), ctx)});`
          );
        } else if (src === 'loop_name') {
          ctx.helpers.add('loop_state');
          lines.push(`${indent}SetTextVar("${escapeCSharpString(vn)}", _loopName);`);
        } else if (src === 'number') {
          lines.push(`${indent}SetVar("${escapeCSharpString(vn)}", ${numericOperandExpr(block.params.value, ctx)});`);
        } else {
          let expr = '0.0';
          switch (src) {
            case 'battery_pct':
              ctx.helpers.add('battery_pct');
              expr = 'GetBatteryPercent("")';
              break;
            case 'h2_pct':
              ctx.helpers.add('gas_pct');
              expr = 'GetGasPercent(true, "")';
              break;
            case 'o2_pct':
              ctx.helpers.add('gas_pct');
              expr = 'GetGasPercent(false, "")';
              break;
            case 'cargo_pct':
              ctx.helpers.add('cargo_pct');
              expr = 'GetCargoPercent("")';
              break;
            case 'vent_o2_pct': {
              ctx.helpers.add('vent_o2');
              const t = strVal(block.params.target).trim();
              if (t) addRequiredBlock(ctx, t, 'Air Vent', 'Exact Name', 'Read oxygen %');
              expr = `GetVentOxygenPercent("${escapeCSharpString(t)}")`;
              break;
            }
            case 'ship_speed':
              ctx.helpers.add('ship_speed');
              expr = 'GetShipSpeed()';
              break;
            case 'gravity_g':
              ctx.helpers.add('gravity_g');
              expr = 'GetGravityG()';
              break;
            case 'solar_mw':
              ctx.helpers.add('solar_mw');
              expr = 'GetSolarOutputMW()';
              break;
            case 'reactor_mw':
              ctx.helpers.add('reactor_mw');
              expr = 'GetReactorOutputMW()';
              break;
            case 'item_count': {
              ctx.helpers.add('item_count');
              const cat = strVal(block.params.itemCategory, 'MyObjectBuilder_Ore');
              const sub = strVal(block.params.itemSubtype, 'Ice');
              expr = `GetItemCount("${escapeCSharpString(cat)}", "${escapeCSharpString(sub)}")`;
              break;
            }
            case 'loop_value':
              ctx.helpers.add('loop_state');
              expr = '_loopValue';
              break;
            case 'loop_index':
              ctx.helpers.add('loop_state');
              expr = '(double)_loopIndex';
              break;
            case 'loop_count':
              ctx.helpers.add('loop_state');
              expr = '(double)_loopCount';
              break;
            case 'loop_enabled':
              ctx.helpers.add('loop_state');
              expr = '(_loopEnabled ? 1.0 : 0.0)';
              break;
          }
          lines.push(`${indent}SetVar("${escapeCSharpString(vn)}", ${expr});`);
        }
        break;
      }

      case 'math_op': {
        ctx.helpers.add('vars');
        const dest = strVal(block.params.destVar, 'result').trim() || 'result';
        const leftExpr = numericOperandExpr(block.params.left, ctx);
        const rightExpr = numericOperandExpr(block.params.right, ctx);
        const op = strVal(block.params.op, '+');
        let rhs = '0.0';
        switch (op) {
          case '+':
            rhs = `(${leftExpr}) + (${rightExpr})`;
            break;
          case '-':
            rhs = `(${leftExpr}) - (${rightExpr})`;
            break;
          case '*':
            rhs = `(${leftExpr}) * (${rightExpr})`;
            break;
          case '/':
            rhs = `((${rightExpr}) != 0.0 ? ((${leftExpr}) / (${rightExpr})) : 0.0)`;
            break;
          case '%':
            rhs = `((${rightExpr}) != 0.0 ? ((${leftExpr}) % (${rightExpr})) : 0.0)`;
            break;
          case 'min':
            rhs = `Math.Min(${leftExpr}, ${rightExpr})`;
            break;
          case 'max':
            rhs = `Math.Max(${leftExpr}, ${rightExpr})`;
            break;
          case 'round':
            rhs = `Math.Round(${leftExpr})`;
            break;
          default:
            rhs = `(${leftExpr}) + (${rightExpr})`;
        }
        lines.push(`${indent}SetVar("${escapeCSharpString(dest)}", ${rhs});`);
        break;
      }

      case 'change_variable': {
        ctx.helpers.add('vars');
        const vn = strVal(block.params.varName, 'counter').trim() || 'counter';
        const delta = numVal(block.params.delta, 1);
        lines.push(`${indent}SetVar("${escapeCSharpString(vn)}", GetVar("${escapeCSharpString(vn)}") + (${delta}));`);
        break;
      }

      case 'read_block_prop': {
        ctx.helpers.add('vars');
        ctx.helpers.add('read_block_prop');
        const vn = strVal(block.params.varName, 'val').trim() || 'val';
        const mode = strVal(block.params.targetMode, 'named');
        const bName = strVal(block.params.blockName).trim();
        const prop = strVal(block.params.property, 'enabled');

        if (mode === 'tag_count') {
          if (bName) addRequiredBlock(ctx, bName, 'Terminal Block', 'Name Tag', 'Counted by tag');
          lines.push(`${indent}SetVar("${escapeCSharpString(vn)}", CountBlocksByTag("${escapeCSharpString(bName)}"));`);
        } else {
          const blkRef =
            mode === 'loop'
              ? (ctx.helpers.add('loop_state'), '_loopBlock')
              : `GridTerminalSystem.GetBlockWithName("${escapeCSharpString(bName)}")`;
          if (mode === 'named' && bName) {
            addRequiredBlock(ctx, bName, 'Terminal Block', 'Exact Name', `Read property: ${prop}`);
          }
          if (prop === 'custom_data') {
            lines.push(
              `${indent}SetTextVar("${escapeCSharpString(vn)}", ReadBlockCustomData(${blkRef}));`
            );
          } else {
            lines.push(
              `${indent}SetVar("${escapeCSharpString(vn)}", ReadBlockProp(${blkRef}, "${escapeCSharpString(prop)}"));`
            );
          }
        }
        break;
      }

      case 'custom_data_io': {
        ctx.helpers.add('vars');
        ctx.helpers.add('custom_data_ini');
        const mode = strVal(block.params.mode, 'read_ini');
        const target = strVal(block.params.target, 'self');
        const bName = strVal(block.params.blockName).trim();
        const iniKey = strVal(block.params.iniKey, 'minBatt').trim();
        const vn = strVal(block.params.varName, 'minBatt').trim() || 'minBatt';
        const fbOrTxt = strVal(block.params.fallbackOrText, '25');

        const blkRef =
          target === 'self'
            ? 'Me'
            : target === 'loop'
            ? (ctx.helpers.add('loop_state'), '_loopBlock')
            : `GridTerminalSystem.GetBlockWithName("${escapeCSharpString(bName)}")`;
        if (target === 'named' && bName) {
          addRequiredBlock(ctx, bName, 'Terminal Block', 'Exact Name', 'CustomData I/O');
        }

        if (mode === 'write') {
          lines.push(`${indent}if (${blkRef} != null) ${blkRef}.CustomData = ${templateExpr(fbOrTxt, ctx)};`);
        } else if (mode === 'read_all') {
          lines.push(
            `${indent}SetTextVar("${escapeCSharpString(vn)}", ${blkRef} != null ? ${blkRef}.CustomData : "");`
          );
        } else {
          lines.push(
            `${indent}ReadIniIntoVar(${blkRef}, "${escapeCSharpString(iniKey)}", "${escapeCSharpString(vn)}", "${escapeCSharpString(fbOrTxt)}");`
          );
        }
        break;
      }

      case 'loop_block_action': {
        ctx.helpers.add('loop_state');
        ctx.helpers.add('loop_block_action');
        const act = strVal(block.params.action, 'off');
        const col = colorExpr(block.params.color, '#FF3B30');
        const idStr = strVal(block.params.actionOrProp, 'OnOff_Off').trim();
        const valTextExpr = templateExpr(strVal(block.params.value, ''), ctx);
        const valNumExpr = numericOperandExpr(block.params.value, ctx);
        lines.push(
          `${indent}RunLoopBlockAction(_loopBlock, "${escapeCSharpString(act)}", ${col}, "${escapeCSharpString(idStr)}", ${valTextExpr}, ${valNumExpr});`
        );
        break;
      }

      case 'terminal_action': {
        ctx.helpers.add('terminal_action');
        const tMode = strVal(block.params.targetMode, 'block');
        const name = strVal(block.params.name).trim();
        const opKind = strVal(block.params.opKind, 'action');
        const propId = strVal(block.params.propId, 'ShootOnce').trim();
        const rawVal = strVal(block.params.value, '0').trim();
        const numExpr = numericOperandExpr(rawVal, ctx);
        const boolLit = rawVal.toLowerCase() === 'true' || rawVal === '1' ? 'true' : 'false';

        if (tMode === 'loop') {
          ctx.helpers.add('loop_state');
          lines.push(
            `${indent}RunTerminalOpOnBlock(_loopBlock, "${escapeCSharpString(opKind)}", "${escapeCSharpString(propId)}", ${numExpr}, ${boolLit});`
          );
        } else {
          if (name) {
            addRequiredBlock(
              ctx,
              name,
              'Terminal Block',
              tMode === 'group' ? 'Group' : tMode === 'tag' ? 'Name Tag' : 'Exact Name',
              `Terminal ${opKind}: ${propId}`
            );
          }
          lines.push(
            `${indent}RunTerminalOp("${escapeCSharpString(tMode)}", "${escapeCSharpString(name)}", "${escapeCSharpString(opKind)}", "${escapeCSharpString(propId)}", ${numExpr}, ${boolLit});`
          );
        }
        break;
      }

      // ======================== CLASSIC TEXT LCDS ========================
      case 'lcd_inventory': {
        ctx.helpers.add('lcd_core');
        ctx.helpers.add('bar');
        ctx.helpers.add('format_num');
        ctx.helpers.add('lcd_inventory');
        const lcdName = strVal(block.params.lcdName, 'Inventory LCD').trim();
        const title = strVal(block.params.title, 'SHIP INVENTORY');
        const category = strVal(block.params.category, 'all');
        const sortBy = strVal(block.params.sortBy, 'amount_desc');
        const showBar = Boolean(block.params.showBar);
        const maxItems = Math.max(1, Math.round(numVal(block.params.maxItems, 14)));
        const filter = strVal(block.params.containerFilter).trim();
        if (!lcdName) {
          ctx.issues.push({
            severity: 'warning',
            message: 'Text Inventory List needs an LCD Panel name.',
            blockId: block.id,
          });
        } else {
          addRequiredBlock(ctx, lcdName, 'LCD Panel', 'Exact Name', 'Displays live ship inventory');
        }
        addRequiredBlock(
          ctx,
          filter || 'Cargo / Refineries / Assemblers',
          'Inventory Blocks',
          filter ? 'Name Tag' : 'All on Ship',
          'Scanned for items'
        );
        lines.push(
          `${indent}ShowInventoryOnLcd("${escapeCSharpString(lcdName)}", "${escapeCSharpString(title)}", "${escapeCSharpString(category)}", "${escapeCSharpString(sortBy)}", ${showBar ? 'true' : 'false'}, ${maxItems}, "${escapeCSharpString(filter)}");`
        );
        break;
      }

      case 'lcd_power': {
        ctx.helpers.add('lcd_core');
        ctx.helpers.add('bar');
        ctx.helpers.add('lcd_power');
        const lcdName = strVal(block.params.lcdName, 'Power LCD').trim();
        const title = strVal(block.params.title, 'POWER TELEMETRY');
        const showSources = Boolean(block.params.showSources);
        const showBar = Boolean(block.params.showBar);
        const append = Boolean(block.params.append);
        if (lcdName) addRequiredBlock(ctx, lcdName, 'LCD Panel', 'Exact Name', 'Displays power telemetry');
        addRequiredBlock(ctx, 'Ship Batteries', 'Battery', 'All on Ship', 'Power status telemetry');
        lines.push(
          `${indent}ShowPowerOnLcd("${escapeCSharpString(lcdName)}", "${escapeCSharpString(title)}", ${showSources ? 'true' : 'false'}, ${showBar ? 'true' : 'false'}, ${append ? 'true' : 'false'});`
        );
        break;
      }

      case 'lcd_gas': {
        ctx.helpers.add('lcd_core');
        ctx.helpers.add('bar');
        ctx.helpers.add('lcd_gas');
        const lcdName = strVal(block.params.lcdName, 'Status LCD').trim();
        const title = strVal(block.params.title, 'GAS STORAGE');
        const gasType = strVal(block.params.gasType, 'both');
        const showBar = Boolean(block.params.showBar);
        const append = Boolean(block.params.append);
        if (lcdName) addRequiredBlock(ctx, lcdName, 'LCD Panel', 'Exact Name', 'Displays H2/O2 tank gauges');
        addRequiredBlock(ctx, 'Gas Tanks', 'H2 / O2 Tank', 'All on Ship', 'Gas level telemetry');
        lines.push(
          `${indent}ShowGasOnLcd("${escapeCSharpString(lcdName)}", "${escapeCSharpString(title)}", "${escapeCSharpString(gasType)}", ${showBar ? 'true' : 'false'}, ${append ? 'true' : 'false'});`
        );
        break;
      }

      case 'lcd_clear': {
        ctx.helpers.add('lcd_core');
        const lcdName = strVal(block.params.lcdName, 'Status LCD').trim();
        if (lcdName) addRequiredBlock(ctx, lcdName, 'LCD Panel', 'Exact Name', 'Cleared and updated');
        lines.push(`${indent}WriteToLcd("${escapeCSharpString(lcdName)}", "", false);`);
        break;
      }

      case 'lcd_write': {
        ctx.helpers.add('lcd_core');
        const lcdName = strVal(block.params.lcdName, 'Status LCD').trim();
        const append = Boolean(block.params.append);
        if (lcdName) addRequiredBlock(ctx, lcdName, 'LCD Panel', 'Exact Name', 'Custom text display');
        const textArg = templateExpr(strVal(block.params.text), ctx);
        lines.push(
          `${indent}WriteToLcd("${escapeCSharpString(lcdName)}", ${textArg} + "\\n", ${append ? 'true' : 'false'});`
        );
        break;
      }

      case 'lcd_style': {
        ctx.helpers.add('lcd_core');
        ctx.helpers.add('lcd_style');
        const lcdName = strVal(block.params.lcdName, 'Status LCD').trim();
        const font = strVal(block.params.font, 'Monospace');
        const fontSize = numVal(block.params.fontSize, 1.0);
        const fg = colorExpr(block.params.fontColor, '#38D9A9');
        const bg = colorExpr(block.params.bgColor, '#0A1118');
        const align = strVal(block.params.alignment, 'LEFT');
        const safeAlign = ['LEFT', 'CENTER', 'RIGHT'].includes(align) ? align : 'LEFT';
        if (lcdName) addRequiredBlock(ctx, lcdName, 'LCD Panel', 'Exact Name', 'Styled font & colors');
        lines.push(
          `${indent}StyleLcd("${escapeCSharpString(lcdName)}", "${escapeCSharpString(font)}", ${fontSize}f, ${fg}, ${bg}, TextAlignment.${safeAlign});`
        );
        break;
      }

      case 'pb_echo': {
        const msgExpr = templateExpr(strVal(block.params.text), ctx);
        lines.push(`${indent}Echo(${msgExpr});`);
        break;
      }

      // ======================== HABITAT, SYSTEMS & AUTOMATION ========================
      case 'door_action': {
        ctx.helpers.add('door_action');
        const mode = strVal(block.params.targetMode, 'block');
        const name = strVal(block.params.name, 'Airlock Door').trim();
        const action = strVal(block.params.action, 'close');
        addRequiredBlock(
          ctx,
          name,
          'Door',
          mode === 'group' ? 'Group' : mode === 'tag' ? 'Name Tag' : 'Exact Name',
          `Door action: ${action}`
        );
        lines.push(
          `${indent}ControlDoors("${escapeCSharpString(mode)}", "${escapeCSharpString(name)}", "${escapeCSharpString(action)}");`
        );
        break;
      }

      case 'airvent_action': {
        ctx.helpers.add('airvent_action');
        const name = strVal(block.params.name, 'Airlock Vent').trim();
        const action = strVal(block.params.action, 'depressurize');
        if (name) addRequiredBlock(ctx, name, 'Air Vent', 'Exact Name', `Air vent: ${action}`);
        lines.push(`${indent}ControlAirVent("${escapeCSharpString(name)}", "${escapeCSharpString(action)}");`);
        break;
      }

      case 'light_action': {
        ctx.helpers.add('light_action');
        const mode = strVal(block.params.targetMode, 'group');
        const name = strVal(block.params.name, 'Bridge Lights').trim();
        const action = strVal(block.params.action, 'style');
        const col = colorExpr(block.params.color, '#FF3B30');
        const blink = Math.max(0, numVal(block.params.blinkSeconds, 0));
        addRequiredBlock(
          ctx,
          mode === 'all' ? 'All Ship Lights' : name,
          'Light(s)',
          mode === 'all' ? 'All on Ship' : mode === 'group' ? 'Group' : 'Exact Name',
          action === 'style' ? 'Color / alert indicator' : `Light: ${action}`
        );
        lines.push(
          `${indent}ControlLights("${escapeCSharpString(mode)}", "${escapeCSharpString(name)}", "${escapeCSharpString(action)}", ${col}, ${blink}f);`
        );
        break;
      }

      case 'block_power': {
        ctx.helpers.add('block_power');
        const mode = strVal(block.params.targetMode, 'block');
        const name = strVal(block.params.name, 'Backup Reactor').trim();
        const action = strVal(block.params.action, 'on');
        addRequiredBlock(
          ctx,
          name,
          'Functional Block',
          mode === 'group' ? 'Group' : mode === 'tag' ? 'Name Tag' : 'Exact Name',
          `Power: ${action.toUpperCase()}`
        );
        lines.push(
          `${indent}SetBlockPower("${escapeCSharpString(mode)}", "${escapeCSharpString(name)}", "${escapeCSharpString(action)}");`
        );
        break;
      }

      case 'battery_mode': {
        ctx.helpers.add('battery_mode');
        const mode = strVal(block.params.targetMode, 'all');
        const name = strVal(block.params.name).trim();
        const chargeMode = strVal(block.params.mode, 'Auto');
        const safeMode = ['Auto', 'Recharge', 'Discharge'].includes(chargeMode) ? chargeMode : 'Auto';
        addRequiredBlock(
          ctx,
          mode === 'all' ? 'All Ship Batteries' : name,
          'Battery',
          mode === 'all' ? 'All on Ship' : mode === 'group' ? 'Group' : 'Name Tag',
          `Charge mode: ${safeMode}`
        );
        lines.push(
          `${indent}SetBatteryMode("${escapeCSharpString(mode)}", "${escapeCSharpString(name)}", ChargeMode.${safeMode});`
        );
        break;
      }

      case 'tank_stockpile': {
        ctx.helpers.add('tank_stockpile');
        const gasType = strVal(block.params.gasType, 'hydrogen');
        const stockpile = strVal(block.params.stockpile, 'on') === 'on';
        const filter = strVal(block.params.filter).trim();
        addRequiredBlock(
          ctx,
          filter || `${gasType.toUpperCase()} Tanks`,
          'Gas Tank',
          filter ? 'Name Tag' : 'All on Ship',
          `Stockpile: ${stockpile ? 'ON' : 'OFF'}`
        );
        lines.push(
          `${indent}SetTankStockpile("${escapeCSharpString(gasType)}", ${stockpile ? 'true' : 'false'}, "${escapeCSharpString(filter)}");`
        );
        break;
      }

      case 'connector_action': {
        ctx.helpers.add('connector_action');
        const name = strVal(block.params.name, 'Docking Connector').trim();
        const action = strVal(block.params.action, 'toggle');
        if (name) addRequiredBlock(ctx, name, 'Connector', 'Exact Name', `Connector: ${action}`);
        lines.push(`${indent}ControlConnector("${escapeCSharpString(name)}", "${escapeCSharpString(action)}");`);
        break;
      }

      case 'thruster_override': {
        ctx.helpers.add('thruster_override');
        const mode = strVal(block.params.targetMode, 'group');
        const name = strVal(block.params.name, 'Forward Thrusters').trim();
        const pct = Math.max(0, Math.min(100, numVal(block.params.percent, 0)));
        addRequiredBlock(
          ctx,
          mode === 'all' ? 'All Thrusters' : name,
          'Thruster(s)',
          mode === 'all' ? 'All on Ship' : mode === 'group' ? 'Group' : 'Name Tag',
          `Thrust override: ${pct}%`
        );
        lines.push(
          `${indent}SetThrusterOverride("${escapeCSharpString(mode)}", "${escapeCSharpString(name)}", ${(pct / 100).toFixed(2)}f);`
        );
        break;
      }

      case 'sound_action': {
        ctx.helpers.add('sound_action');
        const name = strVal(block.params.name, 'Alert Sound').trim();
        const action = strVal(block.params.action, 'play');
        const soundName = strVal(block.params.soundName).trim();
        if (name) addRequiredBlock(ctx, name, 'Sound Block', 'Exact Name', `Audio: ${action}`);
        lines.push(
          `${indent}ControlSound("${escapeCSharpString(name)}", "${escapeCSharpString(action)}", "${escapeCSharpString(soundName)}");`
        );
        break;
      }

      case 'timer_action': {
        ctx.helpers.add('timer_action');
        const name = strVal(block.params.name, 'Airlock Timer').trim();
        const action = strVal(block.params.action, 'trigger');
        if (name) addRequiredBlock(ctx, name, 'Timer Block', 'Exact Name', `Timer: ${action}`);
        lines.push(`${indent}ControlTimer("${escapeCSharpString(name)}", "${escapeCSharpString(action)}");`);
        break;
      }

      case 'broadcast_text': {
        ctx.helpers.add('broadcast_text');
        const devType = strVal(block.params.deviceType, 'antenna');
        const name = strVal(block.params.name, 'Ship Antenna').trim();
        const radius = Math.max(1, numVal(block.params.radius, 5000));
        const textArg = templateExpr(strVal(block.params.hudText), ctx);
        if (name) {
          addRequiredBlock(
            ctx,
            name,
            devType === 'beacon' ? 'Beacon' : 'Radio Antenna',
            'Exact Name',
            'Updates HUD broadcast text'
          );
        }
        lines.push(
          `${indent}SetBroadcastText("${escapeCSharpString(devType)}", "${escapeCSharpString(name)}", ${textArg}, ${radius}f);`
        );
        break;
      }

      case 'piston_action': {
        ctx.helpers.add('piston_action');
        const mode = strVal(block.params.targetMode, 'block');
        const name = strVal(block.params.name, 'Drill Piston').trim();
        const action = strVal(block.params.action, 'extend');
        const speed = Math.max(0.05, numVal(block.params.speed, 0.5));
        addRequiredBlock(
          ctx,
          name,
          'Piston',
          mode === 'group' ? 'Group' : 'Exact Name',
          `Piston: ${action}`
        );
        lines.push(
          `${indent}ControlPistons("${escapeCSharpString(mode)}", "${escapeCSharpString(name)}", "${escapeCSharpString(action)}", ${speed}f);`
        );
        break;
      }

      case 'rotor_action': {
        ctx.helpers.add('rotor_action');
        const mode = strVal(block.params.targetMode, 'block');
        const name = strVal(block.params.name, 'Solar Rotor').trim();
        const action = strVal(block.params.action, 'spin');
        const rpm = numVal(block.params.rpm, 2.0);
        addRequiredBlock(
          ctx,
          name,
          'Rotor / Hinge',
          mode === 'group' ? 'Group' : 'Exact Name',
          `Rotor/Hinge: ${action}`
        );
        lines.push(
          `${indent}ControlRotors("${escapeCSharpString(mode)}", "${escapeCSharpString(name)}", "${escapeCSharpString(action)}", ${rpm}f);`
        );
        break;
      }
    }
  }

  return lines;
}

const HELPER_SNIPPETS: Record<string, string> = {
  grid: `bool IsMyGrid(IMyTerminalBlock block)
{
    return !SAME_GRID_ONLY || Me.IsSameConstructAs(block);
}`,

  vars: `double GetVar(string key)
{
    double val;
    return _numVars.TryGetValue(key, out val) ? val : 0.0;
}

void SetVar(string key, double val)
{
    _numVars[key] = val;
    _strVars[key] = val.ToString("0.#");
}

string GetTextVar(string key)
{
    string val;
    return _strVars.TryGetValue(key, out val) ? val : "";
}

void SetTextVar(string key, string val)
{
    _strVars[key] = val;
}`,

  bar: `string BuildBar(double percent, int width)
{
    double clamped = Math.Max(0.0, Math.Min(100.0, percent));
    int filled = (int)Math.Round((clamped / 100.0) * width);
    return "[" + new string('#', filled) + new string('-', width - filled) + "]";
}`,

  format_num: `string FormatAmount(double amount)
{
    if (amount >= 1000000.0) return (amount / 1000000.0).ToString("0.00") + "M";
    if (amount >= 1000.0) return (amount / 1000.0).ToString("0.0") + "k";
    if (Math.Abs(amount - Math.Round(amount)) < 0.05) return Math.Round(amount).ToString("0");
    return amount.ToString("0.0");
}`,

  gui_core: `IMyTextSurface GetGuiSurface(string name, int surfaceIndex, Color bgColor)
{
    IMyTerminalBlock block = GridTerminalSystem.GetBlockWithName(name);
    if (block == null) { Echo("WARNING: Screen block not found -> " + name); return null; }
    IMyTextSurface surf = block as IMyTextSurface;
    if (surf == null)
    {
        IMyTextSurfaceProvider prov = block as IMyTextSurfaceProvider;
        if (prov != null && prov.SurfaceCount > 0)
        {
            int idx = Math.Max(0, Math.Min(surfaceIndex, prov.SurfaceCount - 1));
            surf = prov.GetSurface(idx);
        }
    }
    if (surf == null) { Echo("WARNING: Block has no text surface -> " + name); return null; }
    if (surf.ContentType != ContentType.SCRIPT) surf.ContentType = ContentType.SCRIPT;
    if (surf.Script != "") surf.Script = "";
    surf.ScriptBackgroundColor = bgColor;
    return surf;
}

void GuiRect(MySpriteDrawFrame frame, float x, float y, float w, float h, Color color, float rot = 0f)
{
    frame.Add(new MySprite()
    {
        Type = SpriteType.TEXTURE,
        Data = "SquareSimple",
        Position = new Vector2(x + w * 0.5f, y + h * 0.5f),
        Size = new Vector2(w, h),
        Color = color,
        Alignment = TextAlignment.CENTER,
        RotationOrScale = rot
    });
}

void GuiSprite(MySpriteDrawFrame frame, string spriteId, float cx, float cy, float w, float h, Color color, float rot = 0f)
{
    frame.Add(new MySprite()
    {
        Type = SpriteType.TEXTURE,
        Data = spriteId,
        Position = new Vector2(cx, cy),
        Size = new Vector2(w, h),
        Color = color,
        Alignment = TextAlignment.CENTER,
        RotationOrScale = rot
    });
}

void GuiLabel(MySpriteDrawFrame frame, string text, float x, float y, float scale, Color color, TextAlignment align, string fontId = "White")
{
    frame.Add(new MySprite()
    {
        Type = SpriteType.TEXT,
        Data = text,
        Position = new Vector2(x, y),
        RotationOrScale = scale,
        Color = color,
        Alignment = align,
        FontId = fontId
    });
}

Color GuiAutoColor(double pct, string mode, Color customColor)
{
    if (mode == "custom") return customColor;
    if (mode == "auto_high_bad")
    {
        if (pct >= 90.0) return new Color(239, 68, 68);
        if (pct >= 70.0) return new Color(245, 158, 11);
        return new Color(56, 217, 169);
    }
    if (pct < 20.0) return new Color(239, 68, 68);
    if (pct < 45.0) return new Color(245, 158, 11);
    return new Color(34, 197, 94);
}

void GuiDrawBackdrop(MySpriteDrawFrame frame, RectangleF vp, Color accent, bool showFrame, bool showGrid)
{
    if (showGrid)
    {
        GuiSprite(frame, "Grid", vp.Center.X, vp.Center.Y, vp.Width, vp.Height, new Color(accent.R, accent.G, accent.B, 24));
    }
    if (showFrame)
    {
        float pad = 5f;
        Color edge = new Color(accent.R, accent.G, accent.B, 70);
        GuiRect(frame, vp.X + pad, vp.Y + pad, vp.Width - pad * 2f, 2f, edge);
        GuiRect(frame, vp.X + pad, vp.Y + vp.Height - pad - 2f, vp.Width - pad * 2f, 2f, edge);
        GuiRect(frame, vp.X + pad, vp.Y + pad, 2f, vp.Height - pad * 2f, edge);
        GuiRect(frame, vp.X + vp.Width - pad - 2f, vp.Y + pad, 2f, vp.Height - pad * 2f, edge);
    }
}`,

  gui_header: `void GuiDrawHeader(MySpriteDrawFrame frame, RectangleF vp, ref float y, string title, string badge, Color accent)
{
    float s = Math.Max(0.55f, Math.Min(vp.Width, vp.Height) / 512f);
    float pad = Math.Max(14f, vp.Width * 0.04f);
    float w = vp.Width - pad * 2f;
    float h = 44f * s;
    GuiRect(frame, vp.X + pad, y, w, h, new Color(18, 29, 42, 230));
    GuiRect(frame, vp.X + pad, y, 5f * s, h, accent);
    GuiRect(frame, vp.X + pad, y + h - 2f, w, 2f, new Color(accent.R, accent.G, accent.B, 90));
    GuiLabel(frame, title, vp.X + pad + 14f * s, y + 9f * s, 0.92f * s, new Color(236, 242, 248), TextAlignment.LEFT);
    if (!string.IsNullOrEmpty(badge))
    {
        float bw = Math.Max(82f * s, (badge.Length * 11.5f + 22f) * s);
        float bh = 24f * s;
        float bx = vp.X + pad + w - bw - 10f * s;
        float by = y + (h - bh) * 0.5f;
        GuiRect(frame, bx, by, bw, bh, new Color(accent.R, accent.G, accent.B, 42));
        GuiLabel(frame, badge, bx + bw * 0.5f, by + 3f * s, 0.65f * s, accent, TextAlignment.CENTER);
    }
    y += h + 12f * s;
}`,

  gui_bar: `void GuiDrawBar(MySpriteDrawFrame frame, RectangleF vp, ref float y, string label, double percent, string style, string icon, string colorMode, Color customColor)
{
    float s = Math.Max(0.55f, Math.Min(vp.Width, vp.Height) / 512f);
    float pad = Math.Max(14f, vp.Width * 0.04f);
    float w = vp.Width - pad * 2f;
    double pct = Math.Max(0.0, Math.Min(100.0, percent));
    Color fill = GuiAutoColor(pct, colorMode, customColor);
    string pctText = pct.ToString("0") + "%";
    string iconSprite = icon == "energy" ? "IconEnergy" : icon == "hydrogen" ? "IconHydrogen" : icon == "oxygen" ? "IconOxygen" : icon == "cargo" ? "Construction" : icon == "danger" ? "Danger" : "";

    if (style == "compact")
    {
        float h = 26f * s;
        float labelW = Math.Min(120f * s, w * 0.30f);
        float valW = 54f * s;
        float barX = vp.X + pad + labelW;
        float barW = Math.Max(40f, w - labelW - valW);
        float barH = 12f * s;
        float barY = y + (h - barH) * 0.5f;
        float textX = vp.X + pad;
        if (iconSprite != "") { GuiSprite(frame, iconSprite, textX + 8f * s, y + h * 0.5f, 16f * s, 16f * s, fill); textX += 20f * s; }
        GuiLabel(frame, label, textX, y + 4f * s, 0.68f * s, new Color(205, 218, 232), TextAlignment.LEFT);
        GuiRect(frame, barX, barY, barW, barH, new Color(24, 35, 48));
        float fw = (float)(barW * (pct / 100.0));
        if (fw > 1f) GuiRect(frame, barX, barY, fw, barH, fill);
        GuiLabel(frame, pctText, vp.X + pad + w, y + 4f * s, 0.70f * s, fill, TextAlignment.RIGHT);
        y += h + 7f * s;
        return;
    }

    float textX2 = vp.X + pad;
    if (iconSprite != "")
    {
        GuiSprite(frame, iconSprite, textX2 + 9f * s, y + 10f * s, 18f * s, 18f * s, fill);
        textX2 += 24f * s;
    }
    GuiLabel(frame, label, textX2, y, 0.72f * s, new Color(214, 224, 235), TextAlignment.LEFT);
    GuiLabel(frame, pctText, vp.X + pad + w, y, 0.76f * s, fill, TextAlignment.RIGHT);
    float barTop = y + 23f * s;
    float barH2 = 22f * s;
    GuiRect(frame, vp.X + pad, barTop, w, barH2, new Color(18, 28, 40));

    if (style == "segmented")
    {
        int segs = 20;
        float gap = 3f * s;
        float innerPad = 3f * s;
        float segW = (w - innerPad * 2f - gap * (segs - 1)) / segs;
        int lit = (int)Math.Round((pct / 100.0) * segs);
        for (int i = 0; i < segs; i++)
        {
            float sx = vp.X + pad + innerPad + i * (segW + gap);
            Color sc = i < lit ? fill : new Color(34, 47, 62);
            GuiRect(frame, sx, barTop + innerPad, segW, barH2 - innerPad * 2f, sc);
        }
    }
    else
    {
        float innerPad = 3f * s;
        float innerW = w - innerPad * 2f;
        float fw = (float)(innerW * (pct / 100.0));
        if (fw > 1f)
        {
            GuiRect(frame, vp.X + pad + innerPad, barTop + innerPad, fw, barH2 - innerPad * 2f, fill);
            GuiRect(frame, vp.X + pad + innerPad + Math.Max(0f, fw - 3f * s), barTop + innerPad, Math.Min(3f * s, fw), barH2 - innerPad * 2f, new Color(255, 255, 255, 190));
        }
        for (int q = 1; q <= 3; q++)
        {
            float tx = vp.X + pad + innerPad + innerW * (q * 0.25f);
            GuiRect(frame, tx, barTop + innerPad, 1.5f, barH2 - innerPad * 2f, new Color(8, 17, 26, 150));
        }
    }
    y = barTop + barH2 + 12f * s;
}`,

  gui_gauges: `void GuiDrawGauges(MySpriteDrawFrame frame, RectangleF vp, ref float y, string[] labels, double[] values)
{
    int count = Math.Min(labels.Length, values.Length);
    if (count <= 0) return;
    float s = Math.Max(0.55f, Math.Min(vp.Width, vp.Height) / 512f);
    float pad = Math.Max(14f, vp.Width * 0.04f);
    float w = vp.Width - pad * 2f;
    float cellW = w / count;
    float radius = Math.Min(cellW * 0.36f, 54f * s);
    float cy = y + radius + 12f * s;
    int segs = 24;
    float startDeg = 135f;
    float sweepDeg = 270f;

    for (int idx = 0; idx < count; idx++)
    {
        float cx = vp.X + pad + cellW * (idx + 0.5f);
        double pct = Math.Max(0.0, Math.Min(100.0, values[idx]));
        Color col = GuiAutoColor(pct, "auto", new Color(56, 217, 169));
        int lit = (int)Math.Round((pct / 100.0) * segs);
        for (int i = 0; i < segs; i++)
        {
            double deg = startDeg + (sweepDeg * i) / (segs - 1);
            double rad = deg * Math.PI / 180.0;
            float sx = cx + (float)(Math.Cos(rad) * radius);
            float sy = cy + (float)(Math.Sin(rad) * radius);
            GuiSprite(frame, "SquareSimple", sx, sy, 9f * s, 5.5f * s, i < lit ? col : new Color(34, 47, 62), (float)(rad + Math.PI * 0.5));
        }
        GuiLabel(frame, pct.ToString("0") + "%", cx, cy - 15f * s, 0.95f * s, new Color(240, 245, 250), TextAlignment.CENTER);
        GuiLabel(frame, labels[idx], cx, cy + radius * 0.52f, 0.58f * s, new Color(150, 170, 190), TextAlignment.CENTER);
    }
    y = cy + radius + 18f * s;
}`,

  gui_metrics: `void GuiDrawMetrics(MySpriteDrawFrame frame, RectangleF vp, ref float y, Color accent, string[] labels, string[] values)
{
    int count = Math.Min(labels.Length, values.Length);
    if (count <= 0) return;
    float s = Math.Max(0.55f, Math.Min(vp.Width, vp.Height) / 512f);
    float pad = Math.Max(14f, vp.Width * 0.04f);
    float gap = 10f * s;
    float cardW = (vp.Width - pad * 2f - gap * (count - 1)) / count;
    float cardH = 62f * s;
    for (int i = 0; i < count; i++)
    {
        float cx = vp.X + pad + i * (cardW + gap);
        GuiRect(frame, cx, y, cardW, cardH, new Color(18, 29, 42, 230));
        GuiRect(frame, cx, y, cardW, 3f * s, accent);
        GuiLabel(frame, labels[i], cx + cardW * 0.5f, y + 9f * s, 0.56f * s, new Color(142, 162, 182), TextAlignment.CENTER);
        GuiLabel(frame, values[i], cx + cardW * 0.5f, y + 29f * s, 0.85f * s, new Color(238, 244, 250), TextAlignment.CENTER);
    }
    y += cardH + 12f * s;
}`,

  gui_alert: `void GuiDrawAlert(MySpriteDrawFrame frame, RectangleF vp, ref float y, string severity, string message)
{
    float s = Math.Max(0.55f, Math.Min(vp.Width, vp.Height) / 512f);
    float pad = Math.Max(14f, vp.Width * 0.04f);
    float w = vp.Width - pad * 2f;
    float h = 36f * s;
    Color accent = severity == "critical" ? new Color(239, 68, 68) : severity == "warning" ? new Color(245, 158, 11) : severity == "nominal" ? new Color(34, 197, 94) : new Color(56, 189, 248);
    GuiRect(frame, vp.X + pad, y, w, h, new Color(accent.R, accent.G, accent.B, 42));
    GuiRect(frame, vp.X + pad, y, 5f * s, h, accent);
    string spr = (severity == "critical" || severity == "warning") ? "Danger" : "Circle";
    float icoSize = (severity == "critical" || severity == "warning") ? 20f * s : 11f * s;
    GuiSprite(frame, spr, vp.X + pad + 20f * s, y + h * 0.5f, icoSize, icoSize, accent);
    GuiLabel(frame, message, vp.X + pad + 36f * s, y + 8f * s, 0.72f * s, new Color(245, 248, 252), TextAlignment.LEFT);
    y += h + 9f * s;
}`,

  gui_inventory: `void GuiDrawInventory(MySpriteDrawFrame frame, RectangleF vp, ref float y, string category, string sortBy, int maxItems, Color accent, string nameFilter)
{
    List<IMyTerminalBlock> blocks = new List<IMyTerminalBlock>();
    GridTerminalSystem.GetBlocksOfType<IMyTerminalBlock>(blocks, delegate(IMyTerminalBlock b)
    {
        if (!b.HasInventory || !IsMyGrid(b)) return false;
        if (!string.IsNullOrEmpty(nameFilter) && b.CustomName.IndexOf(nameFilter, StringComparison.OrdinalIgnoreCase) < 0) return false;
        return true;
    });
    Dictionary<string, double> totals = new Dictionary<string, double>();
    List<MyInventoryItem> items = new List<MyInventoryItem>();
    double usedVol = 0.0, maxVol = 0.0;
    for (int i = 0; i < blocks.Count; i++)
    {
        IMyTerminalBlock b = blocks[i];
        for (int invIdx = 0; invIdx < b.InventoryCount; invIdx++)
        {
            IMyInventory inv = b.GetInventory(invIdx);
            usedVol += (double)inv.CurrentVolume;
            maxVol += (double)inv.MaxVolume;
            items.Clear();
            inv.GetItems(items);
            for (int k = 0; k < items.Count; k++)
            {
                MyInventoryItem item = items[k];
                string typeId = item.Type.TypeId;
                bool isOre = typeId.IndexOf("Ore", StringComparison.OrdinalIgnoreCase) >= 0;
                bool isIngot = typeId.IndexOf("Ingot", StringComparison.OrdinalIgnoreCase) >= 0;
                bool isComp = typeId.IndexOf("Component", StringComparison.OrdinalIgnoreCase) >= 0;
                bool isAmmo = typeId.IndexOf("Ammo", StringComparison.OrdinalIgnoreCase) >= 0 || typeId.IndexOf("Gun", StringComparison.OrdinalIgnoreCase) >= 0;
                if (category == "ore" && !isOre) continue;
                if (category == "ingot" && !isIngot) continue;
                if (category == "component" && !isComp) continue;
                if (category == "ammo" && !isAmmo) continue;
                if (category == "ore_ingot" && !isOre && !isIngot) continue;
                string tag = isOre ? " (Ore)" : (isIngot ? " (Ingot)" : "");
                string label = item.Type.SubtypeId + tag;
                double existing;
                if (totals.TryGetValue(label, out existing)) totals[label] = existing + (double)item.Amount;
                else totals[label] = (double)item.Amount;
            }
        }
    }
    double cargoPct = maxVol > 0.0 ? (usedVol / maxVol) * 100.0 : 0.0;
    GuiDrawBar(frame, vp, ref y, "CARGO CAPACITY", cargoPct, "segmented", "cargo", "auto_high_bad", accent);

    List<KeyValuePair<string, double>> sorted = new List<KeyValuePair<string, double>>(totals);
    if (sortBy == "name_asc") sorted.Sort(delegate(KeyValuePair<string, double> a, KeyValuePair<string, double> b) { return string.Compare(a.Key, b.Key, StringComparison.OrdinalIgnoreCase); });
    else sorted.Sort(delegate(KeyValuePair<string, double> a, KeyValuePair<string, double> b) { return b.Value.CompareTo(a.Value); });

    float s = Math.Max(0.55f, Math.Min(vp.Width, vp.Height) / 512f);
    float pad = Math.Max(14f, vp.Width * 0.04f);
    float w = vp.Width - pad * 2f;
    float rowH = 26f * s;
    double topVal = sorted.Count > 0 ? Math.Max(1.0, sorted[0].Value) : 1.0;
    int count = Math.Min(maxItems, sorted.Count);
    for (int i = 0; i < count; i++)
    {
        Color rowBg = (i % 2 == 0) ? new Color(18, 28, 40, 210) : new Color(13, 21, 31, 180);
        GuiRect(frame, vp.X + pad, y, w, rowH, rowBg);
        float barRatio = (float)Math.Min(1.0, sorted[i].Value / topVal);
        GuiRect(frame, vp.X + pad, y + rowH - 3f * s, w * barRatio, 3f * s, new Color(accent.R, accent.G, accent.B, 165));
        string nm = sorted[i].Key;
        if (nm.Length > 22) nm = nm.Substring(0, 22);
        GuiLabel(frame, nm, vp.X + pad + 8f * s, y + 3f * s, 0.66f * s, new Color(224, 232, 240), TextAlignment.LEFT);
        GuiLabel(frame, FormatAmount(sorted[i].Value), vp.X + pad + w - 8f * s, y + 3f * s, 0.68f * s, accent, TextAlignment.RIGHT);
        y += rowH + 4f * s;
    }
}`,

  gui_text: `void GuiDrawText(MySpriteDrawFrame frame, RectangleF vp, ref float y, string text, string size, TextAlignment align, Color color)
{
    float s = Math.Max(0.55f, Math.Min(vp.Width, vp.Height) / 512f);
    float pad = Math.Max(14f, vp.Width * 0.04f);
    float scale = size == "heading" ? 0.95f * s : size == "caption" ? 0.58f * s : 0.74f * s;
    float x = align == TextAlignment.CENTER ? vp.Center.X : align == TextAlignment.RIGHT ? (vp.X + vp.Width - pad) : (vp.X + pad);
    GuiLabel(frame, text, x, y, scale, color, align);
    y += (size == "heading" ? 32f : size == "caption" ? 20f : 26f) * s;
}`,

  gui_divider: `void GuiDrawDivider(MySpriteDrawFrame frame, RectangleF vp, ref float y, string label, Color color)
{
    float s = Math.Max(0.55f, Math.Min(vp.Width, vp.Height) / 512f);
    float pad = Math.Max(14f, vp.Width * 0.04f);
    float w = vp.Width - pad * 2f;
    if (string.IsNullOrEmpty(label))
    {
        GuiRect(frame, vp.X + pad, y + 4f * s, w, 2f, color);
        y += 12f * s;
    }
    else
    {
        GuiLabel(frame, label, vp.X + pad, y, 0.56f * s, color, TextAlignment.LEFT);
        float lw = Math.Min(w * 0.55f, (label.Length * 9f + 10f) * s);
        GuiRect(frame, vp.X + pad + lw, y + 9f * s, Math.Max(10f, w - lw), 2f, new Color(color.R, color.G, color.B, 140));
        y += 22f * s;
    }
}`,

  lcd_core: `IMyTextPanel GetLcd(string name)
{
    IMyTextPanel lcd = GridTerminalSystem.GetBlockWithName(name) as IMyTextPanel;
    if (lcd == null)
    {
        Echo("WARNING: LCD not found -> " + name);
        return null;
    }
    if (lcd.ContentType != ContentType.TEXT_AND_IMAGE)
    {
        lcd.ContentType = ContentType.TEXT_AND_IMAGE;
    }
    return lcd;
}

void WriteToLcd(string name, string text, bool append)
{
    IMyTextPanel lcd = GetLcd(name);
    if (lcd != null) lcd.WriteText(text, append);
}`,

  lcd_style: `void StyleLcd(string name, string font, float fontSize, Color fontColor, Color bgColor, TextAlignment align)
{
    IMyTextPanel lcd = GetLcd(name);
    if (lcd == null) return;
    lcd.Font = font;
    lcd.FontSize = fontSize;
    lcd.FontColor = fontColor;
    lcd.BackgroundColor = bgColor;
    lcd.Alignment = align;
}`,

  lcd_inventory: `void ShowInventoryOnLcd(string lcdName, string title, string category, string sortBy, bool showBar, int maxItems, string nameFilter)
{
    IMyTextPanel lcd = GetLcd(lcdName);
    if (lcd == null) return;
    List<IMyTerminalBlock> blocks = new List<IMyTerminalBlock>();
    GridTerminalSystem.GetBlocksOfType<IMyTerminalBlock>(blocks, delegate(IMyTerminalBlock b)
    {
        if (!b.HasInventory || !IsMyGrid(b)) return false;
        if (!string.IsNullOrEmpty(nameFilter) && b.CustomName.IndexOf(nameFilter, StringComparison.OrdinalIgnoreCase) < 0) return false;
        return true;
    });
    Dictionary<string, double> totals = new Dictionary<string, double>();
    List<MyInventoryItem> items = new List<MyInventoryItem>();
    double usedVol = 0.0, maxVol = 0.0;
    for (int i = 0; i < blocks.Count; i++)
    {
        IMyTerminalBlock b = blocks[i];
        for (int invIdx = 0; invIdx < b.InventoryCount; invIdx++)
        {
            IMyInventory inv = b.GetInventory(invIdx);
            usedVol += (double)inv.CurrentVolume;
            maxVol += (double)inv.MaxVolume;
            items.Clear();
            inv.GetItems(items);
            for (int k = 0; k < items.Count; k++)
            {
                MyInventoryItem item = items[k];
                string typeId = item.Type.TypeId;
                bool isOre = typeId.IndexOf("Ore", StringComparison.OrdinalIgnoreCase) >= 0;
                bool isIngot = typeId.IndexOf("Ingot", StringComparison.OrdinalIgnoreCase) >= 0;
                bool isComp = typeId.IndexOf("Component", StringComparison.OrdinalIgnoreCase) >= 0;
                bool isAmmo = typeId.IndexOf("Ammo", StringComparison.OrdinalIgnoreCase) >= 0 || typeId.IndexOf("Gun", StringComparison.OrdinalIgnoreCase) >= 0;
                if (category == "ore" && !isOre) continue;
                if (category == "ingot" && !isIngot) continue;
                if (category == "component" && !isComp) continue;
                if (category == "ammo" && !isAmmo) continue;
                if (category == "ore_ingot" && !isOre && !isIngot) continue;
                string tag = isOre ? " (Ore)" : (isIngot ? " (Ingot)" : "");
                string label = item.Type.SubtypeId + tag;
                double existing;
                if (totals.TryGetValue(label, out existing)) totals[label] = existing + (double)item.Amount;
                else totals[label] = (double)item.Amount;
            }
        }
    }
    List<KeyValuePair<string, double>> sorted = new List<KeyValuePair<string, double>>(totals);
    if (sortBy == "name_asc") sorted.Sort(delegate(KeyValuePair<string, double> a, KeyValuePair<string, double> b) { return string.Compare(a.Key, b.Key, StringComparison.OrdinalIgnoreCase); });
    else sorted.Sort(delegate(KeyValuePair<string, double> a, KeyValuePair<string, double> b) { return b.Value.CompareTo(a.Value); });
    StringBuilder sb = new StringBuilder();
    sb.AppendLine("=== " + title + " ===");
    if (showBar)
    {
        double pct = maxVol > 0.0 ? (usedVol / maxVol) * 100.0 : 0.0;
        sb.AppendLine("Cargo: " + BuildBar(pct, 16) + " " + pct.ToString("0.0") + "%");
    }
    sb.AppendLine("--------------------------------");
    if (sorted.Count == 0) sb.AppendLine("  (No matching items found)");
    else
    {
        int count = Math.Min(maxItems, sorted.Count);
        for (int i = 0; i < count; i++)
        {
            string itemLabel = sorted[i].Key;
            if (itemLabel.Length > 21) itemLabel = itemLabel.Substring(0, 21);
            sb.AppendLine(itemLabel.PadRight(22) + FormatAmount(sorted[i].Value).PadLeft(10));
        }
        if (sorted.Count > maxItems) sb.AppendLine("  ... +" + (sorted.Count - maxItems) + " more item types");
    }
    lcd.WriteText(sb.ToString(), false);
}`,

  lcd_power: `void ShowPowerOnLcd(string lcdName, string title, bool showSources, bool showBar, bool append)
{
    IMyTextPanel lcd = GetLcd(lcdName);
    if (lcd == null) return;
    List<IMyBatteryBlock> batts = new List<IMyBatteryBlock>();
    GridTerminalSystem.GetBlocksOfType<IMyBatteryBlock>(batts, IsMyGrid);
    double stored = 0.0, maxStored = 0.0, curIn = 0.0, curOut = 0.0;
    for (int i = 0; i < batts.Count; i++) { stored += batts[i].CurrentStoredPower; maxStored += batts[i].MaxStoredPower; curIn += batts[i].CurrentInput; curOut += batts[i].CurrentOutput; }
    double pct = maxStored > 0.0 ? (stored / maxStored) * 100.0 : 0.0;
    StringBuilder sb = new StringBuilder();
    sb.AppendLine("=== " + title + " ===");
    if (showBar) sb.AppendLine("Batt:  " + BuildBar(pct, 16) + " " + pct.ToString("0.0") + "%");
    else sb.AppendLine("Batteries (" + batts.Count + "): " + pct.ToString("0.0") + "%");
    sb.AppendLine("Stored: " + stored.ToString("0.00") + " / " + maxStored.ToString("0.00") + " MWh");
    sb.AppendLine("Flow:   +" + curIn.ToString("0.00") + " MW / -" + curOut.ToString("0.00") + " MW");
    if (showSources)
    {
        List<IMySolarPanel> solars = new List<IMySolarPanel>();
        GridTerminalSystem.GetBlocksOfType<IMySolarPanel>(solars, IsMyGrid);
        double solarOut = 0.0; for (int i = 0; i < solars.Count; i++) solarOut += solars[i].CurrentOutput;
        List<IMyReactor> reactors = new List<IMyReactor>();
        GridTerminalSystem.GetBlocksOfType<IMyReactor>(reactors, IsMyGrid);
        double reactorOut = 0.0; for (int i = 0; i < reactors.Count; i++) reactorOut += reactors[i].CurrentOutput;
        sb.AppendLine("Solar:  " + solarOut.ToString("0.00") + " MW (" + solars.Count + ")");
        sb.AppendLine("React:  " + reactorOut.ToString("0.00") + " MW (" + reactors.Count + ")");
    }
    lcd.WriteText(sb.ToString(), append);
}`,

  lcd_gas: `void ShowGasOnLcd(string lcdName, string title, string gasType, bool showBar, bool append)
{
    IMyTextPanel lcd = GetLcd(lcdName);
    if (lcd == null) return;
    List<IMyGasTank> tanks = new List<IMyGasTank>();
    GridTerminalSystem.GetBlocksOfType<IMyGasTank>(tanks, IsMyGrid);
    double h2Fill = 0.0, h2Cap = 0.0, o2Fill = 0.0, o2Cap = 0.0;
    int h2Count = 0, o2Count = 0;
    for (int i = 0; i < tanks.Count; i++)
    {
        bool isH2 = tanks[i].BlockDefinition.SubtypeId.IndexOf("Hydrogen", StringComparison.OrdinalIgnoreCase) >= 0;
        if (isH2) { h2Fill += tanks[i].FilledRatio * tanks[i].Capacity; h2Cap += tanks[i].Capacity; h2Count++; }
        else { o2Fill += tanks[i].FilledRatio * tanks[i].Capacity; o2Cap += tanks[i].Capacity; o2Count++; }
    }
    StringBuilder sb = new StringBuilder();
    sb.AppendLine("=== " + title + " ===");
    if (gasType == "both" || gasType == "hydrogen") { double p = h2Cap > 0.0 ? (h2Fill / h2Cap) * 100.0 : 0.0; sb.AppendLine("H2 (" + h2Count + "): " + (showBar ? BuildBar(p, 14) + " " : "") + p.ToString("0.0") + "%"); }
    if (gasType == "both" || gasType == "oxygen") { double p = o2Cap > 0.0 ? (o2Fill / o2Cap) * 100.0 : 0.0; sb.AppendLine("O2 (" + o2Count + "): " + (showBar ? BuildBar(p, 14) + " " : "") + p.ToString("0.0") + "%"); }
    lcd.WriteText(sb.ToString(), append);
}`,

  battery_pct: `double GetBatteryPercent(string filter)
{
    List<IMyBatteryBlock> batts = new List<IMyBatteryBlock>();
    GridTerminalSystem.GetBlocksOfType<IMyBatteryBlock>(batts, delegate(IMyBatteryBlock b) { return IsMyGrid(b) && (string.IsNullOrEmpty(filter) || b.CustomName.IndexOf(filter, StringComparison.OrdinalIgnoreCase) >= 0); });
    double stored = 0.0, maxStored = 0.0;
    for (int i = 0; i < batts.Count; i++) { stored += batts[i].CurrentStoredPower; maxStored += batts[i].MaxStoredPower; }
    return maxStored > 0.0 ? (stored / maxStored) * 100.0 : 0.0;
}`,

  gas_pct: `double GetGasPercent(bool hydrogen, string filter)
{
    List<IMyGasTank> tanks = new List<IMyGasTank>();
    GridTerminalSystem.GetBlocksOfType<IMyGasTank>(tanks, delegate(IMyGasTank t)
    {
        if (!IsMyGrid(t)) return false;
        bool isH2 = t.BlockDefinition.SubtypeId.IndexOf("Hydrogen", StringComparison.OrdinalIgnoreCase) >= 0;
        return isH2 == hydrogen && (string.IsNullOrEmpty(filter) || t.CustomName.IndexOf(filter, StringComparison.OrdinalIgnoreCase) >= 0);
    });
    double filled = 0.0, cap = 0.0;
    for (int i = 0; i < tanks.Count; i++) { filled += tanks[i].FilledRatio * tanks[i].Capacity; cap += tanks[i].Capacity; }
    return cap > 0.0 ? (filled / cap) * 100.0 : 0.0;
}`,

  cargo_pct: `double GetCargoPercent(string filter)
{
    List<IMyCargoContainer> cargos = new List<IMyCargoContainer>();
    GridTerminalSystem.GetBlocksOfType<IMyCargoContainer>(cargos, delegate(IMyCargoContainer c) { return IsMyGrid(c) && (string.IsNullOrEmpty(filter) || c.CustomName.IndexOf(filter, StringComparison.OrdinalIgnoreCase) >= 0); });
    double used = 0.0, max = 0.0;
    for (int i = 0; i < cargos.Count; i++) { IMyInventory inv = cargos[i].GetInventory(0); used += (double)inv.CurrentVolume; max += (double)inv.MaxVolume; }
    return max > 0.0 ? (used / max) * 100.0 : 0.0;
}`,

  vent_o2: `double GetVentOxygenPercent(string name)
{
    IMyAirVent vent = GridTerminalSystem.GetBlockWithName(name) as IMyAirVent;
    if (vent == null) { Echo("WARNING: Air Vent not found -> " + name); return 0.0; }
    return vent.GetOxygenLevel() * 100.0;
}`,

  ship_speed: `double GetShipSpeed()
{
    List<IMyShipController> ctrls = new List<IMyShipController>();
    GridTerminalSystem.GetBlocksOfType<IMyShipController>(ctrls, IsMyGrid);
    return ctrls.Count > 0 ? ctrls[0].GetShipSpeed() : 0.0;
}`,

  gravity_g: `double GetGravityG()
{
    List<IMyShipController> ctrls = new List<IMyShipController>();
    GridTerminalSystem.GetBlocksOfType<IMyShipController>(ctrls, IsMyGrid);
    return ctrls.Count > 0 ? ctrls[0].GetNaturalGravity().Length() / 9.81 : 0.0;
}`,

  solar_mw: `double GetSolarOutputMW()
{
    List<IMySolarPanel> list = new List<IMySolarPanel>();
    GridTerminalSystem.GetBlocksOfType<IMySolarPanel>(list, IsMyGrid);
    double sum = 0.0; for (int i = 0; i < list.Count; i++) sum += list[i].CurrentOutput;
    return sum;
}`,

  reactor_mw: `double GetReactorOutputMW()
{
    List<IMyReactor> list = new List<IMyReactor>();
    GridTerminalSystem.GetBlocksOfType<IMyReactor>(list, IsMyGrid);
    double sum = 0.0; for (int i = 0; i < list.Count; i++) sum += list[i].CurrentOutput;
    return sum;
}`,

  projector_remaining: `int GetProjectorRemaining(string name)
{
    IMyProjector proj = GridTerminalSystem.GetBlockWithName(name) as IMyProjector;
    return proj != null ? proj.RemainingBlocks : 0;
}`,

  item_count: `double GetItemCount(string typeId, string subtypeId)
{
    List<IMyTerminalBlock> blocks = new List<IMyTerminalBlock>();
    GridTerminalSystem.GetBlocksOfType<IMyTerminalBlock>(blocks, delegate(IMyTerminalBlock b) { return b.HasInventory && IsMyGrid(b); });
    double total = 0.0;
    MyItemType itemType = new MyItemType(typeId, subtypeId);
    for (int i = 0; i < blocks.Count; i++) for (int invIdx = 0; invIdx < blocks[i].InventoryCount; invIdx++) total += (double)blocks[i].GetInventory(invIdx).GetItemAmount(itemType);
    return total;
}`,

  door_open: `bool IsDoorOpen(string name)
{
    IMyDoor door = GridTerminalSystem.GetBlockWithName(name) as IMyDoor;
    if (door == null) { Echo("WARNING: Door not found -> " + name); return false; }
    return door.Status == DoorStatus.Open || door.Status == DoorStatus.Opening;
}`,

  connector_state: `bool IsConnectorStatus(string name, MyShipConnectorStatus expected)
{
    IMyShipConnector conn = GridTerminalSystem.GetBlockWithName(name) as IMyShipConnector;
    if (conn == null) { Echo("WARNING: Connector not found -> " + name); return false; }
    return conn.Status == expected;
}`,

  sensor_active: `bool IsSensorActive(string name)
{
    IMySensorBlock sensor = GridTerminalSystem.GetBlockWithName(name) as IMySensorBlock;
    if (sensor == null) { Echo("WARNING: Sensor not found -> " + name); return false; }
    return sensor.IsActive;
}`,

  turret_target: `bool AnyTurretHasTarget(string filter)
{
    List<IMyLargeTurretBase> turrets = new List<IMyLargeTurretBase>();
    GridTerminalSystem.GetBlocksOfType<IMyLargeTurretBase>(turrets, delegate(IMyLargeTurretBase t) { return IsMyGrid(t) && (string.IsNullOrEmpty(filter) || t.CustomName.IndexOf(filter, StringComparison.OrdinalIgnoreCase) >= 0); });
    for (int i = 0; i < turrets.Count; i++) if (turrets[i].HasTarget) return true;
    return false;
}`,

  block_enabled: `bool IsBlockEnabled(string name)
{
    IMyFunctionalBlock fb = GridTerminalSystem.GetBlockWithName(name) as IMyFunctionalBlock;
    return fb != null && fb.Enabled;
}`,

  door_action: `void ControlDoors(string mode, string name, string action)
{
    List<IMyDoor> doors = new List<IMyDoor>();
    if (mode == "group") { IMyBlockGroup grp = GridTerminalSystem.GetBlockGroupWithName(name); if (grp != null) grp.GetBlocksOfType<IMyDoor>(doors, IsMyGrid); }
    else if (mode == "tag") GridTerminalSystem.GetBlocksOfType<IMyDoor>(doors, delegate(IMyDoor d) { return IsMyGrid(d) && d.CustomName.IndexOf(name, StringComparison.OrdinalIgnoreCase) >= 0; });
    else { IMyDoor single = GridTerminalSystem.GetBlockWithName(name) as IMyDoor; if (single != null) doors.Add(single); }
    if (doors.Count == 0) { Echo("WARNING: Door(s) not found -> " + name); return; }
    for (int i = 0; i < doors.Count; i++)
    {
        IMyDoor d = doors[i];
        if (action == "open") { d.Enabled = true; d.OpenDoor(); }
        else if (action == "close") { d.Enabled = true; d.CloseDoor(); }
        else if (action == "toggle") { d.Enabled = true; d.ToggleDoor(); }
        else if (action == "lock") { d.CloseDoor(); if (d.Status == DoorStatus.Closed) d.Enabled = false; }
        else if (action == "unlock") { d.Enabled = true; }
    }
}`,

  airvent_action: `void ControlAirVent(string name, string action)
{
    IMyAirVent vent = GridTerminalSystem.GetBlockWithName(name) as IMyAirVent;
    if (vent == null) { Echo("WARNING: Air Vent not found -> " + name); return; }
    if (action == "pressurize") { vent.Enabled = true; vent.Depressurize = false; }
    else if (action == "depressurize") { vent.Enabled = true; vent.Depressurize = true; }
    else if (action == "on") vent.Enabled = true;
    else if (action == "off") vent.Enabled = false;
}`,

  light_action: `void ControlLights(string mode, string name, string action, Color color, float blinkSeconds)
{
    List<IMyLightingBlock> lights = new List<IMyLightingBlock>();
    if (mode == "all") GridTerminalSystem.GetBlocksOfType<IMyLightingBlock>(lights, IsMyGrid);
    else if (mode == "group") { IMyBlockGroup grp = GridTerminalSystem.GetBlockGroupWithName(name); if (grp != null) grp.GetBlocksOfType<IMyLightingBlock>(lights, IsMyGrid); }
    else { IMyLightingBlock single = GridTerminalSystem.GetBlockWithName(name) as IMyLightingBlock; if (single != null) lights.Add(single); }
    for (int i = 0; i < lights.Count; i++)
    {
        IMyLightingBlock l = lights[i];
        if (action == "on") l.Enabled = true;
        else if (action == "off") l.Enabled = false;
        else if (action == "toggle") l.Enabled = !l.Enabled;
        else if (action == "style") { l.Enabled = true; l.Color = color; l.BlinkIntervalSeconds = blinkSeconds; l.BlinkLength = blinkSeconds > 0f ? 50f : 100f; }
    }
}`,

  block_power: `void SetBlockPower(string mode, string name, string action)
{
    List<IMyFunctionalBlock> list = new List<IMyFunctionalBlock>();
    if (mode == "group") { IMyBlockGroup grp = GridTerminalSystem.GetBlockGroupWithName(name); if (grp != null) grp.GetBlocksOfType<IMyFunctionalBlock>(list, IsMyGrid); }
    else if (mode == "tag") GridTerminalSystem.GetBlocksOfType<IMyFunctionalBlock>(list, delegate(IMyFunctionalBlock b) { return IsMyGrid(b) && b.CustomName.IndexOf(name, StringComparison.OrdinalIgnoreCase) >= 0; });
    else { IMyFunctionalBlock single = GridTerminalSystem.GetBlockWithName(name) as IMyFunctionalBlock; if (single != null) list.Add(single); }
    if (list.Count == 0) { Echo("WARNING: Block(s) not found -> " + name); return; }
    for (int i = 0; i < list.Count; i++) { if (action == "on") list[i].Enabled = true; else if (action == "off") list[i].Enabled = false; else list[i].Enabled = !list[i].Enabled; }
}`,

  battery_mode: `void SetBatteryMode(string mode, string name, ChargeMode chargeMode)
{
    List<IMyBatteryBlock> batts = new List<IMyBatteryBlock>();
    if (mode == "all") GridTerminalSystem.GetBlocksOfType<IMyBatteryBlock>(batts, IsMyGrid);
    else if (mode == "group") { IMyBlockGroup grp = GridTerminalSystem.GetBlockGroupWithName(name); if (grp != null) grp.GetBlocksOfType<IMyBatteryBlock>(batts, IsMyGrid); }
    else GridTerminalSystem.GetBlocksOfType<IMyBatteryBlock>(batts, delegate(IMyBatteryBlock b) { return IsMyGrid(b) && b.CustomName.IndexOf(name, StringComparison.OrdinalIgnoreCase) >= 0; });
    for (int i = 0; i < batts.Count; i++) batts[i].ChargeMode = chargeMode;
}`,

  tank_stockpile: `void SetTankStockpile(string gasType, bool stockpile, string filter)
{
    List<IMyGasTank> tanks = new List<IMyGasTank>();
    GridTerminalSystem.GetBlocksOfType<IMyGasTank>(tanks, delegate(IMyGasTank t)
    {
        if (!IsMyGrid(t)) return false;
        bool isH2 = t.BlockDefinition.SubtypeId.IndexOf("Hydrogen", StringComparison.OrdinalIgnoreCase) >= 0;
        if (gasType == "hydrogen" && !isH2) return false;
        if (gasType == "oxygen" && isH2) return false;
        return string.IsNullOrEmpty(filter) || t.CustomName.IndexOf(filter, StringComparison.OrdinalIgnoreCase) >= 0;
    });
    for (int i = 0; i < tanks.Count; i++) tanks[i].Stockpile = stockpile;
}`,

  connector_action: `void ControlConnector(string name, string action)
{
    IMyShipConnector conn = GridTerminalSystem.GetBlockWithName(name) as IMyShipConnector;
    if (conn == null) { Echo("WARNING: Connector not found -> " + name); return; }
    if (action == "connect") conn.Connect();
    else if (action == "disconnect") conn.Disconnect();
    else conn.ToggleConnect();
}`,

  thruster_override: `void SetThrusterOverride(string mode, string name, float ratio)
{
    List<IMyThrust> thrusters = new List<IMyThrust>();
    if (mode == "all") GridTerminalSystem.GetBlocksOfType<IMyThrust>(thrusters, IsMyGrid);
    else if (mode == "group") { IMyBlockGroup grp = GridTerminalSystem.GetBlockGroupWithName(name); if (grp != null) grp.GetBlocksOfType<IMyThrust>(thrusters, IsMyGrid); }
    else GridTerminalSystem.GetBlocksOfType<IMyThrust>(thrusters, delegate(IMyThrust t) { return IsMyGrid(t) && t.CustomName.IndexOf(name, StringComparison.OrdinalIgnoreCase) >= 0; });
    for (int i = 0; i < thrusters.Count; i++) thrusters[i].ThrustOverridePercentage = ratio;
}`,

  sound_action: `void ControlSound(string name, string action, string soundName)
{
    IMySoundBlock sb = GridTerminalSystem.GetBlockWithName(name) as IMySoundBlock;
    if (sb == null) { Echo("WARNING: Sound Block not found -> " + name); return; }
    if (action == "play") { if (!string.IsNullOrEmpty(soundName)) sb.SelectedSound = soundName; sb.Play(); }
    else sb.Stop();
}`,

  timer_action: `void ControlTimer(string name, string action)
{
    IMyTimerBlock tb = GridTerminalSystem.GetBlockWithName(name) as IMyTimerBlock;
    if (tb == null) { Echo("WARNING: Timer Block not found -> " + name); return; }
    if (action == "trigger") tb.Trigger();
    else if (action == "start") tb.StartCountdown();
    else tb.StopCountdown();
}`,

  broadcast_text: `void SetBroadcastText(string devType, string name, string text, float radius)
{
    if (devType == "beacon")
    {
        IMyBeacon bcn = GridTerminalSystem.GetBlockWithName(name) as IMyBeacon;
        if (bcn == null) { Echo("WARNING: Beacon not found -> " + name); return; }
        bcn.HudText = text; bcn.Radius = radius; bcn.Enabled = true;
    }
    else
    {
        IMyRadioAntenna ant = GridTerminalSystem.GetBlockWithName(name) as IMyRadioAntenna;
        if (ant == null) { Echo("WARNING: Antenna not found -> " + name); return; }
        ant.HudText = text; ant.Radius = radius; ant.EnableBroadcasting = true; ant.Enabled = true;
    }
}`,

  piston_action: `void ControlPistons(string mode, string name, string action, float speed)
{
    List<IMyPistonBase> pistons = new List<IMyPistonBase>();
    if (mode == "group") { IMyBlockGroup grp = GridTerminalSystem.GetBlockGroupWithName(name); if (grp != null) grp.GetBlocksOfType<IMyPistonBase>(pistons, IsMyGrid); }
    else { IMyPistonBase p = GridTerminalSystem.GetBlockWithName(name) as IMyPistonBase; if (p != null) pistons.Add(p); }
    for (int i = 0; i < pistons.Count; i++)
    {
        if (action == "extend") { pistons[i].Velocity = Math.Abs(speed); pistons[i].Extend(); }
        else if (action == "retract") { pistons[i].Velocity = -Math.Abs(speed); pistons[i].Retract(); }
        else if (action == "reverse") pistons[i].Reverse();
        else pistons[i].Velocity = 0f;
    }
}`,

  rotor_action: `void ControlRotors(string mode, string name, string action, float rpm)
{
    List<IMyMotorStator> rotors = new List<IMyMotorStator>();
    if (mode == "group") { IMyBlockGroup grp = GridTerminalSystem.GetBlockGroupWithName(name); if (grp != null) grp.GetBlocksOfType<IMyMotorStator>(rotors, IsMyGrid); }
    else { IMyMotorStator r = GridTerminalSystem.GetBlockWithName(name) as IMyMotorStator; if (r != null) rotors.Add(r); }
    for (int i = 0; i < rotors.Count; i++)
    {
        if (action == "spin") { rotors[i].RotorLock = false; rotors[i].TargetVelocityRPM = rpm; }
        else if (action == "stop") rotors[i].TargetVelocityRPM = 0f;
        else if (action == "lock") rotors[i].RotorLock = true;
        else rotors[i].RotorLock = false;
    }
}`,

  loop_query: `List<IMyTerminalBlock> QueryLoopBlocks(string blockType, string matchMode, string filter)
{
    List<IMyTerminalBlock> raw = new List<IMyTerminalBlock>();
    if (matchMode == "group")
    {
        IMyBlockGroup grp = GridTerminalSystem.GetBlockGroupWithName(filter);
        if (grp != null) grp.GetBlocks(raw);
    }
    else
    {
        GridTerminalSystem.GetBlocks(raw);
    }
    List<IMyTerminalBlock> matched = new List<IMyTerminalBlock>();
    for (int i = 0; i < raw.Count; i++)
    {
        IMyTerminalBlock b = raw[i];
        if (!IsMyGrid(b)) continue;
        if (matchMode == "tag" && !string.IsNullOrEmpty(filter) && b.CustomName.IndexOf(filter, StringComparison.OrdinalIgnoreCase) < 0) continue;
        if (MatchesBlockKind(b, blockType)) matched.Add(b);
    }
    return matched;
}

bool MatchesBlockKind(IMyTerminalBlock b, string blockType)
{
    if (blockType == "door") return b is IMyDoor;
    if (blockType == "airvent") return b is IMyAirVent;
    if (blockType == "light") return b is IMyLightingBlock;
    if (blockType == "battery") return b is IMyBatteryBlock;
    if (blockType == "gastank") return b is IMyGasTank;
    if (blockType == "cargo") return b is IMyCargoContainer;
    if (blockType == "reactor") return b is IMyReactor;
    if (blockType == "solar") return b is IMySolarPanel;
    if (blockType == "thruster") return b is IMyThrust;
    if (blockType == "piston") return b is IMyPistonBase;
    if (blockType == "rotor") return b is IMyMotorStator;
    if (blockType == "turret") return b is IMyLargeTurretBase;
    if (blockType == "assembler") return b is IMyAssembler;
    if (blockType == "refinery") return b is IMyRefinery;
    if (blockType == "connector") return b is IMyShipConnector;
    if (blockType == "lcd") return b is IMyTextPanel;
    return b is IMyFunctionalBlock;
}

double ReadBlockPrimaryValue(IMyTerminalBlock b)
{
    if (b == null) return 0.0;
    IMyBatteryBlock bat = b as IMyBatteryBlock;
    if (bat != null) return bat.MaxStoredPower > 0f ? (bat.CurrentStoredPower / bat.MaxStoredPower) * 100.0 : 0.0;
    IMyGasTank tank = b as IMyGasTank;
    if (tank != null) return tank.FilledRatio * 100.0;
    IMyAirVent vent = b as IMyAirVent;
    if (vent != null) return vent.GetOxygenLevel() * 100.0;
    IMyDoor door = b as IMyDoor;
    if (door != null) return door.OpenRatio * 100.0;
    IMyCargoContainer cargo = b as IMyCargoContainer;
    if (cargo != null) { IMyInventory inv = cargo.GetInventory(0); return inv != null && (double)inv.MaxVolume > 0.0 ? ((double)inv.CurrentVolume / (double)inv.MaxVolume) * 100.0 : 0.0; }
    IMyPowerProducer prod = b as IMyPowerProducer;
    if (prod != null) return (double)prod.CurrentOutput;
    IMyPistonBase pis = b as IMyPistonBase;
    if (pis != null) return (double)pis.CurrentPosition;
    IMyMotorStator rot = b as IMyMotorStator;
    if (rot != null) return (double)(rot.Angle * 180f / (float)Math.PI);
    IMyFunctionalBlock fb = b as IMyFunctionalBlock;
    return (fb != null && fb.Enabled) ? 1.0 : 0.0;
}`,

  read_block_prop: `double ReadBlockProp(IMyTerminalBlock b, string prop)
{
    if (b == null) return 0.0;
    IMyFunctionalBlock fb = b as IMyFunctionalBlock;
    if (prop == "enabled") return (fb != null && fb.Enabled) ? 1.0 : 0.0;
    if (prop == "working") return b.IsWorking ? 1.0 : 0.0;
    if (prop == "power_out") { IMyPowerProducer pp = b as IMyPowerProducer; return pp != null ? (double)pp.CurrentOutput : 0.0; }
    if (prop == "power_in") { IMyBatteryBlock bt = b as IMyBatteryBlock; return bt != null ? (double)bt.CurrentInput : 0.0; }
    if (prop == "door_ratio") { IMyDoor d = b as IMyDoor; return d != null ? d.OpenRatio * 100.0 : 0.0; }
    if (prop == "vent_o2") { IMyAirVent v = b as IMyAirVent; return v != null ? v.GetOxygenLevel() * 100.0 : 0.0; }
    if (prop == "piston_pos") { IMyPistonBase p = b as IMyPistonBase; return p != null ? (double)p.CurrentPosition : 0.0; }
    if (prop == "rotor_deg") { IMyMotorStator r = b as IMyMotorStator; return r != null ? (double)(r.Angle * 180f / (float)Math.PI) : 0.0; }
    IMyBatteryBlock bat = b as IMyBatteryBlock;
    if (bat != null) return bat.MaxStoredPower > 0f ? (bat.CurrentStoredPower / bat.MaxStoredPower) * 100.0 : 0.0;
    IMyGasTank tank = b as IMyGasTank;
    if (tank != null) return tank.FilledRatio * 100.0;
    IMyCargoContainer cg = b as IMyCargoContainer;
    if (cg != null) { IMyInventory inv = cg.GetInventory(0); return inv != null && (double)inv.MaxVolume > 0.0 ? ((double)inv.CurrentVolume / (double)inv.MaxVolume) * 100.0 : 0.0; }
    return (fb != null && fb.Enabled) ? 1.0 : 0.0;
}

string ReadBlockCustomData(IMyTerminalBlock b)
{
    return b != null ? b.CustomData : "";
}

double CountBlocksByTag(string tag)
{
    List<IMyTerminalBlock> list = new List<IMyTerminalBlock>();
    GridTerminalSystem.GetBlocks(list);
    int c = 0;
    for (int i = 0; i < list.Count; i++)
    {
        if (IsMyGrid(list[i]) && (string.IsNullOrEmpty(tag) || list[i].CustomName.IndexOf(tag, StringComparison.OrdinalIgnoreCase) >= 0)) c++;
    }
    return (double)c;
}`,

  custom_data_ini: `void ReadIniIntoVar(IMyTerminalBlock blk, string key, string varName, string fallback)
{
    string found = fallback;
    if (blk != null && !string.IsNullOrEmpty(blk.CustomData))
    {
        string[] rawLines = blk.CustomData.Split('\\n');
        for (int i = 0; i < rawLines.Length; i++)
        {
            string ln = rawLines[i].Trim();
            if (ln.Length == 0 || ln.StartsWith("#") || ln.StartsWith(";")) continue;
            int eq = ln.IndexOf('=');
            if (eq > 0 && ln.Substring(0, eq).Trim().Equals(key, StringComparison.OrdinalIgnoreCase))
            {
                found = ln.Substring(eq + 1).Trim();
                break;
            }
        }
    }
    double parsed;
    if (double.TryParse(found, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out parsed))
    {
        SetVar(varName, parsed);
    }
    else
    {
        SetTextVar(varName, found);
    }
}`,

  loop_block_action: `void RunLoopBlockAction(IMyTerminalBlock blk, string action, Color color, string actionOrProp, string valueText, double numVal)
{
    if (blk == null) return;
    if (action == "on" || action == "off" || action == "toggle")
    {
        IMyFunctionalBlock fb = blk as IMyFunctionalBlock;
        if (fb != null) fb.Enabled = action == "on" ? true : action == "off" ? false : !fb.Enabled;
    }
    else if (action == "door_open" || action == "door_close")
    {
        IMyDoor d = blk as IMyDoor;
        if (d != null) { if (action == "door_open") d.OpenDoor(); else d.CloseDoor(); }
    }
    else if (action == "battery_auto" || action == "battery_recharge")
    {
        IMyBatteryBlock bat = blk as IMyBatteryBlock;
        if (bat != null) bat.ChargeMode = action == "battery_recharge" ? ChargeMode.Recharge : ChargeMode.Auto;
    }
    else if (action == "light_color")
    {
        IMyLightingBlock lt = blk as IMyLightingBlock;
        if (lt != null) { lt.Enabled = true; lt.Color = color; }
    }
    else if (action == "custom_data")
    {
        blk.CustomData = valueText;
    }
    else if (action == "terminal_action")
    {
        ITerminalAction ta = blk.GetActionWithName(actionOrProp);
        if (ta != null) ta.Apply(blk);
    }
    else if (action == "terminal_float")
    {
        if (blk.GetProperty(actionOrProp) != null) blk.SetValue<float>(actionOrProp, (float)numVal);
    }
}`,

  terminal_action: `void RunTerminalOpOnBlock(IMyTerminalBlock blk, string opKind, string propId, double numVal, bool boolVal)
{
    if (blk == null || string.IsNullOrEmpty(propId)) return;
    if (opKind == "action")
    {
        ITerminalAction act = blk.GetActionWithName(propId);
        if (act != null) act.Apply(blk);
    }
    else if (opKind == "float")
    {
        if (blk.GetProperty(propId) != null) blk.SetValue<float>(propId, (float)numVal);
    }
    else if (opKind == "bool")
    {
        if (blk.GetProperty(propId) != null) blk.SetValue<bool>(propId, boolVal);
    }
}

void RunTerminalOp(string mode, string name, string opKind, string propId, double numVal, bool boolVal)
{
    List<IMyTerminalBlock> list = new List<IMyTerminalBlock>();
    if (mode == "group")
    {
        IMyBlockGroup grp = GridTerminalSystem.GetBlockGroupWithName(name);
        if (grp != null) grp.GetBlocks(list);
    }
    else if (mode == "tag")
    {
        GridTerminalSystem.GetBlocks(list);
    }
    else
    {
        IMyTerminalBlock single = GridTerminalSystem.GetBlockWithName(name);
        if (single != null) list.Add(single);
    }
    for (int i = 0; i < list.Count; i++)
    {
        IMyTerminalBlock b = list[i];
        if (!IsMyGrid(b)) continue;
        if (mode == "tag" && !string.IsNullOrEmpty(name) && b.CustomName.IndexOf(name, StringComparison.OrdinalIgnoreCase) < 0) continue;
        RunTerminalOpOnBlock(b, opKind, propId, numVal, boolVal);
    }
}`,
};

function buildHelpers(ctx: GenContext): string[] {
  const h = ctx.helpers;
  if (h.size === 0) return [];
  const out: string[] = [HELPER_SNIPPETS.grid, ''];

  for (const k of ['vars', 'bar', 'format_num']) {
    if (h.has(k)) out.push(HELPER_SNIPPETS[k], '');
  }

  if (h.has('template')) {
    const t: string[] = ['string FormatTemplate(string text)', '{', '    string result = text;'];
    if (h.has('battery_pct')) {
      t.push(
        `    if (result.Contains("{battery}") || result.Contains("{bar:battery}")) { double b = GetBatteryPercent(""); result = result.Replace("{battery}", b.ToString("0.#"));${h.has('bar') ? ' result = result.Replace("{bar:battery}", BuildBar(b, 12));' : ''} }`
      );
    }
    if (h.has('gas_pct')) {
      t.push(
        `    if (result.Contains("{h2}") || result.Contains("{bar:h2}")) { double h2 = GetGasPercent(true, ""); result = result.Replace("{h2}", h2.ToString("0.#"));${h.has('bar') ? ' result = result.Replace("{bar:h2}", BuildBar(h2, 12));' : ''} }`
      );
      t.push(
        `    if (result.Contains("{o2}") || result.Contains("{bar:o2}")) { double o2 = GetGasPercent(false, ""); result = result.Replace("{o2}", o2.ToString("0.#"));${h.has('bar') ? ' result = result.Replace("{bar:o2}", BuildBar(o2, 12));' : ''} }`
      );
    }
    if (h.has('cargo_pct')) {
      t.push(
        `    if (result.Contains("{cargo}") || result.Contains("{bar:cargo}")) { double c = GetCargoPercent(""); result = result.Replace("{cargo}", c.ToString("0.#"));${h.has('bar') ? ' result = result.Replace("{bar:cargo}", BuildBar(c, 12));' : ''} }`
      );
    }
    if (h.has('ship_speed')) t.push('    if (result.Contains("{speed}")) result = result.Replace("{speed}", GetShipSpeed().ToString("0.0"));');
    if (h.has('gravity_g')) t.push('    if (result.Contains("{gravity}")) result = result.Replace("{gravity}", GetGravityG().ToString("0.00"));');
    if (h.has('solar_mw')) t.push('    if (result.Contains("{solar}")) result = result.Replace("{solar}", GetSolarOutputMW().ToString("0.00"));');
    if (h.has('reactor_mw')) t.push('    if (result.Contains("{reactor}")) result = result.Replace("{reactor}", GetReactorOutputMW().ToString("0.00"));');
    if (h.has('loop_state')) {
      t.push('    if (result.Contains("{_name}")) result = result.Replace("{_name}", _loopName);');
      t.push('    if (result.Contains("{_value}")) result = result.Replace("{_value}", _loopValue.ToString("0.#"));');
      t.push('    if (result.Contains("{_index}")) result = result.Replace("{_index}", _loopIndex.ToString());');
      t.push('    if (result.Contains("{_count}")) result = result.Replace("{_count}", _loopCount.ToString());');
      t.push('    if (result.Contains("{_enabled}")) result = result.Replace("{_enabled}", _loopEnabled ? "1" : "0");');
      t.push('    if (result.Contains("{_data}")) result = result.Replace("{_data}", _loopData);');
    }
    t.push(
      `    foreach (KeyValuePair<string, string> kv in _strVars) { result = result.Replace("{" + kv.Key + "}", kv.Value);${h.has('bar') ? ' if (result.Contains("{bar:" + kv.Key + "}")) result = result.Replace("{bar:" + kv.Key + "}", BuildBar(GetVar(kv.Key), 12));' : ''} }`
    );
    t.push('    return result;', '}');
    out.push(t.join('\n'), '');
  }

  const ordered = [
    'gui_core',
    'gui_header',
    'gui_bar',
    'gui_gauges',
    'gui_metrics',
    'gui_alert',
    'gui_inventory',
    'gui_text',
    'gui_divider',
    'lcd_core',
    'lcd_style',
    'lcd_inventory',
    'lcd_power',
    'lcd_gas',
    'loop_query',
    'read_block_prop',
    'custom_data_ini',
    'loop_block_action',
    'terminal_action',
    'battery_pct',
    'gas_pct',
    'cargo_pct',
    'vent_o2',
    'ship_speed',
    'gravity_g',
    'solar_mw',
    'reactor_mw',
    'projector_remaining',
    'item_count',
    'door_open',
    'connector_state',
    'sensor_active',
    'turret_target',
    'block_enabled',
    'door_action',
    'airvent_action',
    'light_action',
    'block_power',
    'battery_mode',
    'tank_stockpile',
    'connector_action',
    'thruster_override',
    'sound_action',
    'timer_action',
    'broadcast_text',
    'piston_action',
    'rotor_action',
  ];

  for (const k of ordered) {
    if (h.has(k) && HELPER_SNIPPETS[k]) out.push(HELPER_SNIPPETS[k], '');
  }

  return out;
}

export function generateSpaceEngineersScript(project: ScriptProject): GeneratedScriptResult {
  const ctx: GenContext = {
    helpers: new Set<string>(),
    cooldownTimers: [],
    requiredBlocks: new Map(),
    detectedArguments: new Set(),
    issues: [],
    sameGridOnly: project.sameGridOnly,
    insideGuiScreen: false,
    loopDepth: 0,
    definedFunctions: new Map<string, string>(),
  };

  // Pre-register all user-defined functions so Call Function can resolve them in any order
  const fnBlocks: Array<{ block: ScriptBlock; methodName: string }> = [];
  for (const b of project.blocks) {
    if (!b.disabled && b.type === 'define_function') {
      const rawName = strVal(b.params.name, 'Routine').trim() || 'Routine';
      const methodName = sanitizeMethodName(rawName);
      ctx.definedFunctions.set(rawName.toLowerCase(), methodName);
      fnBlocks.push({ block: b, methodName });
    }
  }

  const setupLines: string[] = [];
  for (const b of project.blocks) {
    if (!b.disabled && b.type === 'on_setup') {
      setupLines.push(...emitBlockList(b.children ?? [], '    ', ctx));
    }
  }

  const mainLines = emitBlockList(project.blocks, '    ', ctx);

  const fnMethodLines: string[] = [];
  for (const entry of fnBlocks) {
    const body = emitBlockList(entry.block.children ?? [], '    ', ctx);
    fnMethodLines.push(`void ${entry.methodName}()`);
    fnMethodLines.push(`{`);
    if (body.length > 0) fnMethodLines.push(...body);
    else fnMethodLines.push(`    // Add blocks inside this function`);
    fnMethodLines.push(`}`);
    fnMethodLines.push(``);
  }

  const lines: string[] = [];
  lines.push(`// ============================================================`);
  lines.push(`// ${project.name || 'Space Engineers Script'}`);
  if (project.description) {
    lines.push(`// ${project.description.replace(/\r?\n/g, ' ')}`);
  }
  lines.push(`// Built with GridLogic — Visual Script Studio for Space Engineers`);
  lines.push(`// Paste directly into a Programmable Block -> Edit -> Check Code -> OK`);
  lines.push(`// ============================================================`);
  lines.push(``);
  lines.push(`const bool SAME_GRID_ONLY = ${project.sameGridOnly ? 'true' : 'false'};`);

  if (ctx.helpers.has('vars')) {
    lines.push(`Dictionary<string, double> _numVars = new Dictionary<string, double>();`);
    lines.push(`Dictionary<string, string> _strVars = new Dictionary<string, string>();`);
  }
  if (ctx.helpers.has('loop_state')) {
    lines.push(`IMyTerminalBlock _loopBlock = null;`);
    lines.push(`string _loopName = "";`);
    lines.push(`double _loopValue = 0.0;`);
    lines.push(`int _loopIndex = 0;`);
    lines.push(`int _loopCount = 0;`);
    lines.push(`bool _loopEnabled = false;`);
    lines.push(`string _loopData = "";`);
  }
  for (const timerField of ctx.cooldownTimers) {
    lines.push(`double ${timerField} = 0.0;`);
  }
  lines.push(``);

  lines.push(`public Program()`);
  lines.push(`{`);
  lines.push(`    Runtime.UpdateFrequency = UpdateFrequency.${project.updateFrequency || 'Update100'};`);
  if (setupLines.length > 0) lines.push(...setupLines);
  lines.push(`}`);
  lines.push(``);

  lines.push(`public void Save()`);
  lines.push(`{`);
  lines.push(`}`);
  lines.push(``);

  lines.push(`public void Main(string argument, UpdateType updateSource)`);
  lines.push(`{`);
  if (mainLines.length === 0) {
    lines.push(`    Echo("Add blocks in GridLogic to build your script.");`);
  } else {
    lines.push(...mainLines);
  }
  lines.push(`}`);

  if (fnMethodLines.length > 0) {
    lines.push(``);
    lines.push(`// -------------------- SCRIPT FUNCTIONS --------------------`);
    lines.push(...fnMethodLines);
  }

  const helperLines = buildHelpers(ctx);
  if (helperLines.length > 0) {
    lines.push(``);
    lines.push(`// -------------------- HELPER FUNCTIONS --------------------`);
    lines.push(...helperLines);
  }

  const code = lines.join('\n').trimEnd() + '\n';
  const staticIssues = validateGeneratedCSharp(code);
  const allIssues = [...ctx.issues, ...staticIssues];

  return {
    code,
    charCount: code.length,
    charLimit: 100000,
    lineCount: code.split('\n').length,
    requiredBlocks: Array.from(ctx.requiredBlocks.values()),
    detectedArguments: Array.from(ctx.detectedArguments),
    issues: allIssues,
  };
}
