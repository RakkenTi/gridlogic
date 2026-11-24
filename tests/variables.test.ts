import { describe, expect, it } from 'vitest';
import {
  BUILTIN_GLOBAL_VARIABLES,
  applyVariableInsertion,
  extractCustomVariables,
  findOpenBraceContext,
  getAvailableTemplateVariables,
} from '../src/blocks/variables';
import { generateSpaceEngineersScript } from '../src/codegen/csharpGenerator';
import type { ScriptBlock, ScriptProject } from '../src/types';

describe('Template variable autocomplete & registry', () => {
  it('exposes all 8 built-in global telemetry variables', () => {
    const tokens = BUILTIN_GLOBAL_VARIABLES.map((v) => v.token);
    expect(tokens).toEqual([
      '{battery}',
      '{h2}',
      '{o2}',
      '{cargo}',
      '{speed}',
      '{gravity}',
      '{solar}',
      '{reactor}',
    ]);
  });

  it('detects open brace contexts accurately at cursor', () => {
    expect(findOpenBraceContext('{', 1)).toEqual({ start: 0, end: 1, query: '' });
    expect(findOpenBraceContext('Speed: {sp', 10)).toEqual({ start: 7, end: 10, query: 'sp' });
    expect(findOpenBraceContext('Speed: {sp m/s', 10)).toEqual({ start: 7, end: 10, query: 'sp' });
    // Consumes trailing } if cursor is immediately before it
    expect(findOpenBraceContext('Val {bat}', 8)).toEqual({ start: 4, end: 9, query: 'bat' });
    // Ignores closed brace or whitespace inside brace
    expect(findOpenBraceContext('{speed} m/s', 11)).toBeNull();
    expect(findOpenBraceContext('Hello { world', 13)).toBeNull();
    expect(findOpenBraceContext('No braces here', 6)).toBeNull();
  });

  it('inserts variable cleanly replacing open brace or selection', () => {
    const braceCtx = findOpenBraceContext('Speed: {sp m/s', 10);
    expect(applyVariableInsertion('Speed: {sp m/s', 10, 10, '{speed}', braceCtx)).toEqual({
      value: 'Speed: {speed} m/s',
      cursorPos: 14,
    });

    // Does not double closing brace when editing {bat|}
    const closedCtx = findOpenBraceContext('Power {bat}', 10);
    expect(applyVariableInsertion('Power {bat}', 10, 10, '{battery}', closedCtx)).toEqual({
      value: 'Power {battery}',
      cursorPos: 15,
    });

    // Direct picker insertion without open brace
    expect(applyVariableInsertion('Batt:  %', 6, 6, '{battery}', null)).toEqual({
      value: 'Batt: {battery} %',
      cursorPos: 15,
    });
  });

  it('extracts custom variables recursively from nested blocks and deduplicates', () => {
    const blocks: ScriptBlock[] = [
      {
        id: '1',
        type: 'if_condition',
        params: { source: 'battery_pct', operator: '<', value: '20', hasElse: true },
        children: [
          { id: '2', type: 'set_variable', params: { varName: 'alertState', source: 'text', value: 'LOW' } },
          { id: '3', type: 'change_variable', params: { varName: 'ticks', delta: 1 } },
        ],
        elseChildren: [
          { id: '4', type: 'set_variable', params: { varName: 'alertState', source: 'text', value: 'OK' } },
        ],
      },
    ];

    const custom = extractCustomVariables(blocks);
    expect(custom.map((v) => v.token)).toEqual(['{alertState}', '{ticks}']);

    const filtered = getAvailableTemplateVariables(blocks, 'alert', false);
    expect(filtered.map((v) => v.token)).toEqual(['{alertState}']);

    const speedFiltered = getAvailableTemplateVariables(blocks, 'sp', false);
    expect(speedFiltered.map((v) => v.token)).toEqual(['{speed}']);
  });

  it('supports template variables in gui_divider labels during C# codegen', () => {
    const project: ScriptProject = {
      name: 'Divider Var Test',
      description: '',
      updateFrequency: 'Update10',
      sameGridOnly: true,
      blocks: [
        {
          id: 's1',
          type: 'gui_screen',
          params: { lcdName: 'Status LCD', surfaceIndex: 0, bgColor: '#08111A', accentColor: '#2B9FD9', showBorder: true, showGrid: false },
          children: [
            { id: 'd1', type: 'gui_divider', params: { label: 'POWER {battery}%', color: '#334155' } },
          ],
        },
      ],
    };

    const res = generateSpaceEngineersScript(project);
    expect(res.issues.filter((i) => i.severity === 'error')).toHaveLength(0);
    expect(res.code).toContain('FormatTemplate("POWER {battery}%")');
  });
});
