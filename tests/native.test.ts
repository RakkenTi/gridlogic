import { describe, expect, it } from 'vitest';
import { generateSpaceEngineersScript } from '../src/codegen/csharpGenerator';
import { PRESET_SCRIPTS } from '../src/presets/presets';
import { createDefaultSimInputs, ShipSimulatorSession } from '../src/simulator/engine';

describe('Native Composable Primitives & Advanced Native Examples', () => {
  const nativeIds = [
    'native-power-grid-balancer',
    'native-dynamic-battery-array',
    'native-smart-door-sentinel',
  ];

  it('generates clean, zero-error SE C# 6.0 for all 3 advanced native examples', () => {
    for (const id of nativeIds) {
      const preset = PRESET_SCRIPTS.find((p) => p.id === id);
      expect(preset, `Preset ${id} should exist`).toBeDefined();
      expect(preset!.tier).toBe('native');
      const res = generateSpaceEngineersScript(preset!.project);
      const errors = res.issues.filter((i) => i.severity === 'error');
      const warnings = res.issues.filter((i) => i.severity === 'warning');
      expect(errors, `${id} C# errors: ${JSON.stringify(errors)}`).toHaveLength(0);
      expect(warnings, `${id} C# warnings: ${JSON.stringify(warnings)}`).toHaveLength(0);
    }
  });

  it('executes Adaptive Power & Load Shedding natively (CustomData INI + Functions + For-Each + compound AND)', () => {
    const preset = PRESET_SCRIPTS.find((p) => p.id === 'native-power-grid-balancer')!;
    const gen = generateSpaceEngineersScript(preset.project);
    expect(gen.code).toContain('void Fn_ShedAuxLoad()');
    expect(gen.code).toContain('void Fn_RestoreAuxLoad()');
    expect(gen.code).toContain('ReadIniIntoVar(Me, "minBatt"');
    expect(gen.code).toContain('QueryLoopBlocks("functional", "tag", "[Aux]")');
    expect(gen.code).toContain('&&');

    const sim = new ShipSimulatorSession();
    const inputs = createDefaultSimInputs();
    // Normal battery (74% >= 25% minBatt from CustomData) -> RestoreAuxLoad runs, shedCount = 0
    const nominal = sim.step(preset.project, inputs);
    expect(nominal.variables.minBatt).toBe(25);
    expect(nominal.variables.shedCount).toBe(0);
    expect(nominal.variables.gridMode).toBe('NOMINAL');
    expect(nominal.lcds['Power HUD LCD']?.mode).toBe('gui');

    // Low battery (18% < 25%) and NOT docked -> ShedAuxLoad turns off all 3 [Aux] blocks!
    inputs.batteryPct = 18;
    inputs.connectorStatus = 'Unconnected';
    const shedding = sim.step(preset.project, inputs);
    expect(shedding.variables.shedCount).toBe(3);
    expect(shedding.variables.gridMode).toBe('LOAD SHED');
    expect(shedding.blocks['term:Backup Reactor']?.state).toContain('OnOff_On');

    // Docked even at 18% -> compound AND is false -> restores aux blocks!
    inputs.connectorStatus = 'Connected';
    const docked = sim.step(preset.project, inputs);
    expect(docked.variables.shedCount).toBe(0);
    expect(docked.variables.gridMode).toBe('NOMINAL');
  });

  it('executes Dynamic Per-Battery Array Monitor natively (loop-driven GUI bars + math average)', () => {
    const preset = PRESET_SCRIPTS.find((p) => p.id === 'native-dynamic-battery-array')!;
    const gen = generateSpaceEngineersScript(preset.project);
    expect(gen.code).toContain('QueryLoopBlocks("battery", "all", "")');
    expect(gen.code).toContain('GuiDrawBar(_guiFrame, _guiVp, ref _guiY, FormatTemplate("{_name}"), _loopValue');

    const sim = new ShipSimulatorSession();
    const inputs = createDefaultSimInputs();
    inputs.batteryPct = 22; // Forces some cells below 25%
    const res = sim.step(preset.project, inputs);
    const hud = res.lcds['Battery Array LCD'];
    expect(hud?.mode).toBe('gui');
    const barOps = (hud?.guiOps ?? []).filter((op) => op.kind === 'bar');
    expect(barOps.length).toBe(4); // 4 virtual batteries rendered dynamically!
    expect(Number(res.variables.lowCells)).toBeGreaterThan(0);
    expect(Number(res.variables.avgPct)).toBeGreaterThan(0);
  });

  it('executes Auto-Door Closer & O2 Breach Sentinel natively (2 Functions + Math.Min + Float Terminal Prop)', () => {
    const preset = PRESET_SCRIPTS.find((p) => p.id === 'native-smart-door-sentinel')!;
    const gen = generateSpaceEngineersScript(preset.project);
    expect(gen.code).toContain('void Fn_ScanAutoDoors()');
    expect(gen.code).toContain('void Fn_ScanRoomVents()');
    expect(gen.code).toContain('Math.Min(');
    expect(gen.code).toContain('Blink Interval Seconds');

    const sim = new ShipSimulatorSession();
    const inputs = createDefaultSimInputs();
    inputs.doorOpen = true;
    inputs.ventO2Pct = 42; // Below minO2 (65)
    const res = sim.step(preset.project, inputs);
    expect(res.variables.closedDoors).toBe(2); // 2 [Auto] doors closed!
    expect(res.variables.hullStatus).toBe('BREACH');
    expect(Number(res.variables.minRoomO2)).toBeLessThan(65);
    expect(res.blocks['term:Bridge Light']?.state).toContain('0.5');
  });
});
