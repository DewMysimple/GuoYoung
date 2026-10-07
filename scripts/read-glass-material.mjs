// Serializable browser-side inspector. Read the executed backdrop paint.
export function readGlassMaterial(element, pseudo = false) {
  const style = getComputedStyle(element, pseudo ? '::before' : null);
  if (style.display === 'none' || (pseudo && style.content === 'none')) {
    return { blur: 0, saturation: 1, sampling: 'none' };
  }
  const filter = style.backdropFilter;
  // Unknown filter graphs cannot establish that native glass rendered.
  if (filter.includes('url(')) return null;
  const blur = Math.hypot(...Array.from(filter.matchAll(/blur\(([^)]+)/g), match => parseFloat(match[1])));
  if (!Number.isFinite(blur)) return null;
  const saturation = filter.match(/saturate\(([^)]+)/)?.[1] ?? '1';
  return { blur: Math.round(blur * 1000) / 1000,
    saturation: parseFloat(saturation) / (saturation.includes('%') ? 100 : 1),
    sampling: filter === 'none' ? 'none' : 'backdrop' };
}

export async function describeGlassMaterial(locator, pseudo = false) {
  const material = await locator.evaluate(readGlassMaterial, pseudo);
  if (!material) return 'missing material source';
  return [material.blur ? `blur(${material.blur}px)` : '',
    material.saturation !== 1 ? `saturate(${material.saturation})` : ''].filter(Boolean).join(' ') || 'none';
}
