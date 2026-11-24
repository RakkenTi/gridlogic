import type {
  BlockCategory,
  BlockDefinition,
  BlockType,
  ConditionSource,
  ScriptBlock,
  SelectOption,
} from '../types';

export interface CategoryMeta {
  id: BlockCategory;
  label: string;
  shortLabel: string;
  description: string;
  color: string;
  accentBg: string;
}

export const BLOCK_CATEGORIES: CategoryMeta[] = [
  {
    id: 'gui',
    label: 'GUI Screens (Modern HUD)',
    shortLabel: 'GUI HUD',
    description: 'Modern vector bars, ring gauges, stat cards & alert banners for LCDs and Cockpits',
    color: '#2B9FD9',
    accentBg: 'rgba(43, 159, 217, 0.14)',
  },
  {
    id: 'control',
    label: 'Logic & Events',
    shortLabel: 'Logic',
    description: 'If/Else rules, button arguments, timers, and variables',
    color: '#D48A29',
    accentBg: 'rgba(212, 138, 41, 0.14)',
  },
  {
    id: 'display',
    label: 'Text LCDs & Console',
    shortLabel: 'Text LCD',
    description: 'Classic text screens, quick print lines, and PB Echo logs',
    color: '#25968A',
    accentBg: 'rgba(37, 150, 138, 0.14)',
  },
  {
    id: 'habitat',
    label: 'Doors, Vents & Lights',
    shortLabel: 'Habitat',
    description: 'Airlocks, bulkhead doors, vents, and alert lighting',
    color: '#3482B5',
    accentBg: 'rgba(52, 130, 181, 0.14)',
  },
  {
    id: 'systems',
    label: 'Power, Fuel & Docking',
    shortLabel: 'Systems',
    description: 'Reactors, batteries, H2/O2 tanks, connectors, and thrusters',
    color: '#C85B32',
    accentBg: 'rgba(200, 91, 50, 0.14)',
  },
  {
    id: 'automation',
    label: 'Alerts & Mechanics',
    shortLabel: 'Mechanics',
    description: 'Sound alarms, timers, antennas, pistons, and rotors',
    color: '#7C8B3E',
    accentBg: 'rgba(124, 139, 62, 0.14)',
  },
];

export const BOOLEAN_CONDITION_SOURCES: ConditionSource[] = [
  'door_is_open',
  'connector_connected',
  'connector_ready',
  'sensor_active',
  'turret_has_target',
  'block_enabled',
];

export const TARGET_CONDITION_SOURCES: ConditionSource[] = [
  'vent_o2_pct',
  'projector_remaining',
  'door_is_open',
  'connector_connected',
  'connector_ready',
  'sensor_active',
  'turret_has_target',
  'block_enabled',
];

export const CONDITION_SOURCE_OPTIONS: SelectOption[] = [
  { value: 'battery_pct', label: 'Battery Charge (%)' },
  { value: 'h2_pct', label: 'Hydrogen Tanks (%)' },
  { value: 'o2_pct', label: 'Oxygen Tanks (%)' },
  { value: 'cargo_pct', label: 'Cargo Fill (%)' },
  { value: 'vent_o2_pct', label: 'Air Vent Oxygen (%)' },
  { value: 'ship_speed', label: 'Ship Speed (m/s)' },
  { value: 'gravity_g', label: 'Natural Gravity (g)' },
  { value: 'item_count', label: 'Item Amount in Ship' },
  { value: 'solar_mw', label: 'Solar Output (MW)' },
  { value: 'reactor_mw', label: 'Reactor Output (MW)' },
  { value: 'projector_remaining', label: 'Projector Blocks Left' },
  { value: 'door_is_open', label: 'Door Is Open' },
  { value: 'connector_connected', label: 'Connector Is Connected' },
  { value: 'connector_ready', label: 'Connector Ready to Lock' },
  { value: 'sensor_active', label: 'Sensor Is Detecting' },
  { value: 'turret_has_target', label: 'Any Turret Has Target' },
  { value: 'block_enabled', label: 'Block Is Turned On' },
  { value: 'argument_equals', label: 'Run Argument Equals' },
  { value: 'variable', label: 'Variable Value' },
];

export const GUI_PERCENT_SOURCE_OPTIONS: SelectOption[] = [
  { value: 'battery_pct', label: 'Battery Charge (%)' },
  { value: 'h2_pct', label: 'Hydrogen Tanks (%)' },
  { value: 'o2_pct', label: 'Oxygen Tanks (%)' },
  { value: 'cargo_pct', label: 'Cargo Fill (%)' },
  { value: 'vent_o2_pct', label: 'Air Vent Oxygen (%)' },
  { value: 'ship_speed', label: 'Ship Speed (0-100 m/s)' },
  { value: 'variable', label: 'Variable (0-100)' },
];

export const VALUE_SOURCE_OPTIONS: SelectOption[] = [
  { value: 'number', label: 'Fixed Number' },
  { value: 'text', label: 'Fixed Text' },
  { value: 'battery_pct', label: 'Battery Charge (%)' },
  { value: 'h2_pct', label: 'Hydrogen Tanks (%)' },
  { value: 'o2_pct', label: 'Oxygen Tanks (%)' },
  { value: 'cargo_pct', label: 'Cargo Fill (%)' },
  { value: 'vent_o2_pct', label: 'Air Vent Oxygen (%)' },
  { value: 'ship_speed', label: 'Ship Speed (m/s)' },
  { value: 'gravity_g', label: 'Natural Gravity (g)' },
  { value: 'solar_mw', label: 'Solar Output (MW)' },
  { value: 'reactor_mw', label: 'Reactor Output (MW)' },
  { value: 'item_count', label: 'Item Amount in Ship' },
];

export const ITEM_CATEGORY_OPTIONS: SelectOption[] = [
  { value: 'MyObjectBuilder_Ore', label: 'Ore' },
  { value: 'MyObjectBuilder_Ingot', label: 'Ingot' },
  { value: 'MyObjectBuilder_Component', label: 'Component' },
  { value: 'MyObjectBuilder_AmmoMagazine', label: 'Ammo' },
];

export const BLOCK_CATALOG: BlockDefinition[] = [
  // ======================== MODERN VECTOR GUI SCREENS ========================
  {
    type: 'gui_screen',
    category: 'gui',
    label: 'GUI Screen Canvas',
    shortDesc: 'Draw modern vector HUD widgets on any LCD Panel or Cockpit screen',
    seApiSummary: 'ContentType.SCRIPT + IMyTextSurface.DrawFrame() (MySpriteDrawFrame)',
    isContainer: true,
    defaults: {
      lcdName: 'Status LCD',
      surfaceIndex: 0,
      bgColor: '#08111A',
      frameColor: '#2B9FD9',
      showFrame: true,
      showGrid: false,
    },
    fields: [
      { key: 'lcdName', label: 'LCD / Cockpit', type: 'text', placeholder: 'Status LCD or Cockpit', width: 'md' },
      { key: 'surfaceIndex', label: 'Screen #', type: 'number', min: 0, max: 8, step: 1, width: 'sm' },
      { key: 'bgColor', label: 'BG', type: 'color' },
      { key: 'frameColor', label: 'Accent', type: 'color' },
      { key: 'showFrame', label: 'Frame Border', type: 'boolean' },
      { key: 'showGrid', label: 'Grid BG', type: 'boolean' },
    ],
  },
  {
    type: 'gui_header',
    category: 'gui',
    label: 'GUI Header Banner',
    shortDesc: 'Top title bar with accent stripe and optional live status badge',
    seApiSummary: 'MySprite header banner + status pill',
    guiWidget: true,
    defaults: {
      title: 'SHIP TELEMETRY',
      badge: 'NOMINAL',
      accentColor: '#38A3D1',
    },
    fields: [
      { key: 'title', label: 'Title', type: 'text', placeholder: 'SHIP TELEMETRY', width: 'md', supportsVars: true },
      { key: 'badge', label: 'Right Badge', type: 'text', placeholder: 'NOMINAL or {speed} m/s', width: 'md', supportsVars: true },
      { key: 'accentColor', label: 'Accent', type: 'color' },
    ],
  },
  {
    type: 'gui_bar',
    category: 'gui',
    label: 'GUI Progress Bar',
    shortDesc: 'Modern segmented, smooth, or compact graphical bar with auto-colors',
    seApiSummary: 'MySprite vector progress bar (SquareSimple + Icon)',
    guiWidget: true,
    defaults: {
      label: 'BATTERY',
      source: 'battery_pct',
      target: '',
      style: 'segmented',
      icon: 'energy',
      colorMode: 'auto',
      color: '#22C55E',
    },
    fields: [
      { key: 'label', label: 'Label', type: 'text', placeholder: 'BATTERY', width: 'md', supportsVars: true },
      { key: 'source', label: 'Data', type: 'select', options: GUI_PERCENT_SOURCE_OPTIONS, width: 'md' },
      {
        key: 'target',
        label: 'Vent / Var',
        type: 'text',
        placeholder: 'Airlock Vent or var',
        width: 'sm',
        visibleWhen: (p) => p.source === 'vent_o2_pct' || p.source === 'variable',
      },
      {
        key: 'style',
        label: 'Style',
        type: 'select',
        options: [
          { value: 'segmented', label: 'Segmented Cells' },
          { value: 'smooth', label: 'Smooth Precision' },
          { value: 'compact', label: 'Compact Slim' },
        ],
        width: 'md',
      },
      {
        key: 'icon',
        label: 'Icon',
        type: 'select',
        options: [
          { value: 'none', label: 'No Icon' },
          { value: 'energy', label: 'Power Bolt' },
          { value: 'hydrogen', label: 'Hydrogen (H2)' },
          { value: 'oxygen', label: 'Oxygen (O2)' },
          { value: 'cargo', label: 'Cargo Wrench' },
          { value: 'danger', label: 'Warning' },
        ],
        width: 'sm',
      },
      {
        key: 'colorMode',
        label: 'Color',
        type: 'select',
        options: [
          { value: 'auto', label: 'Auto (Low=Red)' },
          { value: 'auto_high_bad', label: 'Auto (Full=Red)' },
          { value: 'custom', label: 'Custom Color' },
        ],
        width: 'md',
      },
      {
        key: 'color',
        label: 'Fill',
        type: 'color',
        visibleWhen: (p) => p.colorMode === 'custom',
      },
    ],
  },
  {
    type: 'gui_gauges',
    category: 'gui',
    label: 'GUI Ring Gauges Row',
    shortDesc: 'Draw 2 or 3 circular vector ring dials side-by-side (great for cockpits)',
    seApiSummary: 'MySprite radial arc gauges + CircleHollow',
    guiWidget: true,
    defaults: {
      count: '3',
      label1: 'BATTERY',
      source1: 'battery_pct',
      label2: 'HYDROGEN',
      source2: 'h2_pct',
      label3: 'OXYGEN',
      source3: 'o2_pct',
    },
    fields: [
      {
        key: 'count',
        label: 'Dials',
        type: 'select',
        options: [
          { value: '2', label: '2 Gauges' },
          { value: '3', label: '3 Gauges' },
        ],
        width: 'sm',
      },
      { key: 'label1', label: '#1 Label', type: 'text', placeholder: 'BATTERY', width: 'sm' },
      { key: 'source1', label: '#1 Data', type: 'select', options: GUI_PERCENT_SOURCE_OPTIONS, width: 'md' },
      { key: 'label2', label: '#2 Label', type: 'text', placeholder: 'HYDROGEN', width: 'sm' },
      { key: 'source2', label: '#2 Data', type: 'select', options: GUI_PERCENT_SOURCE_OPTIONS, width: 'md' },
      {
        key: 'label3',
        label: '#3 Label',
        type: 'text',
        placeholder: 'OXYGEN',
        width: 'sm',
        visibleWhen: (p) => String(p.count) === '3',
      },
      {
        key: 'source3',
        label: '#3 Data',
        type: 'select',
        options: GUI_PERCENT_SOURCE_OPTIONS,
        width: 'md',
        visibleWhen: (p) => String(p.count) === '3',
      },
    ],
  },
  {
    type: 'gui_metrics',
    category: 'gui',
    label: 'GUI Stat Cards Row',
    shortDesc: '2 or 3 sleek side-by-side digital telemetry tiles (Speed, Gravity, Solar)',
    seApiSummary: 'MySprite framed stat tiles',
    guiWidget: true,
    defaults: {
      count: '3',
      accentColor: '#38A3D1',
      label1: 'SPEED',
      val1: '{speed} m/s',
      label2: 'GRAVITY',
      val2: '{gravity} g',
      label3: 'SOLAR',
      val3: '{solar} MW',
    },
    fields: [
      {
        key: 'count',
        label: 'Tiles',
        type: 'select',
        options: [
          { value: '2', label: '2 Cards' },
          { value: '3', label: '3 Cards' },
        ],
        width: 'sm',
      },
      { key: 'accentColor', label: 'Accent', type: 'color' },
      { key: 'label1', label: '#1 Label', type: 'text', placeholder: 'SPEED', width: 'sm' },
      { key: 'val1', label: '#1 Value', type: 'text', placeholder: '{speed} m/s', width: 'sm', supportsVars: true },
      { key: 'label2', label: '#2 Label', type: 'text', placeholder: 'GRAVITY', width: 'sm' },
      { key: 'val2', label: '#2 Value', type: 'text', placeholder: '{gravity} g', width: 'sm', supportsVars: true },
      {
        key: 'label3',
        label: '#3 Label',
        type: 'text',
        placeholder: 'SOLAR',
        width: 'sm',
        visibleWhen: (p) => String(p.count) === '3',
      },
      {
        key: 'val3',
        label: '#3 Value',
        type: 'text',
        placeholder: '{solar} MW',
        width: 'sm',
        supportsVars: true,
        visibleWhen: (p) => String(p.count) === '3',
      },
    ],
  },
  {
    type: 'gui_alert',
    category: 'gui',
    label: 'GUI Alert / Status Banner',
    shortDesc: 'High-contrast warning or status bar — drop inside an If Condition!',
    seApiSummary: 'MySprite alert bar + Danger icon',
    guiWidget: true,
    defaults: {
      severity: 'critical',
      message: 'LOW BATTERY — ACTIVATE BACKUP POWER',
    },
    fields: [
      {
        key: 'severity',
        label: 'Style',
        type: 'select',
        options: [
          { value: 'critical', label: 'Critical (Red)' },
          { value: 'warning', label: 'Warning (Amber)' },
          { value: 'nominal', label: 'Nominal (Green)' },
          { value: 'info', label: 'Info (Cyan)' },
        ],
        width: 'md',
      },
      { key: 'message', label: 'Message', type: 'text', placeholder: 'Alert text or {var}...', width: 'lg', supportsVars: true },
    ],
  },
  {
    type: 'gui_inventory',
    category: 'gui',
    label: 'GUI Inventory Bars',
    shortDesc: 'Modern vector cargo fill bar + top ship items with visual quantity bars',
    seApiSummary: 'IMyInventory + MySprite graphical inventory list',
    guiWidget: true,
    defaults: {
      category: 'all',
      sortBy: 'amount_desc',
      maxItems: 8,
      accentColor: '#38D9A9',
      containerFilter: '',
    },
    fields: [
      {
        key: 'category',
        label: 'Items',
        type: 'select',
        options: [
          { value: 'all', label: 'All Items' },
          { value: 'ore', label: 'Ores Only' },
          { value: 'ingot', label: 'Ingots Only' },
          { value: 'component', label: 'Components Only' },
          { value: 'ammo', label: 'Ammo & Tools' },
          { value: 'ore_ingot', label: 'Ores & Ingots' },
        ],
        width: 'md',
      },
      {
        key: 'sortBy',
        label: 'Sort',
        type: 'select',
        options: [
          { value: 'amount_desc', label: 'Highest First' },
          { value: 'name_asc', label: 'Alphabetical' },
        ],
        width: 'sm',
      },
      { key: 'maxItems', label: 'Rows', type: 'number', min: 3, max: 14, step: 1, width: 'sm' },
      { key: 'accentColor', label: 'Color', type: 'color' },
      { key: 'containerFilter', label: 'Tag Filter', type: 'text', placeholder: '(optional)', width: 'sm' },
    ],
  },
  {
    type: 'gui_text',
    category: 'gui',
    label: 'GUI Text Line',
    shortDesc: 'Crisp typography line inside a GUI canvas supporting {battery}, {var}',
    seApiSummary: 'MySprite SpriteType.TEXT',
    guiWidget: true,
    defaults: {
      text: 'Status: {airlockState}',
      size: 'body',
      align: 'CENTER',
      color: '#E2E8F0',
    },
    fields: [
      { key: 'text', label: 'Text', type: 'text', placeholder: 'Text or {var}...', width: 'lg', supportsVars: true },
      {
        key: 'size',
        label: 'Size',
        type: 'select',
        options: [
          { value: 'heading', label: 'Large' },
          { value: 'body', label: 'Normal' },
          { value: 'caption', label: 'Small' },
        ],
        width: 'sm',
      },
      {
        key: 'align',
        label: 'Align',
        type: 'select',
        options: [
          { value: 'LEFT', label: 'Left' },
          { value: 'CENTER', label: 'Center' },
          { value: 'RIGHT', label: 'Right' },
        ],
        width: 'sm',
      },
      { key: 'color', label: 'Color', type: 'color' },
    ],
  },
  {
    type: 'gui_divider',
    category: 'gui',
    label: 'GUI Section Divider',
    shortDesc: 'Clean horizontal separator rule with optional section label',
    seApiSummary: 'MySprite horizontal divider line',
    guiWidget: true,
    defaults: {
      label: 'SYSTEMS',
      color: '#334155',
    },
    fields: [
      { key: 'label', label: 'Label (opt)', type: 'text', placeholder: 'e.g. POWER & FUEL', width: 'md', supportsVars: true },
      { key: 'color', label: 'Color', type: 'color' },
    ],
  },

  // ======================== LOGIC & EVENTS ========================
  {
    type: 'if_condition',
    category: 'control',
    label: 'If Condition',
    shortDesc: 'Run blocks (or show GUI alerts!) only when a ship sensor matches your rule',
    seApiSummary: 'if (...) { ... } else { ... }',
    isContainer: true,
    supportsElse: true,
    defaults: {
      source: 'battery_pct',
      target: '',
      itemCategory: 'MyObjectBuilder_Ingot',
      itemSubtype: 'Uranium',
      varName: 'state',
      operator: '<',
      boolExpect: 'true',
      value: 20,
      hasElse: false,
    },
    fields: [
      {
        key: 'source',
        label: 'Check',
        type: 'select',
        options: CONDITION_SOURCE_OPTIONS,
        width: 'lg',
      },
      {
        key: 'target',
        label: 'Block Name',
        type: 'text',
        placeholder: 'e.g. Airlock Vent',
        width: 'md',
        visibleWhen: (p) =>
          TARGET_CONDITION_SOURCES.includes(String(p.source) as ConditionSource),
      },
      {
        key: 'itemCategory',
        label: 'Type',
        type: 'select',
        options: ITEM_CATEGORY_OPTIONS,
        width: 'sm',
        visibleWhen: (p) => p.source === 'item_count',
      },
      {
        key: 'itemSubtype',
        label: 'Item ID',
        type: 'text',
        placeholder: 'Iron, Uranium, SteelPlate',
        width: 'md',
        visibleWhen: (p) => p.source === 'item_count',
      },
      {
        key: 'varName',
        label: 'Variable',
        type: 'text',
        placeholder: 'myVar',
        width: 'sm',
        visibleWhen: (p) => p.source === 'variable',
      },
      {
        key: 'operator',
        label: 'Compare',
        type: 'select',
        options: [
          { value: '<', label: 'is less than (<)' },
          { value: '<=', label: 'is at most (<=)' },
          { value: '>', label: 'is greater than (>)' },
          { value: '>=', label: 'is at least (>=)' },
          { value: '==', label: 'equals (==)' },
          { value: '!=', label: 'does not equal (!=)' },
        ],
        width: 'md',
        visibleWhen: (p) =>
          !BOOLEAN_CONDITION_SOURCES.includes(String(p.source) as ConditionSource) &&
          p.source !== 'argument_equals',
      },
      {
        key: 'boolExpect',
        label: 'State',
        type: 'select',
        options: [
          { value: 'true', label: 'is TRUE' },
          { value: 'false', label: 'is FALSE' },
        ],
        width: 'sm',
        visibleWhen: (p) =>
          BOOLEAN_CONDITION_SOURCES.includes(String(p.source) as ConditionSource),
      },
      {
        key: 'value',
        label: 'Value',
        type: 'text',
        placeholder: '20',
        width: 'sm',
        visibleWhen: (p) =>
          !BOOLEAN_CONDITION_SOURCES.includes(String(p.source) as ConditionSource),
      },
    ],
  },
  {
    type: 'on_argument',
    category: 'control',
    label: 'On Run Argument',
    shortDesc: 'Trigger actions from a cockpit button, toolbar, or sensor argument',
    seApiSummary: 'argument.Equals("...", StringComparison.OrdinalIgnoreCase)',
    isContainer: true,
    defaults: {
      argument: 'toggle',
    },
    fields: [
      {
        key: 'argument',
        label: 'Argument Text',
        type: 'text',
        placeholder: 'e.g. cycle, dock, reset',
        width: 'md',
      },
    ],
  },
  {
    type: 'on_setup',
    category: 'control',
    label: 'On Script Start',
    shortDesc: 'Runs once when you click Recompile or load your save',
    seApiSummary: 'public Program() { ... }',
    isContainer: true,
    defaults: {},
    fields: [],
  },
  {
    type: 'cooldown',
    category: 'control',
    label: 'Run Every X Seconds',
    shortDesc: 'Throttle actions inside this block to run on a timed interval',
    seApiSummary: 'Runtime.TimeSinceLastRun.TotalSeconds accumulator',
    isContainer: true,
    defaults: {
      seconds: 5,
    },
    fields: [
      {
        key: 'seconds',
        label: 'Seconds',
        type: 'number',
        min: 0.5,
        max: 3600,
        step: 0.5,
        width: 'sm',
      },
    ],
  },
  {
    type: 'set_variable',
    category: 'control',
    label: 'Set Variable',
    shortDesc: 'Store a number, text, or live ship sensor reading for later use',
    seApiSummary: 'double/string script field assignment',
    defaults: {
      varName: 'batt',
      source: 'battery_pct',
      value: '0',
      target: '',
      itemCategory: 'MyObjectBuilder_Ore',
      itemSubtype: 'Ice',
    },
    fields: [
      { key: 'varName', label: 'Variable', type: 'text', placeholder: 'batt', width: 'sm' },
      { key: 'source', label: 'From', type: 'select', options: VALUE_SOURCE_OPTIONS, width: 'md' },
      {
        key: 'value',
        label: 'Value',
        type: 'text',
        placeholder: '0',
        width: 'md',
        supportsVars: true,
        visibleWhen: (p) => p.source === 'number' || p.source === 'text',
      },
      {
        key: 'target',
        label: 'Block Name',
        type: 'text',
        placeholder: 'Airlock Vent',
        width: 'md',
        visibleWhen: (p) => p.source === 'vent_o2_pct',
      },
      {
        key: 'itemCategory',
        label: 'Type',
        type: 'select',
        options: ITEM_CATEGORY_OPTIONS,
        width: 'sm',
        visibleWhen: (p) => p.source === 'item_count',
      },
      {
        key: 'itemSubtype',
        label: 'Item ID',
        type: 'text',
        placeholder: 'Ice',
        width: 'sm',
        visibleWhen: (p) => p.source === 'item_count',
      },
    ],
  },
  {
    type: 'change_variable',
    category: 'control',
    label: 'Change Variable By',
    shortDesc: 'Add or subtract from a numeric variable (e.g. counters)',
    seApiSummary: 'varName += delta;',
    defaults: {
      varName: 'counter',
      delta: 1,
    },
    fields: [
      { key: 'varName', label: 'Variable', type: 'text', placeholder: 'counter', width: 'sm' },
      { key: 'delta', label: 'Add / Subtract', type: 'number', step: 1, width: 'sm' },
    ],
  },
  {
    type: 'comment',
    category: 'control',
    label: 'Note / Comment',
    shortDesc: 'Leave a plain-English note in your blocks and generated C#',
    seApiSummary: '// comment',
    defaults: {
      text: 'Describe what this section does',
    },
    fields: [
      { key: 'text', label: 'Note', type: 'text', placeholder: 'Write a reminder...', width: 'lg' },
    ],
  },

  // ======================== CLASSIC TEXT LCDS & CONSOLE ========================
  {
    type: 'lcd_inventory',
    category: 'display',
    label: 'Text Inventory List (LCD)',
    shortDesc: 'Classic text-mode inventory scan with ASCII fill bar on an LCD',
    seApiSummary: 'IMyInventory.GetItems -> IMyTextPanel.WriteText',
    defaults: {
      lcdName: 'Inventory LCD',
      title: 'SHIP INVENTORY',
      category: 'all',
      sortBy: 'amount_desc',
      showBar: true,
      maxItems: 14,
      containerFilter: '',
    },
    fields: [
      { key: 'lcdName', label: 'LCD Name', type: 'text', placeholder: 'Inventory LCD', width: 'md' },
      { key: 'title', label: 'Header', type: 'text', placeholder: 'SHIP INVENTORY', width: 'md' },
      {
        key: 'category',
        label: 'Show Items',
        type: 'select',
        options: [
          { value: 'all', label: 'All Items' },
          { value: 'ore', label: 'Ores Only' },
          { value: 'ingot', label: 'Ingots Only' },
          { value: 'component', label: 'Components Only' },
          { value: 'ammo', label: 'Ammo & Tools' },
          { value: 'ore_ingot', label: 'Ores & Ingots' },
        ],
        width: 'md',
      },
      {
        key: 'sortBy',
        label: 'Sort',
        type: 'select',
        options: [
          { value: 'amount_desc', label: 'Highest Amount First' },
          { value: 'name_asc', label: 'Alphabetical (A-Z)' },
        ],
        width: 'md',
      },
      { key: 'maxItems', label: 'Max Lines', type: 'number', min: 3, max: 40, step: 1, width: 'sm' },
      { key: 'showBar', label: 'Cargo Bar', type: 'boolean' },
      { key: 'containerFilter', label: 'Tag Filter', type: 'text', placeholder: '(optional)', width: 'sm' },
    ],
  },
  {
    type: 'lcd_power',
    category: 'display',
    label: 'Text Power Telemetry (LCD)',
    shortDesc: 'Classic text-mode readout of battery MWh, input/output, solar & reactors',
    seApiSummary: 'IMyBatteryBlock + IMySolarPanel + IMyReactor -> IMyTextPanel.WriteText',
    defaults: {
      lcdName: 'Power LCD',
      title: 'POWER TELEMETRY',
      showSources: true,
      showBar: true,
      append: false,
    },
    fields: [
      { key: 'lcdName', label: 'LCD Name', type: 'text', placeholder: 'Power LCD', width: 'md' },
      { key: 'title', label: 'Header', type: 'text', placeholder: 'POWER TELEMETRY', width: 'md' },
      { key: 'showSources', label: 'Solar & Reactors', type: 'boolean' },
      { key: 'showBar', label: 'Charge Bar', type: 'boolean' },
      { key: 'append', label: 'Append', type: 'boolean' },
    ],
  },
  {
    type: 'lcd_gas',
    category: 'display',
    label: 'Text Gas Tanks (LCD)',
    shortDesc: 'Classic text-mode readout of Hydrogen & Oxygen tank fill levels',
    seApiSummary: 'IMyGasTank.FilledRatio & Capacity -> IMyTextPanel.WriteText',
    defaults: {
      lcdName: 'Status LCD',
      title: 'GAS STORAGE',
      gasType: 'both',
      showBar: true,
      append: false,
    },
    fields: [
      { key: 'lcdName', label: 'LCD Name', type: 'text', placeholder: 'Status LCD', width: 'md' },
      { key: 'title', label: 'Header', type: 'text', placeholder: 'GAS STORAGE', width: 'md' },
      {
        key: 'gasType',
        label: 'Tanks',
        type: 'select',
        options: [
          { value: 'both', label: 'Both H2 & O2' },
          { value: 'hydrogen', label: 'Hydrogen Only' },
          { value: 'oxygen', label: 'Oxygen Only' },
        ],
        width: 'md',
      },
      { key: 'showBar', label: 'Progress Bars', type: 'boolean' },
      { key: 'append', label: 'Append', type: 'boolean' },
    ],
  },
  {
    type: 'lcd_clear',
    category: 'display',
    label: 'Clear Text LCD',
    shortDesc: 'Erase existing text on a text-mode LCD before writing new lines',
    seApiSummary: 'lcd.ContentType = ContentType.TEXT_AND_IMAGE; lcd.WriteText("", false);',
    defaults: {
      lcdName: 'Status LCD',
    },
    fields: [
      { key: 'lcdName', label: 'LCD Name', type: 'text', placeholder: 'Status LCD', width: 'md' },
    ],
  },
  {
    type: 'lcd_write',
    category: 'display',
    label: 'Write Line to Text LCD',
    shortDesc: 'Print custom text & live tags like {battery}%, {h2}%, {cargo}%',
    seApiSummary: 'lcd.WriteText(line + "\\n", append)',
    defaults: {
      lcdName: 'Status LCD',
      text: 'Battery: {battery}% {bar:battery}',
      append: true,
    },
    fields: [
      { key: 'lcdName', label: 'LCD Name', type: 'text', placeholder: 'Status LCD', width: 'md' },
      {
        key: 'text',
        label: 'Text',
        type: 'text',
        placeholder: 'Use {battery}, {h2}, {o2}, {cargo}, {speed}, {var}',
        width: 'lg',
        supportsVars: true,
      },
      { key: 'append', label: 'Append Line', type: 'boolean' },
    ],
  },
  {
    type: 'lcd_style',
    category: 'display',
    label: 'Style Text LCD',
    shortDesc: 'Set font, text size, foreground color, and background color on a text LCD',
    seApiSummary: 'IMyTextSurface.Font, FontSize, FontColor, BackgroundColor',
    defaults: {
      lcdName: 'Status LCD',
      font: 'Monospace',
      fontSize: 1.0,
      fontColor: '#38D9A9',
      bgColor: '#0A1118',
      alignment: 'LEFT',
    },
    fields: [
      { key: 'lcdName', label: 'LCD Name', type: 'text', placeholder: 'Status LCD', width: 'md' },
      {
        key: 'font',
        label: 'Font',
        type: 'select',
        options: [
          { value: 'Monospace', label: 'Monospace' },
          { value: 'Debug', label: 'Debug (Standard)' },
        ],
        width: 'md',
      },
      { key: 'fontSize', label: 'Size', type: 'number', min: 0.4, max: 4.0, step: 0.1, width: 'sm' },
      { key: 'fontColor', label: 'Text', type: 'color' },
      { key: 'bgColor', label: 'BG', type: 'color' },
      {
        key: 'alignment',
        label: 'Align',
        type: 'select',
        options: [
          { value: 'LEFT', label: 'Left' },
          { value: 'CENTER', label: 'Center' },
          { value: 'RIGHT', label: 'Right' },
        ],
        width: 'sm',
      },
    ],
  },
  {
    type: 'pb_echo',
    category: 'display',
    label: 'Print to PB Console (Echo)',
    shortDesc: 'Show a diagnostic message in the Programmable Block info box',
    seApiSummary: 'Echo("...");',
    defaults: {
      text: 'Script running OK - Battery {battery}%',
    },
    fields: [
      { key: 'text', label: 'Message', type: 'text', placeholder: 'Status message...', width: 'lg', supportsVars: true },
    ],
  },

  // ======================== HABITAT (DOORS, VENTS, LIGHTS) ========================
  {
    type: 'door_action',
    category: 'habitat',
    label: 'Control Door(s)',
    shortDesc: 'Open, close, toggle, lock (power off), or unlock doors & hangar doors',
    seApiSummary: 'IMyDoor.OpenDoor() / CloseDoor() / ToggleDoor() / Enabled',
    defaults: {
      targetMode: 'block',
      name: 'Airlock Outer Door',
      action: 'close',
    },
    fields: [
      {
        key: 'targetMode',
        label: 'Match',
        type: 'select',
        options: [
          { value: 'block', label: 'Single Block' },
          { value: 'group', label: 'Block Group' },
          { value: 'tag', label: 'Name Contains' },
        ],
        width: 'sm',
      },
      { key: 'name', label: 'Name', type: 'text', placeholder: 'Airlock Door', width: 'md' },
      {
        key: 'action',
        label: 'Action',
        type: 'select',
        options: [
          { value: 'open', label: 'Open' },
          { value: 'close', label: 'Close' },
          { value: 'toggle', label: 'Toggle' },
          { value: 'lock', label: 'Close & Lock (Off)' },
          { value: 'unlock', label: 'Unlock (Turn On)' },
        ],
        width: 'md',
      },
    ],
  },
  {
    type: 'airvent_action',
    category: 'habitat',
    label: 'Control Air Vent',
    shortDesc: 'Pressurize or depressurize an airlock or room',
    seApiSummary: 'IMyAirVent.Depressurize = true/false',
    defaults: {
      name: 'Airlock Vent',
      action: 'depressurize',
    },
    fields: [
      { key: 'name', label: 'Vent Name', type: 'text', placeholder: 'Airlock Vent', width: 'md' },
      {
        key: 'action',
        label: 'Mode',
        type: 'select',
        options: [
          { value: 'pressurize', label: 'Pressurize' },
          { value: 'depressurize', label: 'Depressurize' },
          { value: 'on', label: 'Turn On' },
          { value: 'off', label: 'Turn Off' },
        ],
        width: 'md',
      },
    ],
  },
  {
    type: 'light_action',
    category: 'habitat',
    label: 'Control Lights',
    shortDesc: 'Switch lights on/off, change alert color, and set blink interval',
    seApiSummary: 'IMyLightingBlock.Enabled, Color, BlinkIntervalSeconds',
    defaults: {
      targetMode: 'group',
      name: 'Bridge Lights',
      action: 'style',
      color: '#FF3B30',
      blinkSeconds: 1.0,
    },
    fields: [
      {
        key: 'targetMode',
        label: 'Match',
        type: 'select',
        options: [
          { value: 'block', label: 'Single Light' },
          { value: 'group', label: 'Light Group' },
          { value: 'all', label: 'All Ship Lights' },
        ],
        width: 'sm',
      },
      {
        key: 'name',
        label: 'Name',
        type: 'text',
        placeholder: 'Bridge Lights',
        width: 'md',
        visibleWhen: (p) => p.targetMode !== 'all',
      },
      {
        key: 'action',
        label: 'Action',
        type: 'select',
        options: [
          { value: 'style', label: 'On + Color & Blink' },
          { value: 'on', label: 'Turn On' },
          { value: 'off', label: 'Turn Off' },
          { value: 'toggle', label: 'Toggle' },
        ],
        width: 'md',
      },
      {
        key: 'color',
        label: 'Color',
        type: 'color',
        visibleWhen: (p) => p.action === 'style',
      },
      {
        key: 'blinkSeconds',
        label: 'Blink (s)',
        type: 'number',
        min: 0,
        max: 10,
        step: 0.5,
        width: 'sm',
        visibleWhen: (p) => p.action === 'style',
      },
    ],
  },

  // ======================== SYSTEMS (POWER, FUEL, DOCKING) ========================
  {
    type: 'block_power',
    category: 'systems',
    label: 'Turn Block(s) On / Off',
    shortDesc: 'Toggle any functional block or group (Reactors, Thrusters, Assemblers, etc.)',
    seApiSummary: 'IMyFunctionalBlock.Enabled = true/false',
    defaults: {
      targetMode: 'block',
      name: 'Backup Reactor',
      action: 'on',
    },
    fields: [
      {
        key: 'targetMode',
        label: 'Match',
        type: 'select',
        options: [
          { value: 'block', label: 'Single Block' },
          { value: 'group', label: 'Block Group' },
          { value: 'tag', label: 'Name Contains' },
        ],
        width: 'sm',
      },
      { key: 'name', label: 'Name', type: 'text', placeholder: 'Backup Reactor', width: 'md' },
      {
        key: 'action',
        label: 'Power',
        type: 'select',
        options: [
          { value: 'on', label: 'Turn ON' },
          { value: 'off', label: 'Turn OFF' },
          { value: 'toggle', label: 'Toggle' },
        ],
        width: 'sm',
      },
    ],
  },
  {
    type: 'battery_mode',
    category: 'systems',
    label: 'Set Battery Charge Mode',
    shortDesc: 'Switch ship batteries between Auto, Recharge (docking), or Discharge',
    seApiSummary: 'IMyBatteryBlock.ChargeMode = ChargeMode.Auto / Recharge / Discharge',
    defaults: {
      targetMode: 'all',
      name: 'Ship Batteries',
      mode: 'Recharge',
    },
    fields: [
      {
        key: 'targetMode',
        label: 'Match',
        type: 'select',
        options: [
          { value: 'all', label: 'All Ship Batteries' },
          { value: 'group', label: 'Battery Group' },
          { value: 'tag', label: 'Name Contains' },
        ],
        width: 'md',
      },
      {
        key: 'name',
        label: 'Name',
        type: 'text',
        placeholder: 'Ship Batteries',
        width: 'md',
        visibleWhen: (p) => p.targetMode !== 'all',
      },
      {
        key: 'mode',
        label: 'Mode',
        type: 'select',
        options: [
          { value: 'Auto', label: 'Auto' },
          { value: 'Recharge', label: 'Recharge' },
          { value: 'Discharge', label: 'Discharge' },
        ],
        width: 'sm',
      },
    ],
  },
  {
    type: 'tank_stockpile',
    category: 'systems',
    label: 'Set Gas Tank Stockpile',
    shortDesc: 'Enable Stockpile while docked to rapidly refill H2/O2 tanks',
    seApiSummary: 'IMyGasTank.Stockpile = true/false',
    defaults: {
      gasType: 'hydrogen',
      stockpile: 'on',
      filter: '',
    },
    fields: [
      {
        key: 'gasType',
        label: 'Tank Type',
        type: 'select',
        options: [
          { value: 'hydrogen', label: 'Hydrogen Tanks' },
          { value: 'oxygen', label: 'Oxygen Tanks' },
          { value: 'all', label: 'All Gas Tanks' },
        ],
        width: 'md',
      },
      {
        key: 'stockpile',
        label: 'Stockpile',
        type: 'select',
        options: [
          { value: 'on', label: 'ON (Fill Tanks)' },
          { value: 'off', label: 'OFF (Normal Use)' },
        ],
        width: 'md',
      },
      { key: 'filter', label: 'Tag Filter', type: 'text', placeholder: '(optional)', width: 'sm' },
    ],
  },
  {
    type: 'connector_action',
    category: 'systems',
    label: 'Control Connector',
    shortDesc: 'Lock, unlock, or toggle a ship docking connector',
    seApiSummary: 'IMyShipConnector.Connect() / Disconnect() / ToggleConnect()',
    defaults: {
      name: 'Docking Connector',
      action: 'toggle',
    },
    fields: [
      { key: 'name', label: 'Connector', type: 'text', placeholder: 'Docking Connector', width: 'md' },
      {
        key: 'action',
        label: 'Action',
        type: 'select',
        options: [
          { value: 'connect', label: 'Lock / Connect' },
          { value: 'disconnect', label: 'Unlock / Disconnect' },
          { value: 'toggle', label: 'Toggle Lock' },
        ],
        width: 'md',
      },
    ],
  },
  {
    type: 'thruster_override',
    category: 'systems',
    label: 'Set Thruster Override',
    shortDesc: 'Set constant thrust percentage (0% clears override)',
    seApiSummary: 'IMyThrust.ThrustOverridePercentage = value / 100f',
    defaults: {
      targetMode: 'group',
      name: 'Forward Thrusters',
      percent: 0,
    },
    fields: [
      {
        key: 'targetMode',
        label: 'Match',
        type: 'select',
        options: [
          { value: 'group', label: 'Thruster Group' },
          { value: 'tag', label: 'Name Contains' },
          { value: 'all', label: 'All Thrusters' },
        ],
        width: 'sm',
      },
      {
        key: 'name',
        label: 'Name',
        type: 'text',
        placeholder: 'Forward Thrusters',
        width: 'md',
        visibleWhen: (p) => p.targetMode !== 'all',
      },
      { key: 'percent', label: 'Override %', type: 'number', min: 0, max: 100, step: 5, width: 'sm' },
    ],
  },

  // ======================== AUTOMATION & MECHANICS ========================
  {
    type: 'sound_action',
    category: 'automation',
    label: 'Control Sound Block',
    shortDesc: 'Play or stop an alert siren or notification audio',
    seApiSummary: 'IMySoundBlock.Play() / Stop()',
    defaults: {
      name: 'Alert Sound',
      action: 'play',
      soundName: '',
    },
    fields: [
      { key: 'name', label: 'Sound Block', type: 'text', placeholder: 'Alert Sound', width: 'md' },
      {
        key: 'action',
        label: 'Action',
        type: 'select',
        options: [
          { value: 'play', label: 'Play Sound' },
          { value: 'stop', label: 'Stop Sound' },
        ],
        width: 'sm',
      },
      {
        key: 'soundName',
        label: 'Track (opt)',
        type: 'text',
        placeholder: 'Alert 1 (optional)',
        width: 'md',
        visibleWhen: (p) => p.action === 'play',
      },
    ],
  },
  {
    type: 'timer_action',
    category: 'automation',
    label: 'Control Timer Block',
    shortDesc: 'Trigger a Space Engineers Timer Block immediately or start its countdown',
    seApiSummary: 'IMyTimerBlock.Trigger() / StartCountdown() / StopCountdown()',
    defaults: {
      name: 'Airlock Timer',
      action: 'trigger',
    },
    fields: [
      { key: 'name', label: 'Timer Block', type: 'text', placeholder: 'Airlock Timer', width: 'md' },
      {
        key: 'action',
        label: 'Action',
        type: 'select',
        options: [
          { value: 'trigger', label: 'Trigger Now' },
          { value: 'start', label: 'Start Countdown' },
          { value: 'stop', label: 'Stop Countdown' },
        ],
        width: 'md',
      },
    ],
  },
  {
    type: 'broadcast_text',
    category: 'automation',
    label: 'Set Antenna / Beacon HUD Text',
    shortDesc: 'Update the HUD broadcast message and signal radius',
    seApiSummary: 'IMyRadioAntenna / IMyBeacon HudText & Radius',
    defaults: {
      deviceType: 'antenna',
      name: 'Ship Antenna',
      hudText: 'STATUS: NOMINAL - BATT {battery}%',
      radius: 5000,
    },
    fields: [
      {
        key: 'deviceType',
        label: 'Type',
        type: 'select',
        options: [
          { value: 'antenna', label: 'Antenna' },
          { value: 'beacon', label: 'Beacon' },
        ],
        width: 'sm',
      },
      { key: 'name', label: 'Block Name', type: 'text', placeholder: 'Ship Antenna', width: 'md' },
      { key: 'hudText', label: 'HUD Text', type: 'text', placeholder: 'Message...', width: 'lg', supportsVars: true },
      { key: 'radius', label: 'Radius (m)', type: 'number', min: 100, max: 50000, step: 500, width: 'sm' },
    ],
  },
  {
    type: 'piston_action',
    category: 'automation',
    label: 'Control Piston(s)',
    shortDesc: 'Extend, retract, reverse, or stop pistons or a drill rig piston group',
    seApiSummary: 'IMyPistonBase.Extend() / Retract() / Reverse() / Velocity',
    defaults: {
      targetMode: 'block',
      name: 'Drill Piston',
      action: 'extend',
      speed: 0.5,
    },
    fields: [
      {
        key: 'targetMode',
        label: 'Match',
        type: 'select',
        options: [
          { value: 'block', label: 'Single Piston' },
          { value: 'group', label: 'Piston Group' },
        ],
        width: 'sm',
      },
      { key: 'name', label: 'Name', type: 'text', placeholder: 'Drill Piston', width: 'md' },
      {
        key: 'action',
        label: 'Action',
        type: 'select',
        options: [
          { value: 'extend', label: 'Extend' },
          { value: 'retract', label: 'Retract' },
          { value: 'reverse', label: 'Reverse' },
          { value: 'stop', label: 'Stop (0 m/s)' },
        ],
        width: 'sm',
      },
      {
        key: 'speed',
        label: 'Speed (m/s)',
        type: 'number',
        min: 0.1,
        max: 5.0,
        step: 0.1,
        width: 'sm',
        visibleWhen: (p) => p.action === 'extend' || p.action === 'retract',
      },
    ],
  },
  {
    type: 'rotor_action',
    category: 'automation',
    label: 'Control Rotor / Hinge',
    shortDesc: 'Spin, stop, lock, or unlock rotors and hinges',
    seApiSummary: 'IMyMotorStator.TargetVelocityRPM & RotorLock',
    defaults: {
      targetMode: 'block',
      name: 'Solar Rotor',
      action: 'spin',
      rpm: 2.0,
    },
    fields: [
      {
        key: 'targetMode',
        label: 'Match',
        type: 'select',
        options: [
          { value: 'block', label: 'Single Rotor/Hinge' },
          { value: 'group', label: 'Rotor/Hinge Group' },
        ],
        width: 'sm',
      },
      { key: 'name', label: 'Name', type: 'text', placeholder: 'Solar Rotor', width: 'md' },
      {
        key: 'action',
        label: 'Action',
        type: 'select',
        options: [
          { value: 'spin', label: 'Set Velocity (RPM)' },
          { value: 'stop', label: 'Stop (0 RPM)' },
          { value: 'lock', label: 'Lock Rotor' },
          { value: 'unlock', label: 'Unlock Rotor' },
        ],
        width: 'md',
      },
      {
        key: 'rpm',
        label: 'RPM',
        type: 'number',
        min: -30,
        max: 30,
        step: 0.5,
        width: 'sm',
        visibleWhen: (p) => p.action === 'spin',
      },
    ],
  },
];

export const BLOCK_MAP: Record<BlockType, BlockDefinition> = BLOCK_CATALOG.reduce(
  (acc, def) => {
    acc[def.type] = def;
    return acc;
  },
  {} as Record<BlockType, BlockDefinition>
);

export const CATEGORY_MAP: Record<BlockCategory, CategoryMeta> = BLOCK_CATEGORIES.reduce(
  (acc, cat) => {
    acc[cat.id] = cat;
    return acc;
  },
  {} as Record<BlockCategory, CategoryMeta>
);

let idCounter = 1;
export function createBlockId(): string {
  idCounter += 1;
  return `blk_${Date.now().toString(36)}_${idCounter.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function createBlockInstance(type: BlockType, overrides?: Partial<ScriptBlock>): ScriptBlock {
  const def = BLOCK_MAP[type];
  const block: ScriptBlock = {
    id: createBlockId(),
    type,
    params: { ...def.defaults },
  };
  if (def.isContainer) {
    block.children = [];
  }
  if (def.supportsElse) {
    block.elseChildren = [];
  }
  if (overrides) {
    return {
      ...block,
      ...overrides,
      params: { ...block.params, ...(overrides.params ?? {}) },
    };
  }
  return block;
}
