import type { PresetScript, ScriptBlock, ScriptProject } from '../types';

function b(
  id: string,
  type: ScriptBlock['type'],
  params: Record<string, string | number | boolean>,
  children?: ScriptBlock[],
  elseChildren?: ScriptBlock[]
): ScriptBlock {
  const block: ScriptBlock = { id, type, params };
  if (children !== undefined) block.children = children;
  if (elseChildren !== undefined) block.elseChildren = elseChildren;
  return block;
}

export const PRESET_SCRIPTS: PresetScript[] = [
  {
    id: 'bridge-telemetry-hud',
    name: 'Bridge Telemetry Dashboard',
    category: 'Telemetry & HUD',
    difficulty: 'Beginner',
    summary:
      'Modern vector-graphics bridge HUD with segmented auto-color Battery, Hydrogen, Oxygen, and Cargo bars, digital Speed/Gravity/Solar stat cards, and live warning banners.',
    setupHint:
      'Place an LCD Panel named "Status LCD" (or enter your Cockpit name & Screen #0). Works automatically with all ship batteries, H2/O2 tanks, cargo, and solar panels.',
    project: {
      name: 'Bridge Telemetry Dashboard',
      description: 'Modern MySprite vector GUI telemetry dashboard for power, gas, cargo, and flight metrics.',
      updateFrequency: 'Update10',
      sameGridOnly: true,
      blocks: [
        b('tel_gui', 'gui_screen', {
          lcdName: 'Status LCD',
          surfaceIndex: 0,
          bgColor: '#08111A',
          frameColor: '#2B9FD9',
          showFrame: true,
          showGrid: false,
        }, [
          b('tel_hdr', 'gui_header', {
            title: 'BRIDGE TELEMETRY',
            badge: '{speed} m/s',
            accentColor: '#38A3D1',
          }),
          b('tel_batt', 'gui_bar', {
            label: 'BATTERY POWER',
            source: 'battery_pct',
            target: '',
            style: 'segmented',
            icon: 'energy',
            colorMode: 'auto',
            color: '#22C55E',
          }),
          b('tel_h2', 'gui_bar', {
            label: 'HYDROGEN FUEL',
            source: 'h2_pct',
            target: '',
            style: 'segmented',
            icon: 'hydrogen',
            colorMode: 'auto',
            color: '#38BDF8',
          }),
          b('tel_o2', 'gui_bar', {
            label: 'OXYGEN STORAGE',
            source: 'o2_pct',
            target: '',
            style: 'smooth',
            icon: 'oxygen',
            colorMode: 'auto',
            color: '#38D9A9',
          }),
          b('tel_cargo', 'gui_bar', {
            label: 'CARGO CAPACITY',
            source: 'cargo_pct',
            target: '',
            style: 'smooth',
            icon: 'cargo',
            colorMode: 'auto_high_bad',
            color: '#38D9A9',
          }),
          b('tel_metrics', 'gui_metrics', {
            count: '3',
            accentColor: '#2B9FD9',
            label1: 'SPEED',
            val1: '{speed} m/s',
            label2: 'GRAVITY',
            val2: '{gravity} g',
            label3: 'SOLAR',
            val3: '{solar} MW',
          }),
          b(
            'tel_low_batt',
            'if_condition',
            {
              source: 'battery_pct',
              target: '',
              operator: '<',
              boolExpect: 'true',
              value: 20,
              hasElse: false,
            },
            [
              b('tel_low_batt_alert', 'gui_alert', {
                severity: 'critical',
                message: 'LOW BATTERY — ACTIVATE BACKUP POWER',
              }),
            ]
          ),
          b(
            'tel_low_h2',
            'if_condition',
            {
              source: 'h2_pct',
              target: '',
              operator: '<',
              boolExpect: 'true',
              value: 25,
              hasElse: false,
            },
            [
              b('tel_low_h2_alert', 'gui_alert', {
                severity: 'warning',
                message: 'LOW HYDROGEN FUEL — REFUEL SOON',
              }),
            ]
          ),
        ]),
      ],
    },
  },
  {
    id: 'ship-inventory-lcd',
    name: 'Ship Inventory LCD Display',
    category: 'Inventory & Cargo',
    difficulty: 'Beginner',
    summary:
      'Scans all cargo containers, refineries, and assemblers and renders a sleek vector cargo bar + top ship items with visual quantity bars and high-cargo alert lighting.',
    setupHint:
      'Place an LCD Panel named "Inventory LCD" (and optionally a light named "Cargo Warning Light"). Paste into a Programmable Block and click OK!',
    project: {
      name: 'Ship Inventory LCD Display',
      description: 'Graphical ship cargo fill bar and sorted inventory bars on an LCD panel.',
      updateFrequency: 'Update100',
      sameGridOnly: true,
      blocks: [
        b('inv_note', 'comment', {
          text: 'Render modern graphical inventory HUD on Inventory LCD',
        }),
        b('inv_gui', 'gui_screen', {
          lcdName: 'Inventory LCD',
          surfaceIndex: 0,
          bgColor: '#08111A',
          frameColor: '#38D9A9',
          showFrame: true,
          showGrid: false,
        }, [
          b('inv_hdr', 'gui_header', {
            title: 'SHIP INVENTORY',
            badge: '{cargo}% FULL',
            accentColor: '#38D9A9',
          }),
          b('inv_bars', 'gui_inventory', {
            category: 'all',
            sortBy: 'amount_desc',
            maxItems: 9,
            accentColor: '#38D9A9',
            containerFilter: '',
          }),
          b(
            'inv_full_banner',
            'if_condition',
            {
              source: 'cargo_pct',
              target: '',
              operator: '>=',
              boolExpect: 'true',
              value: 85,
              hasElse: false,
            },
            [
              b('inv_alert', 'gui_alert', {
                severity: 'warning',
                message: 'CARGO NEAR CAPACITY ({cargo}%)',
              }),
            ]
          ),
        ]),
        b(
          'inv_full_if',
          'if_condition',
          {
            source: 'cargo_pct',
            target: '',
            operator: '>=',
            boolExpect: 'true',
            value: 85,
            hasElse: true,
          },
          [
            b('inv_warn_light', 'light_action', {
              targetMode: 'block',
              name: 'Cargo Warning Light',
              action: 'style',
              color: '#F59E0B',
              blinkSeconds: 1.0,
            }),
            b('inv_warn_echo', 'pb_echo', {
              text: 'WARNING: Cargo at {cargo}% capacity!',
            }),
          ],
          [
            b('inv_ok_light', 'light_action', {
              targetMode: 'block',
              name: 'Cargo Warning Light',
              action: 'off',
              color: '#38D9A9',
              blinkSeconds: 0,
            }),
            b('inv_ok_echo', 'pb_echo', {
              text: 'Inventory HUD online — Cargo {cargo}%',
            }),
          ]
        ),
      ],
    },
  },
  {
    id: 'cockpit-ring-gauges',
    name: 'Cockpit Ring Gauges HUD',
    category: 'Telemetry & HUD',
    difficulty: 'Beginner',
    summary:
      'Designed specifically for Fighter or Industrial Cockpit screens: displays 3 circular arc dials (Battery, H2, O2), a slim Cargo bar, and Speed / Gravity tiles.',
    setupHint:
      'Change "Fighter Cockpit" to your cockpit name (or any LCD Panel). Screen #0 is the main center cockpit screen; try #1 or #2 for side screens!',
    project: {
      name: 'Cockpit Ring Gauges HUD',
      description: 'Circular vector ring gauges and flight metrics for cockpit screens.',
      updateFrequency: 'Update10',
      sameGridOnly: true,
      blocks: [
        b('ckp_gui', 'gui_screen', {
          lcdName: 'Fighter Cockpit',
          surfaceIndex: 0,
          bgColor: '#070E16',
          frameColor: '#E89B2D',
          showFrame: true,
          showGrid: true,
        }, [
          b('ckp_hdr', 'gui_header', {
            title: 'FLIGHT SYSTEMS',
            badge: 'ACTIVE',
            accentColor: '#E89B2D',
          }),
          b('ckp_gauges', 'gui_gauges', {
            count: '3',
            label1: 'BATTERY',
            source1: 'battery_pct',
            label2: 'HYDROGEN',
            source2: 'h2_pct',
            label3: 'OXYGEN',
            source3: 'o2_pct',
          }),
          b('ckp_div', 'gui_divider', {
            label: 'CARGO & FLIGHT',
            color: '#475569',
          }),
          b('ckp_cargo', 'gui_bar', {
            label: 'CARGO',
            source: 'cargo_pct',
            target: '',
            style: 'compact',
            icon: 'cargo',
            colorMode: 'auto_high_bad',
            color: '#38D9A9',
          }),
          b('ckp_metrics', 'gui_metrics', {
            count: '2',
            accentColor: '#E89B2D',
            label1: 'VELOCITY',
            val1: '{speed} m/s',
            label2: 'GRAVITY',
            val2: '{gravity} g',
            label3: 'SOLAR',
            val3: '{solar} MW',
          }),
        ]),
      ],
    },
  },
  {
    id: 'smart-airlock',
    name: 'Smart Automatic Airlock',
    category: 'Airlocks & Safety',
    difficulty: 'Intermediate',
    summary:
      'Button-controlled lossless airlock: seals both doors, cycles air vent pressure, opens the safe side automatically, and renders a live pressure bar GUI on Airlock LCD.',
    setupHint:
      'Name blocks: "Airlock Inner Door", "Airlock Outer Door", "Airlock Vent", "Airlock Light", "Airlock LCD". Bind buttons to Run Programmable Block with argument "enter" or "exit".',
    project: {
      name: 'Smart Automatic Airlock',
      description: 'Automated depressurize/pressurize airlock triggered via button arguments "enter" and "exit".',
      updateFrequency: 'Update10',
      sameGridOnly: true,
      blocks: [
        b('air_setup', 'on_setup', {}, [
          b('air_init_var', 'set_variable', {
            varName: 'airlockState',
            source: 'text',
            value: 'READY',
          }),
        ]),
        b('air_arg_exit', 'on_argument', { argument: 'exit' }, [
          b('air_exit_lock_in', 'door_action', {
            targetMode: 'block',
            name: 'Airlock Inner Door',
            action: 'lock',
          }),
          b('air_exit_vent', 'airvent_action', {
            name: 'Airlock Vent',
            action: 'depressurize',
          }),
          b('air_exit_var', 'set_variable', {
            varName: 'airlockState',
            source: 'text',
            value: 'DEPRESSURIZING',
          }),
          b('air_exit_light', 'light_action', {
            targetMode: 'block',
            name: 'Airlock Light',
            action: 'style',
            color: '#F59E0B',
            blinkSeconds: 0.5,
          }),
        ]),
        b('air_arg_enter', 'on_argument', { argument: 'enter' }, [
          b('air_enter_lock_out', 'door_action', {
            targetMode: 'block',
            name: 'Airlock Outer Door',
            action: 'lock',
          }),
          b('air_enter_vent', 'airvent_action', {
            name: 'Airlock Vent',
            action: 'pressurize',
          }),
          b('air_enter_var', 'set_variable', {
            varName: 'airlockState',
            source: 'text',
            value: 'PRESSURIZING',
          }),
          b('air_enter_light', 'light_action', {
            targetMode: 'block',
            name: 'Airlock Light',
            action: 'style',
            color: '#F59E0B',
            blinkSeconds: 0.5,
          }),
        ]),
        b(
          'air_check_vac',
          'if_condition',
          {
            source: 'variable',
            varName: 'airlockState',
            operator: '==',
            value: 'DEPRESSURIZING',
            hasElse: false,
          },
          [
            b('air_keep_in_locked', 'door_action', {
              targetMode: 'block',
              name: 'Airlock Inner Door',
              action: 'lock',
            }),
            b(
              'air_vac_o2',
              'if_condition',
              {
                source: 'vent_o2_pct',
                target: 'Airlock Vent',
                operator: '<=',
                value: 5,
                hasElse: false,
              },
              [
                b('air_open_out', 'door_action', {
                  targetMode: 'block',
                  name: 'Airlock Outer Door',
                  action: 'open',
                }),
                b('air_vac_light', 'light_action', {
                  targetMode: 'block',
                  name: 'Airlock Light',
                  action: 'style',
                  color: '#EF4444',
                  blinkSeconds: 0,
                }),
                b('air_vac_done', 'set_variable', {
                  varName: 'airlockState',
                  source: 'text',
                  value: 'VACUUM - OUTER OPEN',
                }),
              ]
            ),
          ]
        ),
        b(
          'air_check_press',
          'if_condition',
          {
            source: 'variable',
            varName: 'airlockState',
            operator: '==',
            value: 'PRESSURIZING',
            hasElse: false,
          },
          [
            b('air_keep_out_locked', 'door_action', {
              targetMode: 'block',
              name: 'Airlock Outer Door',
              action: 'lock',
            }),
            b(
              'air_press_o2',
              'if_condition',
              {
                source: 'vent_o2_pct',
                target: 'Airlock Vent',
                operator: '>=',
                value: 95,
                hasElse: false,
              },
              [
                b('air_open_in', 'door_action', {
                  targetMode: 'block',
                  name: 'Airlock Inner Door',
                  action: 'open',
                }),
                b('air_press_light', 'light_action', {
                  targetMode: 'block',
                  name: 'Airlock Light',
                  action: 'style',
                  color: '#22C55E',
                  blinkSeconds: 0,
                }),
                b('air_press_done', 'set_variable', {
                  varName: 'airlockState',
                  source: 'text',
                  value: 'PRESSURIZED - INNER OPEN',
                }),
              ]
            ),
          ]
        ),
        b('air_gui', 'gui_screen', {
          lcdName: 'Airlock LCD',
          surfaceIndex: 0,
          bgColor: '#08111A',
          frameColor: '#38D9A9',
          showFrame: true,
          showGrid: false,
        }, [
          b('air_hdr', 'gui_header', {
            title: 'AIRLOCK CONTROL',
            badge: '{airlockState}',
            accentColor: '#38D9A9',
          }),
          b('air_o2_bar', 'gui_bar', {
            label: 'CHAMBER OXYGEN',
            source: 'vent_o2_pct',
            target: 'Airlock Vent',
            style: 'segmented',
            icon: 'oxygen',
            colorMode: 'auto',
            color: '#22C55E',
          }),
          b('air_state_txt', 'gui_text', {
            text: 'STATUS: {airlockState}',
            size: 'heading',
            align: 'CENTER',
            color: '#E2E8F0',
          }),
        ]),
      ],
    },
  },
  {
    id: 'emergency-backup-reactor',
    name: 'Low-Power Emergency Reactor',
    category: 'Power & Docking',
    difficulty: 'Beginner',
    summary:
      'Saves uranium by keeping your backup reactor off until batteries drop below 20%, then fires up the reactor, flashes red lights, and shows a live graphical Power HUD.',
    setupHint:
      'Name blocks: "Backup Reactor", "Power LCD", "Alert Sound", and a light group called "Bridge Lights".',
    project: {
      name: 'Low-Power Emergency Reactor',
      description: 'Auto-starts backup reactor below 20% battery and shuts down above 80%.',
      updateFrequency: 'Update100',
      sameGridOnly: true,
      blocks: [
        b(
          'pwr_low',
          'if_condition',
          {
            source: 'battery_pct',
            operator: '<',
            value: 20,
            hasElse: false,
          },
          [
            b('pwr_react_on', 'block_power', {
              targetMode: 'block',
              name: 'Backup Reactor',
              action: 'on',
            }),
            b('pwr_lights_red', 'light_action', {
              targetMode: 'group',
              name: 'Bridge Lights',
              action: 'style',
              color: '#EF4444',
              blinkSeconds: 1.0,
            }),
            b('pwr_alarm_on', 'sound_action', {
              name: 'Alert Sound',
              action: 'play',
              soundName: 'Alert 1',
            }),
          ]
        ),
        b(
          'pwr_high',
          'if_condition',
          {
            source: 'battery_pct',
            operator: '>=',
            value: 80,
            hasElse: false,
          },
          [
            b('pwr_react_off', 'block_power', {
              targetMode: 'block',
              name: 'Backup Reactor',
              action: 'off',
            }),
            b('pwr_lights_ok', 'light_action', {
              targetMode: 'group',
              name: 'Bridge Lights',
              action: 'style',
              color: '#E2E8F0',
              blinkSeconds: 0,
            }),
            b('pwr_alarm_off', 'sound_action', {
              name: 'Alert Sound',
              action: 'stop',
              soundName: '',
            }),
          ]
        ),
        b('pwr_gui', 'gui_screen', {
          lcdName: 'Power LCD',
          surfaceIndex: 0,
          bgColor: '#08111A',
          frameColor: '#F59E0B',
          showFrame: true,
          showGrid: false,
        }, [
          b('pwr_hdr', 'gui_header', {
            title: 'POWER MANAGEMENT',
            badge: '{battery}%',
            accentColor: '#F59E0B',
          }),
          b('pwr_bar', 'gui_bar', {
            label: 'BATTERY RESERVE',
            source: 'battery_pct',
            target: '',
            style: 'segmented',
            icon: 'energy',
            colorMode: 'auto',
            color: '#22C55E',
          }),
          b('pwr_metrics', 'gui_metrics', {
            count: '2',
            accentColor: '#F59E0B',
            label1: 'SOLAR OUTPUT',
            val1: '{solar} MW',
            label2: 'REACTOR OUTPUT',
            val2: '{reactor} MW',
            label3: 'CARGO',
            val3: '{cargo}%',
          }),
          b(
            'pwr_gui_low',
            'if_condition',
            {
              source: 'battery_pct',
              operator: '<',
              value: 20,
              hasElse: true,
            },
            [
              b('pwr_gui_crit', 'gui_alert', {
                severity: 'critical',
                message: 'BACKUP REACTOR ENGAGED',
              }),
            ],
            [
              b('pwr_gui_ok', 'gui_alert', {
                severity: 'nominal',
                message: 'POWER NOMINAL — REACTOR STANDBY',
              }),
            ]
          ),
        ]),
      ],
    },
  },
  {
    id: 'docking-refuel-manager',
    name: 'Auto Docking & Refuel Manager',
    category: 'Power & Docking',
    difficulty: 'Intermediate',
    summary:
      'Automatically switches batteries to Recharge, enables H2 Stockpile, shuts off thrusters on dock, and displays a sleek graphical Docking HUD.',
    setupHint:
      'Name blocks: "Docking Connector", "Docking LCD", "Docking Light", and group thrusters as "Ship Thrusters". Optional cockpit hotkey argument: "dock".',
    project: {
      name: 'Auto Docking & Refuel Manager',
      description: 'Manages batteries, H2 stockpile, and thrusters automatically on dock/undock.',
      updateFrequency: 'Update100',
      sameGridOnly: true,
      blocks: [
        b('doc_arg', 'on_argument', { argument: 'dock' }, [
          b('doc_conn_toggle', 'connector_action', {
            name: 'Docking Connector',
            action: 'toggle',
          }),
        ]),
        b(
          'doc_if',
          'if_condition',
          {
            source: 'connector_connected',
            target: 'Docking Connector',
            boolExpect: 'true',
            hasElse: true,
          },
          [
            b('doc_batt_chg', 'battery_mode', { targetMode: 'all', name: '', mode: 'Recharge' }),
            b('doc_h2_stk', 'tank_stockpile', { gasType: 'hydrogen', stockpile: 'on', filter: '' }),
            b('doc_thr_off', 'block_power', { targetMode: 'group', name: 'Ship Thrusters', action: 'off' }),
            b('doc_light_grn', 'light_action', { targetMode: 'block', name: 'Docking Light', action: 'style', color: '#22C55E', blinkSeconds: 0 }),
          ],
          [
            b('doc_batt_auto', 'battery_mode', { targetMode: 'all', name: '', mode: 'Auto' }),
            b('doc_h2_norm', 'tank_stockpile', { gasType: 'hydrogen', stockpile: 'off', filter: '' }),
            b('doc_thr_on', 'block_power', { targetMode: 'group', name: 'Ship Thrusters', action: 'on' }),
            b('doc_light_amb', 'light_action', { targetMode: 'block', name: 'Docking Light', action: 'style', color: '#F59E0B', blinkSeconds: 0 }),
          ]
        ),
        b('doc_gui', 'gui_screen', {
          lcdName: 'Docking LCD',
          surfaceIndex: 0,
          bgColor: '#08111A',
          frameColor: '#38D9A9',
          showFrame: true,
          showGrid: false,
        }, [
          b('doc_hdr', 'gui_header', {
            title: 'DOCKING & REFUEL',
            badge: 'CONNECTOR',
            accentColor: '#38D9A9',
          }),
          b(
            'doc_gui_if',
            'if_condition',
            {
              source: 'connector_connected',
              target: 'Docking Connector',
              boolExpect: 'true',
              hasElse: true,
            },
            [
              b('doc_al_1', 'gui_alert', {
                severity: 'nominal',
                message: 'DOCKED — RECHARGING & STOCKPILING',
              }),
            ],
            [
              b('doc_al_2', 'gui_alert', {
                severity: 'info',
                message: 'UNDOCKED — FLIGHT SYSTEMS ACTIVE',
              }),
            ]
          ),
          b('doc_b_bar', 'gui_bar', {
            label: 'BATTERY CHARGE',
            source: 'battery_pct',
            target: '',
            style: 'segmented',
            icon: 'energy',
            colorMode: 'auto',
            color: '#22C55E',
          }),
          b('doc_h_bar', 'gui_bar', {
            label: 'HYDROGEN TANKS',
            source: 'h2_pct',
            target: '',
            style: 'segmented',
            icon: 'hydrogen',
            colorMode: 'auto',
            color: '#38BDF8',
          }),
        ]),
      ],
    },
  },
  {
    id: 'red-alert-combat',
    name: 'Red Alert & Turret Defense',
    category: 'Combat & Alerts',
    difficulty: 'Intermediate',
    summary:
      'Watches ship turrets for incoming hostiles — seals blast doors, flashes red alert lights, sounds klaxon, powers combat reactors, and updates Bridge GUI HUD.',
    setupHint:
      'Create groups "Alert Lights", "Blast Doors", and "Combat Reactors", plus blocks "Red Alert Sound", "Ship Antenna", and "Bridge LCD".',
    project: {
      name: 'Red Alert & Turret Defense',
      description: 'Triggers combat lockdown whenever any ship turret acquires a target.',
      updateFrequency: 'Update10',
      sameGridOnly: true,
      blocks: [
        b(
          'red_if',
          'if_condition',
          {
            source: 'turret_has_target',
            target: '',
            boolExpect: 'true',
            hasElse: true,
          },
          [
            b('red_lights', 'light_action', { targetMode: 'group', name: 'Alert Lights', action: 'style', color: '#EF4444', blinkSeconds: 0.5 }),
            b('red_sound', 'sound_action', { name: 'Red Alert Sound', action: 'play', soundName: 'Alert 2' }),
            b('red_doors', 'door_action', { targetMode: 'group', name: 'Blast Doors', action: 'lock' }),
            b('red_react', 'block_power', { targetMode: 'group', name: 'Combat Reactors', action: 'on' }),
            b('red_ant', 'broadcast_text', { deviceType: 'antenna', name: 'Ship Antenna', hudText: 'RED ALERT - HOSTILES ENGAGED', radius: 10000 }),
          ],
          [
            b('red_lights_ok', 'light_action', { targetMode: 'group', name: 'Alert Lights', action: 'style', color: '#E2E8F0', blinkSeconds: 0 }),
            b('red_sound_off', 'sound_action', { name: 'Red Alert Sound', action: 'stop', soundName: '' }),
            b('red_doors_ok', 'door_action', { targetMode: 'group', name: 'Blast Doors', action: 'unlock' }),
            b('red_ant_ok', 'broadcast_text', { deviceType: 'antenna', name: 'Ship Antenna', hudText: 'ALL CLEAR - BATT {battery}%', radius: 5000 }),
          ]
        ),
        b('red_gui', 'gui_screen', {
          lcdName: 'Bridge LCD',
          surfaceIndex: 0,
          bgColor: '#0D090B',
          frameColor: '#EF4444',
          showFrame: true,
          showGrid: false,
        }, [
          b('red_hdr', 'gui_header', {
            title: 'TACTICAL DEFENSE',
            badge: 'TURRETS',
            accentColor: '#EF4444',
          }),
          b(
            'red_gui_if',
            'if_condition',
            {
              source: 'turret_has_target',
              target: '',
              boolExpect: 'true',
              hasElse: true,
            },
            [
              b('red_al1', 'gui_alert', { severity: 'critical', message: 'RED ALERT — HOSTILES ENGAGED' }),
              b('red_al2', 'gui_alert', { severity: 'warning', message: 'BLAST DOORS SEALED · REACTORS ONLINE' }),
            ],
            [
              b('red_ok1', 'gui_alert', { severity: 'nominal', message: 'CONDITION GREEN — NO HOSTILES' }),
            ]
          ),
          b('red_b_bar', 'gui_bar', {
            label: 'WEAPON / SHIP POWER',
            source: 'battery_pct',
            target: '',
            style: 'segmented',
            icon: 'energy',
            colorMode: 'auto',
            color: '#22C55E',
          }),
        ]),
      ],
    },
  },
  {
    id: 'hull-breach-lockdown',
    name: 'Hull Breach & O2 Lockdown',
    category: 'Airlocks & Safety',
    difficulty: 'Beginner',
    summary:
      'Monitors hangar or cabin air vent oxygen. If a hull breach drops oxygen below 50%, seals bulkhead doors, flashes amber warning lights, and updates the Safety HUD.',
    setupHint:
      'Name blocks: "Hangar Vent", "Breach Alarm", "Safety LCD", and groups "Bulkhead Doors" and "Hangar Lights".',
    project: {
      name: 'Hull Breach & O2 Lockdown',
      description: 'Auto-seals bulkheads if room oxygen drops below 50%.',
      updateFrequency: 'Update10',
      sameGridOnly: true,
      blocks: [
        b(
          'bre_if',
          'if_condition',
          {
            source: 'vent_o2_pct',
            target: 'Hangar Vent',
            operator: '<',
            value: 50,
            hasElse: true,
          },
          [
            b('bre_lock', 'door_action', { targetMode: 'group', name: 'Bulkhead Doors', action: 'lock' }),
            b('bre_light_w', 'light_action', { targetMode: 'group', name: 'Hangar Lights', action: 'style', color: '#F59E0B', blinkSeconds: 0.5 }),
            b('bre_snd_on', 'sound_action', { name: 'Breach Alarm', action: 'play', soundName: 'Alert 3' }),
          ],
          [
            b('bre_unlock', 'door_action', { targetMode: 'group', name: 'Bulkhead Doors', action: 'unlock' }),
            b('bre_light_ok', 'light_action', { targetMode: 'group', name: 'Hangar Lights', action: 'style', color: '#E2E8F0', blinkSeconds: 0 }),
            b('bre_snd_off', 'sound_action', { name: 'Breach Alarm', action: 'stop', soundName: '' }),
          ]
        ),
        b('bre_gui', 'gui_screen', {
          lcdName: 'Safety LCD',
          surfaceIndex: 0,
          bgColor: '#08111A',
          frameColor: '#38D9A9',
          showFrame: true,
          showGrid: false,
        }, [
          b('bre_hdr', 'gui_header', {
            title: 'LIFE SUPPORT MONITOR',
            badge: 'HANGAR',
            accentColor: '#38D9A9',
          }),
          b('bre_vbar', 'gui_bar', {
            label: 'HANGAR OXYGEN',
            source: 'vent_o2_pct',
            target: 'Hangar Vent',
            style: 'segmented',
            icon: 'oxygen',
            colorMode: 'auto',
            color: '#22C55E',
          }),
          b('bre_tbar', 'gui_bar', {
            label: 'O2 TANK RESERVES',
            source: 'o2_pct',
            target: '',
            style: 'smooth',
            icon: 'oxygen',
            colorMode: 'auto',
            color: '#38BDF8',
          }),
          b(
            'bre_gui_if',
            'if_condition',
            {
              source: 'vent_o2_pct',
              target: 'Hangar Vent',
              operator: '<',
              value: 50,
              hasElse: true,
            },
            [
              b('bre_al1', 'gui_alert', { severity: 'critical', message: 'HULL BREACH — BULKHEADS SEALED' }),
            ],
            [
              b('bre_ok1', 'gui_alert', { severity: 'nominal', message: 'ATMOSPHERE NOMINAL' }),
            ]
          ),
        ]),
      ],
    },
  },
];

export function cloneProject(project: ScriptProject): ScriptProject {
  return JSON.parse(JSON.stringify(project)) as ScriptProject;
}
