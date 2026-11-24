import type { ScriptBlock } from '../types';

export type TemplateVariableCategory = 'telemetry' | 'custom' | 'bar';

export interface TemplateVariableDef {
  token: string;
  key: string;
  label: string;
  category: TemplateVariableCategory;
  groupLabel: string;
  color: string;
  unitHint: string;
  sampleValue: string;
  description: string;
}

export const BUILTIN_GLOBAL_VARIABLES: TemplateVariableDef[] = [
  {
    token: '{battery}',
    key: 'battery',
    label: 'Battery Charge',
    category: 'telemetry',
    groupLabel: 'Power',
    color: '#22C55E',
    unitHint: '%',
    sampleValue: '74',
    description: 'Total charge % across all ship batteries',
  },
  {
    token: '{h2}',
    key: 'h2',
    label: 'Hydrogen Tanks',
    category: 'telemetry',
    groupLabel: 'Fuel',
    color: '#38BDF8',
    unitHint: '%',
    sampleValue: '68',
    description: 'Total fill % across all hydrogen tanks',
  },
  {
    token: '{o2}',
    key: 'o2',
    label: 'Oxygen Tanks',
    category: 'telemetry',
    groupLabel: 'Life Support',
    color: '#2DD4BF',
    unitHint: '%',
    sampleValue: '86',
    description: 'Total fill % across all oxygen tanks',
  },
  {
    token: '{cargo}',
    key: 'cargo',
    label: 'Cargo Fill',
    category: 'telemetry',
    groupLabel: 'Cargo',
    color: '#F59E0B',
    unitHint: '%',
    sampleValue: '54',
    description: 'Total fill % across all cargo containers',
  },
  {
    token: '{speed}',
    key: 'speed',
    label: 'Ship Speed',
    category: 'telemetry',
    groupLabel: 'Flight',
    color: '#60A5FA',
    unitHint: 'm/s',
    sampleValue: '12.4',
    description: 'Current ship velocity from cockpit or remote control',
  },
  {
    token: '{gravity}',
    key: 'gravity',
    label: 'Planetary Gravity',
    category: 'telemetry',
    groupLabel: 'Flight',
    color: '#A78BFA',
    unitHint: 'g',
    sampleValue: '0.00',
    description: 'Natural gravity strength at ship location (in Gs)',
  },
  {
    token: '{solar}',
    key: 'solar',
    label: 'Solar Output',
    category: 'telemetry',
    groupLabel: 'Power',
    color: '#FACC15',
    unitHint: 'MW',
    sampleValue: '2.40',
    description: 'Combined current output of all solar panels (MW)',
  },
  {
    token: '{reactor}',
    key: 'reactor',
    label: 'Reactor Output',
    category: 'telemetry',
    groupLabel: 'Power',
    color: '#FB923C',
    unitHint: 'MW',
    sampleValue: '1.80',
    description: 'Combined current output of all reactors (MW)',
  },
];

export const ASCII_BAR_VARIABLES: TemplateVariableDef[] = [
  {
    token: '{bar:battery}',
    key: 'bar:battery',
    label: 'Battery Text Bar',
    category: 'bar',
    groupLabel: 'Text Bar',
    color: '#64748B',
    unitHint: '',
    sampleValue: '[########----]',
    description: '12-char ASCII progress bar for classic text LCDs',
  },
  {
    token: '{bar:h2}',
    key: 'bar:h2',
    label: 'Hydrogen Text Bar',
    category: 'bar',
    groupLabel: 'Text Bar',
    color: '#64748B',
    unitHint: '',
    sampleValue: '[########----]',
    description: '12-char ASCII progress bar for hydrogen tanks',
  },
  {
    token: '{bar:o2}',
    key: 'bar:o2',
    label: 'Oxygen Text Bar',
    category: 'bar',
    groupLabel: 'Text Bar',
    color: '#64748B',
    unitHint: '',
    sampleValue: '[##########--]',
    description: '12-char ASCII progress bar for oxygen tanks',
  },
  {
    token: '{bar:cargo}',
    key: 'bar:cargo',
    label: 'Cargo Text Bar',
    category: 'bar',
    groupLabel: 'Text Bar',
    color: '#64748B',
    unitHint: '',
    sampleValue: '[######------]',
    description: '12-char ASCII progress bar for cargo capacity',
  },
];

export const LOOP_CONTEXT_VARIABLES: TemplateVariableDef[] = [
  {
    token: '{_name}',
    key: '_name',
    label: 'Loop Block Name',
    category: 'custom',
    groupLabel: 'For-Each',
    color: '#D98A2B',
    unitHint: '',
    sampleValue: 'Battery 1',
    description: 'CustomName of the current block inside a For Each Block loop',
  },
  {
    token: '{_value}',
    key: '_value',
    label: 'Loop Block Value',
    category: 'custom',
    groupLabel: 'For-Each',
    color: '#D98A2B',
    unitHint: '',
    sampleValue: '82',
    description: 'Primary reading of current loop block (charge %, fill %, O2 %, MW, open %)',
  },
  {
    token: '{_index}',
    key: '_index',
    label: 'Loop Index (0..N-1)',
    category: 'custom',
    groupLabel: 'For-Each',
    color: '#D98A2B',
    unitHint: '',
    sampleValue: '0',
    description: 'Current 0-based iteration index inside For Each Block',
  },
  {
    token: '{_count}',
    key: '_count',
    label: 'Loop Match Count',
    category: 'custom',
    groupLabel: 'For-Each',
    color: '#D98A2B',
    unitHint: '',
    sampleValue: '4',
    description: 'Total number of matching blocks in the current For Each Block loop',
  },
  {
    token: '{_enabled}',
    key: '_enabled',
    label: 'Loop Block Enabled',
    category: 'custom',
    groupLabel: 'For-Each',
    color: '#D98A2B',
    unitHint: '',
    sampleValue: '1',
    description: '1 if the current loop block is turned ON, 0 if OFF',
  },
  {
    token: '{_data}',
    key: '_data',
    label: 'Loop Block CustomData',
    category: 'custom',
    groupLabel: 'For-Each',
    color: '#D98A2B',
    unitHint: '',
    sampleValue: 'tag=aux',
    description: 'CustomData string of the current block inside For Each Block',
  },
];

function hasBlockType(blocks: ScriptBlock[], type: string): boolean {
  for (const b of blocks) {
    if (b.type === type) return true;
    if (b.children?.length && hasBlockType(b.children, type)) return true;
    if (b.elseChildren?.length && hasBlockType(b.elseChildren, type)) return true;
  }
  return false;
}

/**
 * Scans the current workspace block tree for all custom variables created via
 * `set_variable`, `change_variable`, `math_op`, `read_block_prop`, `custom_data_io`,
 * or `repeat_times` blocks so they appear automatically in `{` autocomplete and
 * the Variables reference popover.
 */
export function extractCustomVariables(blocks: ScriptBlock[]): TemplateVariableDef[] {
  const seen = new Map<string, string>();

  const register = (raw: unknown, desc: string) => {
    const nm = String(raw ?? '').trim();
    if (nm && !seen.has(nm)) seen.set(nm, desc);
  };

  const walk = (list: ScriptBlock[]): void => {
    for (const block of list) {
      if (block.type === 'set_variable') {
        register(block.params.varName, `Custom variable (${String(block.params.source ?? 'value')})`);
      } else if (block.type === 'change_variable') {
        register(block.params.varName, 'Custom counter variable from Change Variable block');
      } else if (block.type === 'math_op') {
        register(block.params.destVar, `Computed variable (${String(block.params.op ?? '+')})`);
      } else if (block.type === 'read_block_prop') {
        register(block.params.varName, `Block property (${String(block.params.property ?? 'value')})`);
      } else if (block.type === 'custom_data_io' && block.params.mode !== 'write') {
        register(block.params.varName, 'Read from block CustomData');
      } else if (block.type === 'repeat_times') {
        register(block.params.indexVar || 'i', 'Loop counter from Repeat block');
      }
      if (block.children?.length) walk(block.children);
      if (block.elseChildren?.length) walk(block.elseChildren);
    }
  };

  walk(blocks);

  const out: TemplateVariableDef[] = [];
  for (const [name, description] of seen.entries()) {
    out.push({
      token: `{${name}}`,
      key: name,
      label: name,
      category: 'custom',
      groupLabel: 'Script Var',
      color: '#5A9BD4',
      unitHint: '',
      sampleValue: 'var',
      description,
    });
  }
  if (hasBlockType(blocks, 'for_each_block')) {
    out.push(...LOOP_CONTEXT_VARIABLES);
  }
  return out;
}

/**
 * Returns matching template variables for a given search query (e.g., "sp" -> {speed}).
 */
export function getAvailableTemplateVariables(
  blocks: ScriptBlock[],
  query = '',
  includeAsciiBars = true
): TemplateVariableDef[] {
  const custom = extractCustomVariables(blocks);
  const q = query.trim().toLowerCase();
  const loopExtras =
    q.startsWith('_') && !hasBlockType(blocks, 'for_each_block') ? LOOP_CONTEXT_VARIABLES : [];
  const all = includeAsciiBars
    ? [...BUILTIN_GLOBAL_VARIABLES, ...custom, ...loopExtras, ...ASCII_BAR_VARIABLES]
    : [...BUILTIN_GLOBAL_VARIABLES, ...custom, ...loopExtras];

  if (!q) return all;

  return all.filter((v) => {
    const hay = `${v.key} ${v.token} ${v.label} ${v.groupLabel} ${v.description}`.toLowerCase();
    return hay.includes(q);
  });
}

export interface OpenBraceContext {
  start: number;
  end: number;
  query: string;
}

/**
 * Detects if the cursor is currently inside an active `{...` placeholder token.
 * Example: `"Speed: {sp"` at cursor 10 -> `{ start: 7, end: 10, query: "sp" }`.
 * If immediately followed by a closing `}` (e.g. `"{sp|}"`), includes the `}` in `end`
 * so accepting a completion replaces cleanly without doubling `}`.
 */
export function findOpenBraceContext(value: string, cursorPos: number): OpenBraceContext | null {
  const safeCursor = Math.max(0, Math.min(cursorPos, value.length));
  const before = value.slice(0, safeCursor);
  const openIdx = before.lastIndexOf('{');
  if (openIdx === -1) return null;

  const inside = before.slice(openIdx + 1);
  // Abort if already closed before cursor or contains spaces/invalid identifier chars
  if (inside.includes('}') || !/^[a-zA-Z0-9_:-]*$/.test(inside)) {
    return null;
  }

  let end = safeCursor;
  if (value[safeCursor] === '}') {
    end = safeCursor + 1;
  }

  return {
    start: openIdx,
    end,
    query: inside,
  };
}

/**
 * Inserts a `{tag}` token into an input string, replacing either an active `{...`
 * open-brace range or the current selection range, and returns the updated string
 * plus the new caret position immediately after the closing `}`.
 */
export function applyVariableInsertion(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  token: string,
  braceCtx?: OpenBraceContext | null
): { value: string; cursorPos: number } {
  const start = braceCtx ? braceCtx.start : Math.max(0, Math.min(selectionStart, value.length));
  const end = braceCtx ? braceCtx.end : Math.max(start, Math.min(selectionEnd, value.length));
  const nextValue = value.slice(0, start) + token + value.slice(end);
  const cursorPos = start + token.length;
  return { value: nextValue, cursorPos };
}
