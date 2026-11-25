/**
 * The liquid glass theme promises a dark backdrop with frosted, translucent
 * surfaces. This guards the two things that make it what it is: nothing opaque
 * hiding the colours behind the glass, and text still legible on the night sky.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../app/src/theme.css', import.meta.url), 'utf8');
const block = css.match(/:root\[data-theme='glass'\]\s*\{([^}]*)\}/)?.[1] ?? '';
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

test('the glass theme defines a dark, translucent palette', () => {
  assert.ok(block, "theme.css has a :root[data-theme='glass'] block");
  assert.ok(luminance(vars.bg) < 0.05, `the background is near-black, got ${vars.bg}`);
  for (const name of ['panel', 'panel-2', 'panel-3', 'line']) {
    assert.match(vars[name] ?? '', /^rgba\(/, `--${name} stays see-through so the backdrop shows`);
  }
});

test('glass surfaces are actually frosted', () => {
  const surface = css.match(/:root\[data-theme='glass'\] \.card(?:[\s\S]*?)\{([^}]*)\}/)?.[1] ?? '';
  assert.ok(surface, "theme.css frosts .card in the glass theme");
  assert.match(surface, /backdrop-filter:\s*blur\(/, '.card blurs what is behind it');
  // A prefixed copy next to the standard property made the minifier keep only
  // one of them, so the theme must declare the standard property alone.
  assert.doesNotMatch(surface, /-webkit-backdrop-filter/, 'the filter is declared once, unprefixed');
});

test('text stays legible on the glass backdrop', () => {
  for (const name of ['text', 'muted', 'faint']) {
    const value = ratio(vars[name], vars.bg);
    assert.ok(value >= 4.5, `${name} text is ${value.toFixed(2)}:1 on the background, expected at least 4.5:1`);
  }
  assert.ok(ratio(vars.accent, vars.bg) >= 4.5, 'the accent is readable as text');
  assert.ok(ratio(vars['accent-2'], vars.bg) >= 4.5, 'the second accent is readable as text');
});
