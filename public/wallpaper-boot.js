/* Runs before the application module. This is a disposable saved preview,
   never collection state; all input is validated before touching the DOM. */
(() => {
  // Start the authoritative read while the module graph downloads/parses.
  // The promise is consumed once by main.tsx; no second collection cache.
  try {
    if (globalThis.chrome?.runtime?.id && chrome.storage?.local) {
      let latest;
      const changed = (changes, area) => {
        if (area === "local" && "site-hub:v1" in changes) latest = { "site-hub:v1": changes["site-hub:v1"].newValue };
      };
      chrome.storage.onChanged?.addListener(changed);
      const pending = chrome.storage.local.get("site-hub:v1");
      pending.catch(() => undefined);
      window.__MYSIMPLE_STARTUP__ = {
        read: async () => { const values = await pending; return latest ?? values; },
        dispose: () => chrome.storage.onChanged?.removeListener(changed),
      };
    }
  } catch { /* The store's normal read/recovery path remains available. */ }
  try {
    const theme = localStorage.getItem("site-hub:theme-startup:v1");
    if (theme === "dark" || theme === "light" || theme === "system") {
      const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.dataset.theme = dark ? "dark" : "light";
      document.documentElement.style.colorScheme = dark ? "dark" : "light";
      document.documentElement.style.backgroundColor = dark ? "#171a21" : "#f4f6f9";
    }
  } catch { /* Presentation preferences are optional. */ }
  try {
    const cached = JSON.parse(localStorage.getItem("site-hub:wallpaper-startup:v1") || "null");
    if (!cached || typeof cached.preview !== "string" || cached.preview.length > 800000
      || !/^data:image\/(?:webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(cached.preview)) return;
    const wallpaper = cached.wallpaper;
    if (!wallpaper || !cached.key || cached.key !== (wallpaper.source === "local" ? `local:${wallpaper.localAssetId}`
      : wallpaper.source === "url" ? `url:${wallpaper.url}` : "")) return;
    const clamp = (value, min, max, fallback) => typeof value === "number" && Number.isFinite(value)
      ? Math.max(min, Math.min(max, value)) : fallback;
    const dark = cached.theme === "dark" || (cached.theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    const style = document.createElement("style");
    style.id = "wallpaper-startup-style";
    style.textContent = `html[data-wallpaper-startup] {
        background: ${dark ? "#171a21" : "#f4f6f9"}; scrollbar-gutter: stable;
        overflow-y: scroll; scrollbar-width: thin; scrollbar-color: #8a9aaa transparent;
      }
      html[data-wallpaper-startup] body { background: transparent; }
      #wallpaper-startup { position: fixed; z-index: 0; pointer-events: none; overflow: hidden; }
      #wallpaper-startup img, #wallpaper-startup span { position: absolute; inset: 0; width: 100%; height: 100%; }
      html[data-wallpaper-startup] #root { position: relative; z-index: 1; }`;
    document.head.append(style);
    const layer = document.createElement("div");
    layer.id = "wallpaper-startup";
    layer.setAttribute("aria-hidden", "true");
    const blur = clamp(wallpaper.blur, 0, 20, 0);
    layer.style.inset = `${-blur * 1.5}px`;
    const image = document.createElement("img");
    image.alt = "";
    image.src = cached.preview;
    image.fetchPriority = "high";
    image.style.objectFit = wallpaper.fit === "contain" ? "contain" : "cover";
    image.style.objectPosition = `${clamp(wallpaper.positionX, 0, 100, 50)}% ${clamp(wallpaper.positionY, 0, 100, 50)}%`;
    image.style.transformOrigin = image.style.objectPosition;
    image.style.transform = `scale(${clamp(wallpaper.zoom, 50, 300, 100) / 100 * 1.02})`;
    image.style.filter = `blur(${blur}px)`;
    const overlay = document.createElement("span");
    overlay.style.background = `rgb(${dark ? "14 17 23" : "244 246 249"} / ${clamp(wallpaper.overlay, 0, 80, 22) / 100})`;
    layer.append(image, overlay);
    document.documentElement.dataset.wallpaperStartup = "true";
    document.documentElement.append(layer);
  } catch { /* Missing/corrupt previews cannot block application startup. */ }
})();
