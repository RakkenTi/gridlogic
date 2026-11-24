function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const KEYWORDS = new Set([
  'public',
  'private',
  'const',
  'void',
  'bool',
  'int',
  'float',
  'double',
  'string',
  'new',
  'return',
  'if',
  'else',
  'for',
  'foreach',
  'in',
  'as',
  'out',
  'true',
  'false',
  'null',
  'continue',
  'break',
  'delegate',
  'ref',
  'using',
  'is',
]);

const SE_TYPES = new Set([
  'Program',
  'UpdateType',
  'UpdateFrequency',
  'ITerminalAction',
  'IMyPowerProducer',
  'IMyAssembler',
  'IMyRefinery',
  'IMyTextPanel',
  'IMyTextSurface',
  'IMyTextSurfaceProvider',
  'MySpriteDrawFrame',
  'MySprite',
  'SpriteType',
  'RectangleF',
  'Vector2',
  'IMyTerminalBlock',
  'IMyFunctionalBlock',
  'IMyInventory',
  'MyInventoryItem',
  'MyItemType',
  'IMyBatteryBlock',
  'ChargeMode',
  'IMyGasTank',
  'IMyCargoContainer',
  'IMyAirVent',
  'IMyDoor',
  'DoorStatus',
  'IMyLightingBlock',
  'IMyShipConnector',
  'MyShipConnectorStatus',
  'IMyShipController',
  'IMySolarPanel',
  'IMyReactor',
  'IMyProjector',
  'IMySensorBlock',
  'IMyLargeTurretBase',
  'IMyThrust',
  'IMySoundBlock',
  'IMyTimerBlock',
  'IMyRadioAntenna',
  'IMyBeacon',
  'IMyPistonBase',
  'IMyMotorStator',
  'IMyBlockGroup',
  'ContentType',
  'TextAlignment',
  'Color',
  'List',
  'Dictionary',
  'KeyValuePair',
  'StringBuilder',
  'StringComparison',
  'Math',
]);

export function highlightCSharpLine(line: string): string {
  let out = '';
  let i = 0;

  while (i < line.length) {
    // Line comment
    if (line[i] === '/' && line[i + 1] === '/') {
      out += `<span class="tok-comment">${escapeHtml(line.slice(i))}</span>`;
      break;
    }

    // String literal
    if (line[i] === '"') {
      let j = i + 1;
      while (j < line.length) {
        if (line[j] === '\\' && j + 1 < line.length) {
          j += 2;
        } else if (line[j] === '"') {
          j += 1;
          break;
        } else {
          j += 1;
        }
      }
      out += `<span class="tok-string">${escapeHtml(line.slice(i, j))}</span>`;
      i = j;
      continue;
    }

    // Char literal
    if (line[i] === "'") {
      let j = i + 1;
      while (j < line.length) {
        if (line[j] === '\\' && j + 1 < line.length) j += 2;
        else if (line[j] === "'") {
          j += 1;
          break;
        } else j += 1;
      }
      out += `<span class="tok-string">${escapeHtml(line.slice(i, j))}</span>`;
      i = j;
      continue;
    }

    // Numbers
    if (/[0-9]/.test(line[i]) && (i === 0 || !/[A-Za-z0-9_]/.test(line[i - 1]))) {
      let j = i;
      while (j < line.length && /[0-9.fF]/.test(line[j])) j++;
      out += `<span class="tok-number">${escapeHtml(line.slice(i, j))}</span>`;
      i = j;
      continue;
    }

    // Identifiers
    if (/[A-Za-z_]/.test(line[i])) {
      let j = i;
      while (j < line.length && /[A-Za-z0-9_]/.test(line[j])) j++;
      const word = line.slice(i, j);
      if (KEYWORDS.has(word)) {
        out += `<span class="tok-keyword">${word}</span>`;
      } else if (SE_TYPES.has(word)) {
        out += `<span class="tok-type">${word}</span>`;
      } else {
        out += escapeHtml(word);
      }
      i = j;
      continue;
    }

    out += escapeHtml(line[i]);
    i++;
  }

  return out || '&nbsp;';
}

export function renderHighlightedCSharp(code: string): string {
  const lines = code.replace(/\n$/, '').split('\n');
  return lines
    .map(
      (line, idx) =>
        `<div class="code-line"><span class="code-ln">${idx + 1}</span><span class="code-txt">${highlightCSharpLine(line)}</span></div>`
    )
    .join('');
}
