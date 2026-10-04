import assert from 'node:assert/strict';
import { test } from 'vitest';
import { runInNewContext } from 'node:vm';
import { readGlassMaterial } from '../../scripts/read-glass-material.mjs';

// Exercise the exact serialized browser inspector with independent computed
// paint observations. This also catches accidental module-scope dependencies.
function inspect({ filter, sourceBlur = 8, sourceFilter = 'blur(5.65685px) blur(5.65685px)', native = false }: {
  filter: string; sourceBlur?: number; sourceFilter?: string; native?: boolean;
}): ReturnType<typeof readGlassMaterial> {
  const root = {}, layer = {};
  const source = { complete: true, naturalWidth: 1920, currentSrc: 'https://fixture.test/source.png', parentElement: layer };
  const card = { matches: () => !native };
  const style = { display: 'block', content: '""', filter, backdropFilter: native ? filter : 'none',
    backgroundImage: native ? 'none' : `url("${source.currentSrc}")`, backgroundAttachment: 'scroll, fixed' };
  const value = runInNewContext(`(${readGlassMaterial.toString()})(card, !native)`, {
    card, native,
    document: { documentElement: root, querySelector: () => source, getElementById: () => null },
    getComputedStyle: (element: unknown) => element === card ? style : element === root
      ? { getPropertyValue: () => `${sourceBlur}px` } : element === layer
        ? { ...style, filter: sourceFilter, backgroundAttachment: 'fixed' }
        : { filter: `blur(${sourceBlur}px)`, transform: 'none' },
  });
  return value === null ? null : JSON.parse(JSON.stringify(value));
}

for (const [extra, filter] of [
  [0, 'blur(5.65686px) blur(5.65686px) saturate(1)'],
  [1, 'blur(5.65685px) blur(5.74456px) saturate(1)'],
  [8, 'blur(5.65685px) blur(9.79796px) saturate(1)'],
  [24, 'blur(5.65685px) blur(24.6577px) saturate(1)'],
] as const) test(`observes source blur 8px plus additional blur ${extra}px`, () => {
  const result = inspect({ filter });
  assert.ok(result);
  assert.equal(result.sampling, 'wallpaper');
  assert.equal(result.sourceBlur, 8);
  assert.equal(result.blur, extra);
  assert.ok(Math.abs(result.effectiveBlur - Math.hypot(8, extra)) < .0001);
});

test('a missing card blur cannot masquerade as neutral glass', () => {
  assert.equal(inspect({ filter: 'saturate(1)' }), null);
});

test('a missing visible wallpaper blur cannot be justified by its source variable', () => {
  assert.equal(inspect({ filter: 'blur(8px)', sourceFilter: 'none' }), null);
});

test('zero wallpaper blur needs no redundant zero-radius pass', () => {
  assert.equal(inspect({ filter: 'blur(24px) saturate(1)', sourceBlur: 0, sourceFilter: 'none' })?.blur, 24);
  assert.equal(inspect({ filter: 'none', sourceBlur: 0, sourceFilter: 'none' })?.blur, 0);
});

test('native backdrop observations combine multiple blur passes too', () => {
  const result = inspect({ filter: 'blur(3px) blur(4px) saturate(130%)', native: true });
  assert.ok(result);
  assert.equal(result.sampling, 'backdrop');
  assert.equal(result.blur, 5);
  assert.equal(result.saturation, 1.3);
});

test('variance observations do not depend on equally split passes', () => {
  const result = inspect({ filter: 'blur(1px) blur(11.2694px) saturate(1)', sourceFilter: 'blur(1px) blur(7.93725px)' });
  assert.ok(result);
  assert.equal(result.blur, 8);
  assert.equal(result.sourceBlur, 8);
});
