export type BlockCategory =
  | 'gui'
  | 'control'
  | 'display'
  | 'habitat'
  | 'systems'
  | 'automation';

export type UpdateFrequencyOption =
  | 'Update100'
  | 'Update10'
  | 'Update1'
  | 'None';

export type BlockType =
  // Modern Vector GUI Screens (MySpriteDrawFrame)
  | 'gui_screen'
  | 'gui_header'
  | 'gui_bar'
  | 'gui_gauges'
  | 'gui_metrics'
  | 'gui_alert'
  | 'gui_inventory'
  | 'gui_text'
  | 'gui_divider'
  // Control & Logic
  | 'on_argument'
  | 'on_setup'
  | 'if_condition'
  | 'cooldown'
  | 'set_variable'
  | 'change_variable'
  | 'comment'
  // Classic Text Displays & Console
  | 'lcd_inventory'
  | 'lcd_power'
  | 'lcd_gas'
  | 'lcd_clear'
  | 'lcd_write'
  | 'lcd_style'
  | 'pb_echo'
  // Habitat (Doors, Vents, Lights)
  | 'door_action'
  | 'airvent_action'
  | 'light_action'
  // Ship Systems (Power, Fuel, Docking, Thrust)
  | 'block_power'
  | 'battery_mode'
  | 'tank_stockpile'
  | 'connector_action'
  | 'thruster_override'
  // Automation & Mechanics
  | 'sound_action'
  | 'timer_action'
  | 'broadcast_text'
  | 'piston_action'
  | 'rotor_action';

export type ConditionSource =
  | 'battery_pct'
  | 'h2_pct'
  | 'o2_pct'
  | 'cargo_pct'
  | 'vent_o2_pct'
  | 'ship_speed'
  | 'gravity_g'
  | 'item_count'
  | 'solar_mw'
  | 'reactor_mw'
  | 'projector_remaining'
  | 'variable'
  | 'door_is_open'
  | 'connector_connected'
  | 'connector_ready'
  | 'sensor_active'
  | 'turret_has_target'
  | 'block_enabled'
  | 'argument_equals';

export type NumericOperator = '<' | '<=' | '>' | '>=' | '==' | '!=';

export interface ScriptBlock {
  id: string;
  type: BlockType;
  params: Record<string, string | number | boolean>;
  children?: ScriptBlock[];
  elseChildren?: ScriptBlock[];
  disabled?: boolean;
  collapsed?: boolean;
}

export interface ScriptProject {
  name: string;
  description: string;
  updateFrequency: UpdateFrequencyOption;
  sameGridOnly: boolean;
  blocks: ScriptBlock[];
}

export type FieldType =
  | 'text'
  | 'number'
  | 'select'
  | 'boolean'
  | 'color';

export interface SelectOption {
  value: string;
  label: string;
}

export interface BlockFieldSchema {
  key: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  options?: SelectOption[];
  min?: number;
  max?: number;
  step?: number;
  width?: 'sm' | 'md' | 'lg';
  supportsVars?: boolean;
  visibleWhen?: (params: Record<string, string | number | boolean>) => boolean;
}

export interface BlockDefinition {
  type: BlockType;
  category: BlockCategory;
  label: string;
  shortDesc: string;
  seApiSummary: string;
  isContainer?: boolean;
  supportsElse?: boolean;
  guiWidget?: boolean;
  defaults: Record<string, string | number | boolean>;
  fields: BlockFieldSchema[];
}

export interface RequiredShipBlock {
  name: string;
  blockType: string;
  matchMode: 'Exact Name' | 'Group' | 'Name Tag' | 'All on Ship';
  purpose: string;
}

export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  message: string;
  blockId?: string;
}

export interface GeneratedScriptResult {
  code: string;
  charCount: number;
  charLimit: number;
  lineCount: number;
  requiredBlocks: RequiredShipBlock[];
  detectedArguments: string[];
  issues: ValidationIssue[];
}

export interface PresetScript {
  id: string;
  name: string;
  category: 'Telemetry & HUD' | 'Inventory & Cargo' | 'Airlocks & Safety' | 'Power & Docking' | 'Combat & Alerts';
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  summary: string;
  setupHint: string;
  project: ScriptProject;
}

// Simulator types
export interface SimInventoryItem {
  category: 'Ore' | 'Ingot' | 'Component' | 'Ammo';
  subtype: string;
  displayName: string;
  amount: number;
}

export type SimGuiOp =
  | {
      kind: 'header';
      title: string;
      badge: string;
      accentColor: string;
    }
  | {
      kind: 'bar';
      label: string;
      percent: number;
      valueText: string;
      style: 'segmented' | 'smooth' | 'compact';
      icon: 'none' | 'energy' | 'hydrogen' | 'oxygen' | 'cargo' | 'danger';
      color: string;
    }
  | {
      kind: 'gauges';
      items: Array<{
        label: string;
        percent: number;
        color: string;
      }>;
    }
  | {
      kind: 'metrics';
      accentColor: string;
      cards: Array<{
        label: string;
        value: string;
      }>;
    }
  | {
      kind: 'alert';
      message: string;
      severity: 'critical' | 'warning' | 'nominal' | 'info';
    }
  | {
      kind: 'inventory';
      cargoPct: number;
      accentColor: string;
      rows: Array<{
        name: string;
        amountText: string;
        ratio: number;
      }>;
      extraCount: number;
    }
  | {
      kind: 'text';
      text: string;
      size: 'heading' | 'body' | 'caption';
      align: 'LEFT' | 'CENTER' | 'RIGHT';
      color: string;
    }
  | {
      kind: 'divider';
      label: string;
      color: string;
    };

export interface SimLcdScreen {
  name: string;
  mode: 'text' | 'gui';
  text: string;
  fontSize: number;
  font: 'Monospace' | 'Debug';
  fontColor: string;
  bgColor: string;
  alignment: 'LEFT' | 'CENTER' | 'RIGHT';
  surfaceIndex?: number;
  frameColor?: string;
  showFrame?: boolean;
  showGrid?: boolean;
  guiOps?: SimGuiOp[];
}

export interface SimShipInputs {
  batteryPct: number;
  h2Pct: number;
  o2Pct: number;
  cargoPct: number;
  ventO2Pct: number;
  shipSpeed: number;
  gravityG: number;
  solarMw: number;
  reactorMw: number;
  projectorRemaining: number;
  doorOpen: boolean;
  connectorStatus: 'Unconnected' | 'Connectable' | 'Connected';
  sensorActive: boolean;
  turretHasTarget: boolean;
  inventory: SimInventoryItem[];
}

export interface SimBlockStatus {
  name: string;
  kind: string;
  state: string;
  accent: 'ok' | 'warn' | 'danger' | 'neutral';
  color?: string;
  blinking?: boolean;
}

export interface SimExecutionResult {
  lcds: Record<string, SimLcdScreen>;
  blocks: Record<string, SimBlockStatus>;
  variables: Record<string, string | number>;
  echoLog: string[];
  ticksRun: number;
}
