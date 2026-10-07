import assert from 'node:assert/strict';
import { test } from 'vitest';
import { runInNewContext } from 'node:vm';
import { readGlassMaterial } from '../../scripts/read-glass-material.mjs';

// Exercise the exact serialized inspector against independent observations.
function inspect({ backdrop = 'blur(24px)', foreground = 'none', pseudo = false,
  content = 'none' }: { backdrop?: string; foreground?: string; pseudo?: boolean; content?: string } = {}): ReturnType<typeof readGlassMaterial> {
  const result = runInNewContext(`(${readGlassMaterial.toString()})(element, pseudo)`, {
    element: {}, pseudo,
    getComputedStyle: () => ({ display: 'block', content, filter: foreground, backdropFilter: backdrop }),
  });
  return result === null ? null : JSON.parse(JSON.stringify(result));
}

test('reads native glass without wallpaper geometry or source variables', () => {
  assert.deepEqual(inspect(), { blur: 24, saturation: 1, sampling: 'backdrop' });
});

test('combines multiple native blur passes by variance', () => {
  const material = inspect({ backdrop: 'blur(3px) blur(4px) saturate(130%)' });
  assert.equal(material?.blur, 5);
  assert.equal(material?.saturation, 1.3);
});

test('foreground blur cannot masquerade as background material', () => {
  const material = inspect({ backdrop: 'none', foreground: 'blur(24px)' });
  assert.equal(material?.sampling, 'none');
  assert.equal(material?.blur, 0);
});

test('absent card pseudo-elements provide no material', () => {
  assert.equal(inspect({ pseudo: true })?.sampling, 'none');
  assert.equal(inspect({ pseudo: true })?.blur, 0);
});

test('native control pseudo-elements expose their actual backdrop', () => {
  assert.equal(inspect({ pseudo: true, content: '""', backdrop: 'blur(4px)' })?.blur, 4);
});

test('neutral glass has no invented filter', () => {
  assert.equal(inspect({ backdrop: 'none' })?.sampling, 'none');
});

test('unknown filter graphs fail inspection', () => {
  assert.equal(inspect({ backdrop: 'url("#unsupported-filter")' }), null);
});
