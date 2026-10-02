// Serializable browser-side inspector. Read the executed graph rather than
// accepting an authored custom property as proof that the material rendered.
export function readGlassMaterial(element, pseudo = false) {
  const style = getComputedStyle(element, pseudo ? '::before' : null);
  const id = style.filter.match(/url\([^)]*#([^"')]+)/)?.[1];
  if (id?.startsWith('wallpaper-material-')) {
    const filter = document.getElementById(id);
    const href = filter?.querySelector('feImage[result="colored"]')?.getAttribute('href');
    const profile = href?.startsWith('#') ? document.getElementById(href.slice(1)) : null;
    if (!profile?.querySelector('image')?.getAttribute('href')) return null;
    const strength = filter?.querySelector('feImage[result="lens"]')?.getAttribute('href')
      ? Number(filter.querySelector('feDisplacementMap')?.getAttribute('scale') ?? 0) : 0;
    return { blur: Number(profile.querySelector('feGaussianBlur')?.getAttribute('stdDeviation')),
      saturation: Number(profile.querySelector('feColorMatrix[type="saturate"]')?.getAttribute('values')),
      refraction: strength > 0, strength, sampling: 'wallpaper' };
  }
  const filter = style.backdropFilter;
  const lens = filter.match(/url\([^)]*#([^"')]+)/)?.[1];
  const strength = lens ? Number(document.getElementById(lens)?.querySelector('feDisplacementMap')?.getAttribute('scale') ?? 0) : 0;
  return { blur: parseFloat(filter.match(/blur\(([^)]+)/)?.[1] ?? '0'),
    saturation: parseFloat(filter.match(/saturate\(([^)]+)/)?.[1] ?? '1'),
    refraction: strength > 0, strength, sampling: filter === 'none' ? 'none' : 'backdrop' };
}

export async function describeGlassMaterial(locator, pseudo = false) {
  const material = await locator.evaluate(readGlassMaterial, pseudo);
  if (!material) return 'missing material source';
  return [material.blur ? `blur(${material.blur}px)` : '',
    material.saturation !== 1 ? `saturate(${material.saturation})` : '',
    material.refraction ? `refract(${material.strength}px)` : ''].filter(Boolean).join(' ') || 'none';
}

// Keep optical styling fixed while comparing displacement on/off. Both the
// native lens and explicit-source graphs are controlled; preferences are not saved.
export async function withoutGlassRefraction(page, capture) {
  await page.evaluate(() => {
    for (const map of document.querySelectorAll('feDisplacementMap')) {
      map.setAttribute('data-diagnostic-scale', map.getAttribute('scale') ?? '0');
      map.setAttribute('scale', '0');
    }
    window.dispatchEvent(new Event('resize'));
  });
  try {
    await page.waitForTimeout(100);
    return await capture();
  } finally {
    await page.evaluate(() => {
      for (const map of document.querySelectorAll('feDisplacementMap[data-diagnostic-scale]')) {
        map.setAttribute('scale', map.getAttribute('data-diagnostic-scale'));
        map.removeAttribute('data-diagnostic-scale');
      }
      window.dispatchEvent(new Event('resize'));
    });
  }
}
