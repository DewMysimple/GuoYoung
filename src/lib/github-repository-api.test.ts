import { describe, expect, it, vi } from "vitest";
import {
  fetchGithubOwnerRepositories,
  GithubRepositoryApiError,
  parseGithubOwnerUrl,
} from "./github-repository-api";

function response(body: unknown, status = 200, link?: string): Response {
  const headers = new Headers();
  if (link) headers.set("link", link);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers,
    json: async () => body,
  } as Response;
}

describe("GitHub repository API", () => {
  it("accepts author and organization profile URLs but rejects repository URLs", () => {
    expect(parseGithubOwnerUrl("https://www.github.com/DewMysimple/")).toMatchObject({
      login: "DewMysimple",
      profileUrl: "https://github.com/DewMysimple",
    });
    expect(() => parseGithubOwnerUrl("https://github.com/DewMysimple/GuoYoung")).toThrow(
      "作者或组织主页",
    );
    expect(() => parseGithubOwnerUrl("https://github.io/DewMysimple")).toThrow();
    expect(() => parseGithubOwnerUrl("https://github.com.evil.example/DewMysimple")).toThrow();
  });

  it("detects organizations and follows serial pagination", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    fetchImpl
      .mockResolvedValueOnce(
        response({ login: "acme", type: "Organization", name: "Acme" }),
      )
      .mockResolvedValueOnce(
        response(
          [
            {
              id: 1,
              name: "one",
              full_name: "acme/one",
              html_url: "https://github.com/acme/one",
              private: false,
              fork: true,
              archived: true,
            },
          ],
          200,
          '<https://api.github.com/orgs/acme/repos?per_page=100&page=2>; rel="next"',
        ),
      )
      .mockResolvedValueOnce(
        response([
          {
            id: 2,
            name: "two",
            full_name: "acme/two",
            html_url: "https://github.com/acme/two",
            private: false,
            fork: false,
            archived: false,
          },
          {
            id: 3,
            name: "private",
            full_name: "acme/private",
            html_url: "https://github.com/acme/private",
            private: true,
          },
          {
            id: 4,
            name: "not-github",
            full_name: "acme/not-github",
            html_url: "https://notgithub.com/acme/not-github",
            private: false,
          },
        ]),
      );

    const result = await fetchGithubOwnerRepositories("github.com/acme", fetchImpl);
    expect(result.owner).toMatchObject({
      login: "acme",
      entityType: "organization",
      name: "Acme",
    });
    expect(result.repositories.map((repo) => repo.fullName)).toEqual([
      "acme/one",
      "acme/two",
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl.mock.calls[1][0]).toContain("/orgs/acme/repos");
  });

  it("reports API errors and preserves rate-limit reset information", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue({
      ...response({ message: "rate limit" }, 403),
      headers: new Headers({ "x-ratelimit-reset": "1893456000" }),
    } as Response);

    await expect(
      fetchGithubOwnerRepositories("github.com/acme", fetchImpl),
    ).rejects.toMatchObject({
      name: "GithubRepositoryApiError",
      status: 403,
      resetAt: 1893456000,
    } satisfies Partial<GithubRepositoryApiError>);
  });
});
