import type { GithubImportSource } from "../types";

const GITHUB_HOSTS = new Set(["github.com", "www.github.com"]);
const LOGIN_PATTERN = /^[A-Za-z0-9-]{1,39}$/;
const API_HEADERS = {
  Accept: "application/vnd.github+json",
};

export interface GithubOwnerProfile {
  login: string;
  profileUrl: string;
  entityType: GithubImportSource["entityType"];
  name?: string;
}

export interface GithubRepositorySummary {
  id: number;
  name: string;
  fullName: string;
  htmlUrl: string;
  fork: boolean;
  archived: boolean;
}

export interface GithubOwnerRepositories {
  owner: GithubOwnerProfile;
  repositories: GithubRepositorySummary[];
}

export class GithubRepositoryApiError extends Error {
  readonly status?: number;
  readonly resetAt?: number;

  constructor(message: string, status?: number, resetAt?: number) {
    super(message);
    this.name = "GithubRepositoryApiError";
    this.status = status;
    this.resetAt = resetAt;
  }
}

function apiErrorMessage(status: number): string {
  if (status === 403 || status === 429) {
    return "GitHub API 请求次数已达上限，请稍后再试。";
  }
  if (status === 404) return "找不到这个 GitHub 作者或组织。";
  if (status >= 500) return "GitHub 服务暂时不可用，请稍后再试。";
  return "GitHub API 请求失败，请检查网络后重试。";
}

function readResetAt(response: Response): number | undefined {
  const value = Number(response.headers.get("x-ratelimit-reset"));
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

async function requestJson<T>(
  url: string,
  fetchImpl: typeof fetch,
): Promise<T> {
  let response: Response;
  try {
    response = await fetchImpl(url, { headers: API_HEADERS });
  } catch {
    throw new GithubRepositoryApiError(
      "无法连接 GitHub API，请检查网络后重试。",
    );
  }
  if (!response.ok) {
    throw new GithubRepositoryApiError(
      apiErrorMessage(response.status),
      response.status,
      readResetAt(response),
    );
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw new GithubRepositoryApiError("GitHub API 返回的数据无法读取。", response.status);
  }
}

export function parseGithubOwnerUrl(input: string): GithubOwnerProfile {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("请输入 GitHub 作者或组织主页地址");

  const withProtocol = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    throw new Error("请输入有效的 GitHub 作者或组织主页地址");
  }

  if (url.protocol !== "https:" || !GITHUB_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error("只支持 github.com 上的作者或组织主页");
  }
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length !== 1) {
    throw new Error("请输入作者或组织主页，例如 https://github.com/用户名");
  }
  let login: string;
  try {
    login = decodeURIComponent(segments[0]);
  } catch {
    throw new Error("GitHub 登录名格式无效");
  }
  if (!LOGIN_PATTERN.test(login)) {
    throw new Error("GitHub 登录名格式无效");
  }
  return {
    login,
    profileUrl: `https://github.com/${login}`,
    entityType: "user",
  };
}

function nextPageFromLink(link: string | null): string | undefined {
  if (!link) return undefined;
  for (const part of link.split(",")) {
    const match = part.match(/<([^>]+)>;\s*rel="([^"]+)"/);
    if (match?.[2].split(" ").includes("next")) return match[1];
  }
  return undefined;
}

export async function fetchGithubOwnerRepositories(
  input: string | GithubOwnerProfile,
  fetchImpl: typeof fetch = fetch,
): Promise<GithubOwnerRepositories> {
  const inputProfile = typeof input === "string" ? parseGithubOwnerUrl(input) : input;
  const encodedLogin = encodeURIComponent(inputProfile.login);
  const profile = await requestJson<{
    login?: unknown;
    type?: unknown;
    name?: unknown;
    html_url?: unknown;
  }>(`https://api.github.com/users/${encodedLogin}`, fetchImpl);
  const login = typeof profile.login === "string" ? profile.login : inputProfile.login;
  const entityType: GithubImportSource["entityType"] =
    profile.type === "Organization" ? "organization" : "user";
  const owner: GithubOwnerProfile = {
    login,
    profileUrl: `https://github.com/${login}`,
    entityType,
    ...(typeof profile.name === "string" && profile.name.trim()
      ? { name: profile.name.trim() }
      : {}),
  };

  const repositories: GithubRepositorySummary[] = [];
  let nextUrl = `https://api.github.com/${
    entityType === "organization" ? "orgs" : "users"
  }/${encodedLogin}/repos?per_page=100&sort=full_name&direction=asc`;
  while (nextUrl) {
    const response = await fetchImpl(nextUrl, { headers: API_HEADERS }).catch(() => {
      throw new GithubRepositoryApiError("无法连接 GitHub API，请检查网络后重试。");
    });
    if (!response.ok) {
      throw new GithubRepositoryApiError(
        apiErrorMessage(response.status),
        response.status,
        readResetAt(response),
      );
    }
    let items: unknown;
    try {
      items = await response.json();
    } catch {
      throw new GithubRepositoryApiError("GitHub API 返回的数据无法读取。", response.status);
    }
    if (!Array.isArray(items)) {
      throw new GithubRepositoryApiError("GitHub API 返回的仓库列表格式无效。", response.status);
    }
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const candidate = item as Record<string, unknown>;
      if (
        typeof candidate.id !== "number" ||
        typeof candidate.name !== "string" ||
        typeof candidate.full_name !== "string" ||
        typeof candidate.html_url !== "string" ||
        !candidate.name.trim() ||
        !candidate.full_name.trim() ||
        !isGithubRepositoryUrl(candidate.html_url) ||
        candidate.private === true
      ) {
        continue;
      }
      repositories.push({
        id: candidate.id,
        name: candidate.name,
        fullName: candidate.full_name,
        htmlUrl: candidate.html_url,
        fork: candidate.fork === true,
        archived: candidate.archived === true,
      });
    }
    nextUrl = nextPageFromLink(response.headers.get("link")) ?? "";
  }

  return { owner, repositories };
}

function isGithubRepositoryUrl(input: string): boolean {
  try {
    const url = new URL(input);
    const hostname = url.hostname.toLocaleLowerCase("en-US");
    const segments = url.pathname.split("/").filter(Boolean);
    return (
      url.protocol === "https:" &&
      (hostname === "github.com" || hostname === "www.github.com") &&
      segments.length === 2
    );
  } catch {
    return false;
  }
}

export function formatGithubRepositoryError(error: unknown): string {
  if (error instanceof GithubRepositoryApiError) {
    if (error.resetAt) {
      const reset = new Date(error.resetAt * 1000).toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
      });
      return `${error.message} 预计 ${reset} 后恢复。`;
    }
    return error.message;
  }
  return error instanceof Error ? error.message : "无法读取 GitHub 仓库。";
}
