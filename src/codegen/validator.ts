import type { ValidationIssue } from '../types';

/**
 * Validates that generated C# code conforms to Space Engineers Programmable Block
 * rules (no using/namespace/class Program wrapper, C# 6.0 syntax safety,
 * balanced delimiters, and within the 100,000-character PB limit).
 */
export function validateGeneratedCSharp(code: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (code.length > 100000) {
    issues.push({
      severity: 'error',
      message: `Script exceeds Space Engineers' 100,000 character limit (${code.length.toLocaleString()} chars).`,
    });
  }

  // Strip string literals and single-line comments before structural checks
  let inString = false;
  let escaped = false;
  let inLineComment = false;
  let braceDepth = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  let stripped = '';

  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    const next = code[i + 1];

    if (inLineComment) {
      if (ch === '\n') {
        inLineComment = false;
        stripped += '\n';
      }
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '/' && next === '/') {
      inLineComment = true;
      i++;
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    stripped += ch;
    if (ch === '{') braceDepth++;
    else if (ch === '}') braceDepth--;
    else if (ch === '(') parenDepth++;
    else if (ch === ')') parenDepth--;
    else if (ch === '[') bracketDepth++;
    else if (ch === ']') bracketDepth--;

    if (braceDepth < 0 || parenDepth < 0 || bracketDepth < 0) {
      issues.push({
        severity: 'error',
        message: 'Unbalanced closing delimiter detected in generated C#.',
      });
      break;
    }
  }

  if (inString) {
    issues.push({ severity: 'error', message: 'Unterminated string literal in generated C#.' });
  }
  if (braceDepth !== 0) {
    issues.push({ severity: 'error', message: `Unbalanced curly braces (depth ${braceDepth}).` });
  }
  if (parenDepth !== 0) {
    issues.push({ severity: 'error', message: `Unbalanced parentheses (depth ${parenDepth}).` });
  }
  if (bracketDepth !== 0) {
    issues.push({ severity: 'error', message: `Unbalanced square brackets (depth ${bracketDepth}).` });
  }

  // SE Programmable Block specific checks
  if (/^\s*using\s+[A-Za-z]/m.test(stripped)) {
    issues.push({
      severity: 'error',
      message: 'Space Engineers PB scripts must not contain "using" directives.',
    });
  }
  if (/\bclass\s+Program\b/.test(stripped)) {
    issues.push({
      severity: 'error',
      message: 'Space Engineers PB scripts must not declare "class Program" directly.',
    });
  }
  if (/\bout\s+var\b/.test(stripped)) {
    issues.push({
      severity: 'error',
      message: 'C# 7 "out var" syntax detected; Space Engineers requires C# 6 compatibility.',
    });
  }
  if (!/public\s+void\s+Main\s*\(/.test(stripped)) {
    issues.push({
      severity: 'error',
      message: 'Missing required "public void Main(...)" entry point.',
    });
  }

  return issues;
}
