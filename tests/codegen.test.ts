import { describe, expect, it } from 'vitest';
import { BLOCK_CATALOG, createBlockInstance } from '../src/blocks/catalog';
import { generateSpaceEngineersScript } from '../src/codegen/csharpGenerator';
import { validateGeneratedCSharp } from '../src/codegen/validator';
import { PRESET_SCRIPTS } from '../src/presets/presets';
import type { ScriptProject } from '../src/types';

describe('Space Engineers C# Code Generator (with Vector GUI HUD)', () => {
  it('generates clean, error-free C# 6.0 code for all 8 preset scripts', () => {
    expect(PRESET_SCRIPTS).toHaveLength(8);
    for (const preset of PRESET_SCRIPTS) {
      const res = generateSpaceEngineersScript(preset.project);
      const errors = res.issues.filter((i) => i.severity === 'error');
      const warnings = res.issues.filter((i) => i.severity === 'warning');

      expect(errors, `Preset ${preset.id} had errors: ${JSON.stringify(errors)}`).toHaveLength(0);
      expect(warnings, `Preset ${preset.id} had warnings: ${JSON.stringify(warnings)}`).toHaveLength(0);
      expect(res.charCount).toBeGreaterThan(200);
      expect(res.charCount).toBeLessThan(100000);
      expect(res.code).toContain('public Program()');
      expect(res.code).toContain('public void Main(string argument, UpdateType updateSource)');
      expect(res.code).not.toMatch(/^\s*using\s+[A-Za-z]/m);
      expect(res.code).not.toContain('class Program');
      expect(res.code).not.toContain('out var ');
      expect(res.requiredBlocks.length).toBeGreaterThan(0);
    }
  });

  it('generates valid MySpriteDrawFrame vector GUI C# for Bridge Telemetry Dashboard', () => {
    const preset = PRESET_SCRIPTS.find((p) => p.id === 'bridge-telemetry-hud')!;
    const res = generateSpaceEngineersScript(preset.project);
    expect(res.issues).toHaveLength(0);
    expect(res.code).toContain('ContentType.SCRIPT');
    expect(res.code).toContain('using (MySpriteDrawFrame _guiFrame = _guiSurf.DrawFrame())');
    expect(res.code).toContain('GuiDrawHeader');
    expect(res.code).toContain('GuiDrawBar');
    expect(res.code).toContain('GuiDrawMetrics');
    expect(res.code).toContain('GuiDrawAlert');
    expect(res.code).toContain('SquareSimple');
    expect(res.code).toContain('IconEnergy');
  });

  it('generates valid C# for every single block in the 35-block catalog', () => {
    const guiScreen = createBlockInstance('gui_screen');
    guiScreen.children = BLOCK_CATALOG.filter((d) => d.guiWidget).map((d) =>
      createBlockInstance(d.type)
    );

    const nonGuiBlocks = BLOCK_CATALOG.filter((d) => !d.guiWidget && d.type !== 'gui_screen').map(
      (def) => {
        const inst = createBlockInstance(def.type);
        if (inst.type === 'if_condition') {
          inst.params.hasElse = true;
          inst.children = [createBlockInstance('pb_echo')];
          inst.elseChildren = [createBlockInstance('comment')];
        } else if (def.isContainer) {
          inst.children = [createBlockInstance('pb_echo')];
        }
        return inst;
      }
    );

    const project: ScriptProject = {
      name: 'All Blocks Stress Test',
      description: 'Validates all 35 blocks including MySprite GUI widgets',
      updateFrequency: 'Update10',
      sameGridOnly: true,
      blocks: [guiScreen, ...nonGuiBlocks],
    };

    const res = generateSpaceEngineersScript(project);
    const errors = res.issues.filter((i) => i.severity === 'error');
    expect(errors, JSON.stringify(errors)).toHaveLength(0);
    expect(res.charCount).toBeLessThan(100000);
    expect(res.code).toContain('IMyTextSurfaceProvider');
    expect(res.code).toContain('GuiDrawGauges');
    expect(res.code).toContain('GuiDrawInventory');
    expect(res.code).toContain('MyInventoryItem');
    expect(res.code).toContain('Me.IsSameConstructAs');
  });

  it('warns cleanly when a GUI widget is placed outside a GUI Screen Canvas', () => {
    const project: ScriptProject = {
      name: 'Misplaced Widget Test',
      description: '',
      updateFrequency: 'Update10',
      sameGridOnly: true,
      blocks: [createBlockInstance('gui_bar')],
    };
    const res = generateSpaceEngineersScript(project);
    expect(res.issues.some((i) => i.severity === 'warning' && i.message.includes('GUI Screen Canvas'))).toBe(true);
    expect(res.issues.filter((i) => i.severity === 'error')).toHaveLength(0);
  });

  it('properly escapes quotes, backslashes, and C# keywords in user inputs', () => {
    const project: ScriptProject = {
      name: 'Quote "Test" \\ Ship',
      description: 'Line1\nLine2',
      updateFrequency: 'Update100',
      sameGridOnly: false,
      blocks: [
        createBlockInstance('set_variable', {
          params: { varName: 'class return 123', source: 'number', value: '42' },
        }),
        createBlockInstance('lcd_write', {
          params: {
            lcdName: 'Bridge "Main" LCD',
            text: 'Value = {class return 123} \\ "OK"',
            append: false,
          },
        }),
      ],
    };

    const res = generateSpaceEngineersScript(project);
    expect(res.issues.filter((i) => i.severity === 'error')).toHaveLength(0);
    expect(res.code).toContain('const bool SAME_GRID_ONLY = false;');
    expect(res.code).toContain('SetVar("class return 123", 42);');
    expect(res.code).toContain('Bridge \\"Main\\" LCD');
  });

  it('detects invalid C# patterns via static validator while allowing using(frame)', () => {
    const goodUsing = `public void Main() { using (MySpriteDrawFrame f = s.DrawFrame()) { } }`;
    expect(validateGeneratedCSharp(goodUsing)).toHaveLength(0);

    const bad = `using System;\nclass Program {\n  public void Main() {\n    if (dict.TryGetValue("a", out var x)) {\n`;
    const issues = validateGeneratedCSharp(bad);
    const msgs = issues.map((i) => i.message).join(' | ');
    expect(msgs).toContain('using');
    expect(msgs).toContain('class Program');
    expect(msgs).toContain('out var');
    expect(msgs).toContain('Unbalanced curly braces');
  });
});
