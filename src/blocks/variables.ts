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

/**
 * Scans the current workspace block tree for all custom variables created via
 * `set_variable` or `change_variable` blocks so they appear automatically in
 * `{` autocomplete and the Variables reference popover.
 */
export function extractCustomVariables(blocks: ScriptBlock[]): TemplateVariableDef[] {
  const seen = new Map<string, string>();

  const walk = (list: ScriptBlock[]): void => {
    for (const block of list) {
      if (block.type === 'set_variable' || block.type === 'change_variable') {
        const rawName = String(block.params.varName ?? '').trim();
        if (rawName && !seen.has(rawName)) {
          const desc =
            block.type === 'change_variable'
              ? 'Custom counter variable from Change Variable block'
              : `Custom variable (${String(block.params.source ?? 'value')})`;
          seen.set(rawName, desc);
        }
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
      color: '#C084FC',
      unitHint: '',
      sampleValue: 'var',
      description,
    });
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
  const all = includeAsciiBars
    ? [...BUILTIN_GLOBAL_VARIABLES, ...custom, ...ASCII_BAR_VARIABLES]
    : [...BUILTIN_GLOBAL_VARIABLES, ...custom];

  const q = query.trim().toLowerCase();
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
