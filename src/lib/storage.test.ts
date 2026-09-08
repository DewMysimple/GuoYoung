import { describe, expect, it } from "vitest";
import { createDefaultState } from "../data/defaults";
import { isSiteCollectionState, loadState, saveState, STORAGE_KEY } from "./storage";

function memoryStorage(initial?: string) {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set(STORAGE_KEY, initial);
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    values,
  };
}

describe("local storage", () => {
  it("loads defaults for a new browser", () => {
    const result = loadState(memoryStorage());
    expect(result.recovered).toBe(false);
    expect(result.state.sites).toHaveLength(12);
    expect(result.state.groups).toHaveLength(10);
    expect(result.state.groups.at(-1)?.id).toBe("github-other");
    expect(result.state.groups.filter((group) => group.workspace === "github")).toHaveLength(4);
    expect(result.state.brand).toMatchObject({
      name: "Mysimple",
      logoSource: "default",
      showLogo: true,
      showName: true,
    });
  });

  it("preserves invalid source data and reports recovery", () => {
    const storage = memoryStorage("{bad json");
    const result = loadState(storage);
    expect(result.recovered).toBe(true);
    expect(storage.getItem(STORAGE_KEY)).toBe("{bad json");
  });

  it("saves and validates a complete state", () => {
    const storage = memoryStorage();
    const state = createDefaultState();
    saveState(state, storage);
    const stored = JSON.parse(storage.getItem(STORAGE_KEY)!);
    expect(isSiteCollectionState(stored)).toBe(true);
  });

  it("migrates version 1 categories without losing sites", () => {
    const defaults = createDefaultState();
    const legacy = {
      version: 1,
      themePreference: "dark",
      sites: defaults.sites.map(({ groupId, ...site }) => ({
        ...site,
        categoryId: groupId,
      })),
    };
    const result = loadState(memoryStorage(JSON.stringify(legacy)));
    expect(result.recovered).toBe(false);
    expect(result.state.version).toBe(14);
    expect(result.state.appearance.cardWidth).toBe(160);
    expect(result.state.searchHistory).toEqual([]);
    expect(result.state.groups).toHaveLength(10);
    expect(result.state.sites.find((site) => site.id === "github")?.groupId).toBe(
      "develop",
    );
  });

  it("migrates version 2 custom groups and adds protected Other", () => {
    const defaults = createDefaultState();
    const legacy = {
      version: 2,
      themePreference: "light",
      groups: defaults.groups
        .filter((group) => group.id !== "other")
        .map(({ isProtected: _isProtected, ...group }) => group),
      sites: defaults.sites.map(({ globalOrder: _globalOrder, ...site }) => site),
    };
    const result = loadState(memoryStorage(JSON.stringify(legacy)));
    expect(result.recovered).toBe(false);
    expect(result.state.version).toBe(14);
    expect(result.state.groups.find((group) => group.id === "other")).toMatchObject({
      id: "other",
      name: "其他",
      isProtected: true,
    });
  });

  it("upgrades version 3 data with a stable global site order", () => {
    const defaults = createDefaultState();
    const legacy = {
      ...defaults,
      version: 3,
      sites: defaults.sites
        .slice()
        .reverse()
        .map(({ globalOrder: _globalOrder, ...site }) => site),
    };
    const result = loadState(memoryStorage(JSON.stringify(legacy)));
    expect(result.recovered).toBe(false);
    expect(result.state.version).toBe(14);
    expect(
      result.state.sites
        .slice()
        .sort((a, b) => a.globalOrder - b.globalOrder)
        .slice(0, 2)
        .map((site) => site.id),
    ).toEqual(["wikipedia", "mdn"]);
  });

  it("upgrades version 5 wallpaper positions to continuous controls", () => {
    const defaults = createDefaultState();
    const legacy = {
      ...defaults,
      version: 5,
      wallpaper: {
        source: "url",
        url: "https://example.com/wallpaper.jpg",
        fit: "cover",
        position: "right bottom",
        blur: 4,
        overlay: 30,
      },
    };
    const result = loadState(memoryStorage(JSON.stringify(legacy)));

    expect(result.recovered).toBe(false);
    expect(result.state.version).toBe(14);
    expect(result.state.wallpaper).toMatchObject({
      positionX: 100,
      positionY: 100,
      zoom: 100,
      topbarBlurEnabled: true,
      topbarBlur: 16,
      topbarOpacity: 68,
    });
  });

  it("upgrades version 6 with independent text scales and a flat display", () => {
    const defaults = createDefaultState();
    const {
      brandFontScale: _brandFontScale,
      cardFontScale: _cardFontScale,
      ...legacyAppearance
    } = defaults.appearance;
    const { displayMode: _displayMode, ...legacyState } = defaults;
    const result = loadState(
      memoryStorage(
        JSON.stringify({
          ...legacyState,
          version: 6,
          appearance: legacyAppearance,
        }),
      ),
    );

    expect(result.recovered).toBe(false);
    expect(result.state.version).toBe(14);
    expect(result.state.displayMode).toBe("flat");
    expect(result.state.displayModeByWorkspace).toEqual({
      main: "flat",
      github: "flat",
    });
    expect(result.state.appearance).toMatchObject({
      brandFontScale: 100,
      cardFontScale: 100,
      siteIconSize: 38,
      uiIconScale: 100,
    });
    expect(result.state.brand.name).toBe("Mysimple");
  });

  it("upgrades version 7 data with default branding and safe visual controls", () => {
    const defaults = createDefaultState();
    const { brand: _brand, ...legacy } = defaults;
    const legacyAppearance = {
      accentColor: defaults.appearance.accentColor,
      layoutPreset: defaults.appearance.layoutPreset,
      fontScale: 100,
      brandFontScale: 100,
      cardFontScale: 100,
      cardWidth: 160,
      cardHeight: 140,
      gap: 12,
      contentWidth: 1600,
      radius: 16,
    };
    const result = loadState(
      memoryStorage(
        JSON.stringify({ ...legacy, version: 7, appearance: legacyAppearance }),
      ),
    );

    expect(result.recovered).toBe(false);
    expect(result.state.version).toBe(14);
    expect(result.state.brand.name).toBe("Mysimple");
    expect(result.state.appearance).toMatchObject({
      pagePadding: 20,
      topbarHeight: 64,
      groupIconSize: 16,
      cardPadding: 12,
      siteIconScale: 100,
    });
  });

  it("upgrades version 8 with an empty 30-day recycle bin", () => {
    const defaults = createDefaultState();
    const { deletedSites: _deletedSites, trashRetentionDays: _trashRetentionDays, ...legacy } =
      defaults;
    const result = loadState(
      memoryStorage(JSON.stringify({ ...legacy, version: 8 })),
    );

    expect(result.recovered).toBe(false);
    expect(result.state.version).toBe(14);
    expect(result.state.deletedSites).toEqual([]);
    expect(result.state.trashRetentionDays).toBe(30);
  });

  it("migrates version 9 sites to click heat without losing existing counts", () => {
    const defaults = createDefaultState();
    const legacy = {
      ...defaults,
      version: 9,
      sites: defaults.sites.map(({ clickCount: _clickCount, ...site }) =>
        site.id === "github" ? { ...site, clickCount: 7 } : site,
      ),
      deletedSites: [
        {
          deletedAt: "2026-08-24T00:00:00.000Z",
          originalGroupId: "search",
          originalGroupName: "搜索",
          site: {
            ...defaults.sites[0],
            clickCount: 3,
          },
        },
      ],
    };

    const result = loadState(memoryStorage(JSON.stringify(legacy)));

    expect(result.recovered).toBe(false);
    expect(result.state.version).toBe(14);
    expect(result.state.sites.find((site) => site.id === "github")?.clickCount).toBe(7);
    expect(result.state.sites.find((site) => site.id === "google")?.clickCount).toBe(0);
    expect(result.state.deletedSites[0].site.clickCount).toBe(3);
  });

  it("migrates version 11 display mode into independent workspace modes", () => {
    const defaults = createDefaultState();
    const { displayModeByWorkspace: _displayModes, ...legacy } = defaults;
    const result = loadState(
      memoryStorage(
        JSON.stringify({
          ...legacy,
          version: 11,
          displayMode: "grouped",
        }),
      ),
    );

    expect(result.recovered).toBe(false);
    expect(result.state.version).toBe(14);
    expect(result.state.displayModeByWorkspace).toEqual({
      main: "grouped",
      github: "flat",
    });
  });

  it("migrates version 12 to 14 without overwriting independent display modes", () => {
    const defaults = createDefaultState();
    const { version: _version, ...legacy } = defaults;
    const result = loadState(
      memoryStorage(
        JSON.stringify({
          ...legacy,
          version: 12,
          displayMode: "grouped",
          displayModeByWorkspace: { main: "flat", github: "grouped" },
        }),
      ),
    );

    expect(result.recovered).toBe(false);
    expect(result.state.version).toBe(14);
    expect(result.state.displayModeByWorkspace).toEqual({
      main: "flat",
      github: "grouped",
    });
  });

  it("adds persistent sort modes when upgrading version 13", () => {
    const defaults = createDefaultState();
    const {
      sortMode: _sortMode,
      sortModeByWorkspace: _sortModes,
      ...legacy
    } = defaults;
    const result = loadState(
      memoryStorage(
        JSON.stringify({
          ...legacy,
          version: 13,
          displayModeByWorkspace: { main: "flat", github: "grouped" },
        }),
      ),
    );

    expect(result.state.version).toBe(14);
    expect(result.state.sortMode).toBe("manual");
    expect(result.state.sortModeByWorkspace).toEqual({
      main: "manual",
      github: "manual",
    });
  });

  it("preserves valid per-workspace sort modes in version 14", () => {
    const state = createDefaultState();
    state.sortMode = "heat";
    state.sortModeByWorkspace = { main: "heat", github: "name-desc" };
    const result = loadState(memoryStorage(JSON.stringify(state)));

    expect(result.state.sortMode).toBe("heat");
    expect(result.state.sortModeByWorkspace).toEqual({
      main: "heat",
      github: "name-desc",
    });
  });

  it("preserves valid GitHub author refresh metadata in version 14 state", () => {
    const state = createDefaultState();
    state.groups = state.groups.map((group) =>
      group.id === "github-repositories"
        ? {
            ...group,
            githubImportSource: {
              login: "acme",
              profileUrl: "https://github.com/acme",
              entityType: "user" as const,
              lastFetchedAt: "2026-08-27T01:00:00.000Z",
            },
          }
        : group,
    );
    const result = loadState(memoryStorage(JSON.stringify(state)));

    expect(result.recovered).toBe(false);
    expect(result.state.groups.find((group) => group.id === "github-repositories"))
      .toMatchObject({ githubImportSource: { login: "acme" } });
  });

  it("merges a duplicate Other group without losing its sites", () => {
    const defaults = createDefaultState();
    const protectedOther = defaults.groups.find(
      (group) => group.id === "other",
    )!;
    const duplicateOther = {
      ...protectedOther,
      id: "other-duplicate",
      isProtected: false,
      order: defaults.groups.length - 1,
    };
    const googleGlobalOrder = defaults.sites.find(
      (site) => site.id === "google",
    )!.globalOrder;
    const state = {
      ...defaults,
      groups: [
        ...defaults.groups.filter((group) => group.id !== "other"),
        duplicateOther,
        { ...protectedOther, order: defaults.groups.length },
      ],
      sites: defaults.sites.map((site) =>
        site.id === "google"
          ? { ...site, groupId: duplicateOther.id, order: 0 }
          : site,
      ),
    };

    expect(isSiteCollectionState(state)).toBe(true);
    const result = loadState(memoryStorage(JSON.stringify(state)));

    expect(result.recovered).toBe(false);
    expect(
      result.state.groups.filter(
        (group) => group.workspace === "main" && group.name === "其他",
      ),
    ).toHaveLength(1);
    expect(result.state.groups.find((group) => group.id === "other")).toMatchObject({
      id: "other",
      isProtected: true,
    });
    expect(result.state.sites.find((site) => site.id === "google")).toMatchObject(
      {
        groupId: "other",
        globalOrder: googleGlobalOrder,
      },
    );
    expect(result.state.sites).toHaveLength(defaults.sites.length);
  });
});
