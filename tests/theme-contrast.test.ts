/**
 * The contrast theme promises a black background with white, yellow and green
 * text. This guards the palette against a future edit that quietly reduces
 * legibility: every text colour is checked against the surfaces it is used on,
 * and borders against the background.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../app/src/theme.css', import.meta.url), 'utf8');
const block = css.match(/:root\[data-theme='contrast'\]\s*\{([^}]*)\}/)?.[1] ?? '';
const vars = Object.fromEntries(
  [...block.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]),
);

const channel = (value: number) => {
  const srgb = value / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
};

function luminance(hex: string): number {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  assert.ok(match, `expected a 6-digit hex colour, got ${hex}`);
  const value = Number.parseInt(match[1], 16);
  return 0.2126 * channel((value >> 16) & 255) + 0.7152 * channel((value >> 8) & 255) + 0.0722 * channel(value & 255);
}

function ratio(foreground: string, background: string): number {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

const check = (label: string, foreground: string, background: string, minimum: number) => {
  const value = ratio(foreground, background);
  assert.ok(value >= minimum, `${label}: ${foreground} on ${background} is ${value.toFixed(2)}:1, expected at least ${minimum}:1`);
};

test('the contrast theme defines its own palette', () => {
  assert.ok(block, 'theme.css has a :root[data-theme=\'contrast\'] block');
  assert.equal(vars.bg, '#000000', 'the background is black');
  assert.equal(vars.text, '#ffffff', 'body text is white');
});

test('text meets AAA on the contrast theme', () => {
  check('body text', vars.text, vars.bg, 7);
  check('muted text', vars.muted, vars.bg, 7);
  check('faint text', vars.faint, vars.bg, 4.5);
  check('body text on panels', vars.text, vars.panel, 7);
  check('muted text on panels', vars.muted, vars.panel, 7);
});

test('the green and yellow accents are legible as text', () => {
  check('green accent', vars.accent, vars.bg, 4.5);
  check('yellow accent', vars['accent-2'], vars.bg, 4.5);
  check('green on panels', vars.accent, vars.panel, 4.5);
  check('yellow on panels', vars['accent-2'], vars.panel, 4.5);
});

test('borders are visible against black and the panels', () => {
  check('line', vars.line, vars.bg, 3);
  check('line on panels', vars.line, vars.panel, 3);
  check('strong line', vars['line-strong'], vars.bg, 4.5);
});
