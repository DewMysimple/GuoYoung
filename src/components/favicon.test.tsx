import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as browserFaviconPlaceholder from "../lib/browser-favicon-placeholder";
import { clearFaviconResolutionCache, Favicon } from "./favicon";

function loadImageAt(image: HTMLImageElement, width: number, height = width) {
  Object.defineProperties(image, {
    naturalWidth: { configurable: true, value: width },
    naturalHeight: { configurable: true, value: height },
  });
  fireEvent.load(image);
}

describe("Favicon", () => {
  afterEach(() => cleanup());
  beforeEach(() => {
    clearFaviconResolutionCache();
    delete (globalThis as typeof globalThis & { chrome?: unknown }).chrome;
    vi.spyOn(
      browserFaviconPlaceholder,
      "isBrowserFaviconPlaceholder",
    ).mockResolvedValue(false);
  });

  it("tries the custom icon, native favicon, then optional web mirrors", () => {
    const { container } = render(
      <Favicon
        site={{
          name: "Example",
          url: "https://example.com/path",
          customIconUrl: "https://cdn.example.com/icon.png",
        }}
      />,
    );
    const image = () => container.querySelector("img") as HTMLImageElement;
    expect(image().src).toBe("https://cdn.example.com/icon.png");
    fireEvent.error(image());
    expect(image().src).toBe("https://example.com/favicon.ico");
    fireEvent.error(image());
    expect(image().src).toContain("google.com/s2/favicons");
    expect(image().src).toContain("sz=256");
    fireEvent.error(image());
    expect(image().src).toContain("icons.duckduckgo.com");
  });

  it("uses an official-color Simple Icon only after every favicon fails", () => {
    const { container } = render(
      <Favicon site={{ name: "GitHub", url: "https://github.com" }} />,
    );
    for (let index = 0; index < 3; index += 1) {
      fireEvent.error(container.querySelector("img") as HTMLImageElement);
    }
    const fallback = screen.getByTestId("favicon-brand-fallback");
    expect(fallback.querySelector("path")).toHaveAttribute("fill", "#181717");
  });

  it("uses the site initial when no favicon or brand icon exists", () => {
    const { container } = render(
      <Favicon site={{ name: "Personal Notes", url: "https://notes.example" }} />,
    );
    for (let index = 0; index < 3; index += 1) {
      fireEvent.error(container.querySelector("img") as HTMLImageElement);
    }
    expect(screen.getByTestId("favicon-fallback")).toHaveTextContent("P");
  });

  it("skips low-resolution automatic icons and accepts a sharp one", () => {
    const { container } = render(
      <Favicon site={{ name: "YouTube", url: "https://youtube.com" }} />,
    );
    const image = () => container.querySelector("img") as HTMLImageElement;

    expect(image().src).toBe("https://youtube.com/favicon.ico");
    loadImageAt(image(), 144);

    expect(image()).toHaveClass("is-loaded");
    expect(container.querySelector(".favicon-letter")).toBeNull();
  });

  it("rejects 16px and 32px automatic icons before using a brand vector", () => {
    const { container } = render(
      <Favicon site={{ name: "YouTube", url: "https://youtube.com" }} />,
    );
    const image = () => container.querySelector("img") as HTMLImageElement;

    loadImageAt(image(), 32);
    expect(image().src).toContain("google.com/s2/favicons");
    loadImageAt(image(), 16);
    expect(image().src).toContain("icons.duckduckgo.com");
    loadImageAt(image(), 32);

    expect(screen.getByTestId("favicon-brand-fallback")).toBeVisible();
  });

  it("keeps the largest native bitmap when an unknown site has no sharp source", () => {
    const { container } = render(
      <Favicon site={{ name: "Unknown", url: "https://unknown.example" }} />,
    );
    const image = () => container.querySelector("img") as HTMLImageElement;

    loadImageAt(image(), 48);
    loadImageAt(image(), 16);
    loadImageAt(image(), 32);
    expect(image().src).toBe("https://unknown.example/favicon.ico");
    loadImageAt(image(), 48);

    expect(image()).toHaveClass("is-loaded");
    expect(container.querySelector(".favicon-letter")).toBeNull();
  });

  it("trusts an explicitly configured custom icon regardless of dimensions", () => {
    const { container } = render(
      <Favicon
        site={{
          name: "Custom",
          url: "https://custom.example",
          customIconUrl: "https://cdn.example.com/custom-32.png",
        }}
      />,
    );
    const image = container.querySelector("img") as HTMLImageElement;

    loadImageAt(image, 32);

    expect(image).toHaveClass("is-loaded");
    expect(image.src).toBe("https://cdn.example.com/custom-32.png");
  });

  it("uses a selected brand vector without requesting a bitmap", () => {
    const { container } = render(
      <Favicon
        site={{
          name: "哔哩哔哩",
          url: "https://www.bilibili.com",
          iconSource: "brand",
        }}
      />,
    );

    expect(screen.getByTestId("favicon-selected-brand")).toBeVisible();
    expect(container.querySelector("img")).toBeNull();
  });

  it("accepts a low-resolution bitmap when the user selected that source", () => {
    const { container } = render(
      <Favicon
        site={{
          name: "Example",
          url: "https://example.com",
          iconSource: "root",
        }}
      />,
    );
    const image = container.querySelector("img") as HTMLImageElement;

    expect(image.src).toBe("https://example.com/favicon.ico");
    loadImageAt(image, 16);

    expect(image).toHaveClass("is-loaded");
    expect(container.querySelector(".favicon-letter")).toBeNull();
  });

  it("removes the letter layer after a transparent favicon loads", () => {
    const { container } = render(
      <Favicon site={{ name: "GitHub", url: "https://github.com" }} />,
    );
    const image = container.querySelector("img") as HTMLImageElement;
    expect(container.querySelector(".favicon-letter")).toHaveTextContent("G");

    fireEvent.load(image);

    expect(container.querySelector(".favicon-letter")).toBeNull();
    expect(image).toHaveClass("is-loaded");
  });

  it("reuses the successful favicon source after the component remounts", () => {
    const site = {
      name: "Cached Example",
      url: "https://cache-example.test",
    };
    const firstRender = render(<Favicon site={site} />);
    const firstImage = () =>
      firstRender.container.querySelector("img") as HTMLImageElement;

    expect(firstImage().src).toBe("https://cache-example.test/favicon.ico");
    fireEvent.load(firstImage());
    firstRender.unmount();

    const secondRender = render(<Favicon site={site} />);
    const secondImage = secondRender.container.querySelector(
      "img",
    ) as HTMLImageElement;
    expect(secondImage.src).toBe("https://cache-example.test/favicon.ico");
    expect(secondRender.container.querySelector(".favicon-letter")).toBeNull();
  });

  it("uses the site favicon before Chromium's local cache in extension mode", () => {
    (globalThis as typeof globalThis & { chrome?: unknown }).chrome = {
      runtime: {
        id: "test-extension",
        getURL: (path: string) => `chrome-extension://test-extension${path}`,
      },
    };
    const { container } = render(
      <Favicon site={{ name: "Example", url: "https://example.com" }} />,
    );
    const image = () => container.querySelector("img") as HTMLImageElement;

    expect(image().src).toBe("https://example.com/favicon.ico");
    fireEvent.error(image());
    expect(image().src).toContain("chrome-extension://test-extension/_favicon/");
    expect(image().src).toContain("pageUrl=https%3A%2F%2Fexample.com");
    expect(image().src).toContain("size=64");
  });

  it("rejects Chromium's generic placeholder and continues to a real fallback", async () => {
    vi.mocked(
      browserFaviconPlaceholder.isBrowserFaviconPlaceholder,
    ).mockResolvedValue(true);
    (globalThis as typeof globalThis & { chrome?: unknown }).chrome = {
      runtime: {
        id: "test-extension",
        getURL: (path: string) => `chrome-extension://test-extension${path}`,
      },
    };
    const { container } = render(
      <Favicon
        site={{ name: "Placeholder", url: "https://placeholder.example" }}
      />,
    );
    const image = () => container.querySelector("img") as HTMLImageElement;

    expect(image().src).toBe("https://placeholder.example/favicon.ico");
    fireEvent.error(image());
    expect(image().src).toContain("chrome-extension://test-extension/_favicon/");
    loadImageAt(image(), 64);

    await waitFor(() => {
      expect(image().src).toContain("icons.duckduckgo.com");
    });
    fireEvent.error(image());
    expect(image().src).toContain("google.com/s2/favicons");
    fireEvent.error(image());
    expect(screen.getByTestId("favicon-fallback")).toHaveTextContent("P");
  });

  it("accepts a verified Chromium favicon after the site root fails", async () => {
    (globalThis as typeof globalThis & { chrome?: unknown }).chrome = {
      runtime: {
        id: "test-extension",
        getURL: (path: string) => `chrome-extension://test-extension${path}`,
      },
    };
    const { container } = render(
      <Favicon
        site={{ name: "Verified", url: "https://verified.example/path" }}
      />,
    );
    const image = () => container.querySelector("img") as HTMLImageElement;

    fireEvent.error(image());
    expect(image().src).toContain("chrome-extension://test-extension/_favicon/");
    loadImageAt(image(), 64);

    await waitFor(() => expect(image()).toHaveClass("is-loaded"));
  });
});
