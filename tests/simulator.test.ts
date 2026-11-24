import { describe, expect, it } from 'vitest';
import { PRESET_SCRIPTS } from '../src/presets/presets';
import { createDefaultSimInputs, ShipSimulatorSession } from '../src/simulator/engine';

describe('Virtual Space Engineers Ship Simulator (Vector GUI & Hardware)', () => {
  it('runs Bridge Telemetry Dashboard GUI with dynamic bar colors and low-battery alert', () => {
    const preset = PRESET_SCRIPTS.find((p) => p.id === 'bridge-telemetry-hud')!;
    const sim = new ShipSimulatorSession();
    const inputs = createDefaultSimInputs();

    inputs.batteryPct = 78;
    const normal = sim.step(preset.project, inputs);
    const lcd1 = normal.lcds['Status LCD'];
    expect(lcd1).toBeDefined();
    expect(lcd1.mode).toBe('gui');
    const ops1 = lcd1.guiOps!;
    expect(ops1.some((o) => o.kind === 'header' && o.title === 'BRIDGE TELEMETRY')).toBe(true);
    const battBar1 = ops1.find((o) => o.kind === 'bar' && o.label === 'BATTERY POWER');
    expect(battBar1 && battBar1.kind === 'bar' ? battBar1.color : '').toBe('#22C55E');
    expect(ops1.some((o) => o.kind === 'alert')).toBe(false);

    // Drop battery below 20% -> bar turns red AND critical alert banner appears!
    inputs.batteryPct = 14;
    const low = sim.step(preset.project, inputs);
    const ops2 = low.lcds['Status LCD'].guiOps!;
    const battBar2 = ops2.find((o) => o.kind === 'bar' && o.label === 'BATTERY POWER');
    expect(battBar2 && battBar2.kind === 'bar' ? battBar2.color : '').toBe('#EF4444');
    expect(ops2.some((o) => o.kind === 'alert' && o.severity === 'critical')).toBe(true);
  });

  it('runs Ship Inventory LCD Display GUI preset and warns when cargo >= 85%', () => {
    const preset = PRESET_SCRIPTS.find((p) => p.id === 'ship-inventory-lcd')!;
    const sim = new ShipSimulatorSession();
    const inputs = createDefaultSimInputs();

    inputs.cargoPct = 54;
    const res1 = sim.step(preset.project, inputs);
    const lcd = res1.lcds['Inventory LCD'];
    expect(lcd.mode).toBe('gui');
    const invOp = lcd.guiOps!.find((o) => o.kind === 'inventory');
    expect(invOp && invOp.kind === 'inventory' ? invOp.rows[0].name : '').toBe('Iron (Ingot)');
    expect(res1.blocks['light:Cargo Warning Light'].state).toBe('OFF');

    inputs.cargoPct = 92;
    const res2 = sim.step(preset.project, inputs);
    expect(res2.lcds['Inventory LCD'].guiOps!.some((o) => o.kind === 'alert')).toBe(true);
    expect(res2.blocks['light:Cargo Warning Light'].state).toContain('BLINK');
  });

  it('runs Cockpit Ring Gauges HUD with 3 live ring dials', () => {
    const preset = PRESET_SCRIPTS.find((p) => p.id === 'cockpit-ring-gauges')!;
    const sim = new ShipSimulatorSession();
    const inputs = createDefaultSimInputs();
    const res = sim.step(preset.project, inputs);
    const lcd = res.lcds['Fighter Cockpit'];
    expect(lcd.mode).toBe('gui');
    const gauges = lcd.guiOps!.find((o) => o.kind === 'gauges');
    expect(gauges && gauges.kind === 'gauges' ? gauges.items : []).toHaveLength(3);
  });

  it('runs Low-Power Emergency Reactor preset with hysteresis', () => {
    const preset = PRESET_SCRIPTS.find((p) => p.id === 'emergency-backup-reactor')!;
    const sim = new ShipSimulatorSession();
    const inputs = createDefaultSimInputs();

    inputs.batteryPct = 15;
    const low = sim.step(preset.project, inputs);
    expect(low.blocks['power:Backup Reactor'].state).toBe('ONLINE');
    expect(low.blocks['sound:Alert Sound'].state).toBe('PLAYING ALARM');

    inputs.batteryPct = 50;
    const mid = sim.step(preset.project, inputs);
    expect(mid.blocks['power:Backup Reactor'].state).toBe('ONLINE');

    inputs.batteryPct = 85;
    const high = sim.step(preset.project, inputs);
    expect(high.blocks['power:Backup Reactor'].state).toBe('OFFLINE');
    expect(high.blocks['sound:Alert Sound'].state).toBe('SILENT');
  });

  it('cycles Smart Automatic Airlock through exit -> vacuum -> outer door open with GUI HUD', () => {
    const preset = PRESET_SCRIPTS.find((p) => p.id === 'smart-airlock')!;
    const sim = new ShipSimulatorSession();
    const inputs = createDefaultSimInputs();
    inputs.ventO2Pct = 100;

    const step1 = sim.step(preset.project, inputs, 'exit');
    expect(step1.variables['airlockState']).toBe('DEPRESSURIZING');
    expect(step1.blocks['door:Airlock Inner Door'].state).toBe('LOCKED (OFF)');

    inputs.ventO2Pct = 0;
    const step2 = sim.step(preset.project, inputs, '');
    expect(step2.variables['airlockState']).toBe('VACUUM - OUTER OPEN');
    expect(step2.blocks['door:Airlock Outer Door'].state).toBe('OPEN');
    expect(step2.lcds['Airlock LCD'].mode).toBe('gui');
  });

  it('switches Docking & Refuel Manager states on connector lock/unlock', () => {
    const preset = PRESET_SCRIPTS.find((p) => p.id === 'docking-refuel-manager')!;
    const sim = new ShipSimulatorSession();
    const inputs = createDefaultSimInputs();

    inputs.connectorStatus = 'Connected';
    const docked = sim.step(preset.project, inputs);
    expect(docked.blocks['batt:All Ship Batteries'].state).toBe('RECHARGE');
    expect(docked.blocks['tank:HYDROGEN Tanks'].state).toBe('STOCKPILE ON');
    expect(docked.blocks['power:Ship Thrusters'].state).toBe('OFFLINE');

    inputs.connectorStatus = 'Unconnected';
    const flight = sim.step(preset.project, inputs);
    expect(flight.blocks['batt:All Ship Batteries'].state).toBe('AUTO');
    expect(flight.blocks['power:Ship Thrusters'].state).toBe('ONLINE');
  });
});
