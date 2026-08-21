import {
  getChromiumExtensionApi,
  isExtensionEnvironment,
  type ChromiumExtensionApi,
} from "./browser-runtime";

export interface WebSearchOptions {
  api?: ChromiumExtensionApi;
  navigate?: (url: string) => void;
}

export async function searchWeb(
  input: string,
  options: WebSearchOptions = {},
): Promise<boolean> {
  const text = input.trim();
  if (!text) return false;

  const api = options.api ?? getChromiumExtensionApi();
  if (isExtensionEnvironment(api) && api?.search?.query) {
    await api.search.query({
      text,
      disposition: "CURRENT_TAB",
    });
    return true;
  }

  const target = `https://www.google.com/search?q=${encodeURIComponent(text)}`;
  const navigate =
    options.navigate ??
    ((url: string) => {
      window.location.assign(url);
    });
  navigate(target);
  return true;
}
