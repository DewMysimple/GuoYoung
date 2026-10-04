import assert from 'node:assert/strict';
import { test } from 'vitest';
import { runInNewContext } from 'node:vm';
import { readGlassMaterial } from '../../scripts/read-glass-material.mjs';

// Exercise the exact serialized inspector against independent observations.
function inspect({ backdrop = 'blur(24px)', foreground = 'none', pseudo = false,
  content = 'none', lensHref, lensInput = 'SourceGraphic' }: {
  backdrop?: string; foreground?: string; pseudo?: boolean; content?: string;
  lensHref?: string; lensInput?: string;
} = {}): ReturnType<typeof readGlassMaterial> {
  const element = {};
  const graph = lensHref === undefined ? null : {
    querySelector: (selector: string) => ({ getAttribute: (attribute: string) =>
      selector === 'feImage' ? (attribute === 'href' ? lensHref : null)
        : attribute === 'in' ? lensInput : attribute === 'scale' ? '12' : null }),
  };
  const result = runInNewContext(`(${readGlassMaterial.toString()})(element, pseudo)`, {
    element, pseudo,
    document: { getElementById: () => graph },
    getComputedStyle: () => ({ display: 'block', content, filter: foreground, backdropFilter: backdrop }),
  });
  return result === null ? null : JSON.parse(JSON.stringify(result));
}

test('reads native glass without wallpaper geometry or source variables', () => {
  assert.deepEqual(inspect(), { blur: 24, effectiveBlur: 24, sourceBlur: 0,
    saturation: 1, refraction: false, strength: 0, sampling: 'backdrop' });
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

test('optional refraction consumes the native SourceGraphic', () => {
  const material = inspect({ backdrop: 'blur(24px) url("#wallpaper-glass-lens")',
    lensHref: 'data:image/png;base64,lens-map' });
  assert.equal(material?.sampling, 'backdrop');
  assert.equal(material?.blur, 24);
  assert.equal(material?.refraction, true);
  assert.equal(material?.strength, 12);
});

test('missing or non-native lens inputs fail inspection', () => {
  assert.equal(inspect({ backdrop: 'url("#wallpaper-glass-lens")' }), null);
  assert.equal(inspect({ backdrop: 'url("#wallpaper-glass-lens")', lensHref: '' }), null);
  assert.equal(inspect({ backdrop: 'url("#wallpaper-glass-lens")', lensHref: 'image', lensInput: 'wallpaper' }), null);
});
