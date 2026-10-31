import type { GithubImportSource } from "../../../types";

/** The workspace is selected by the caller; keep the first source for each login. */
export function deduplicateGithubRefreshSources(
  sources: readonly GithubImportSource[],
): GithubImportSource[] {
  return sources.filter(
    (source, index, all) =>
      all.findIndex(
        (candidate) =>
          candidate.login.toLocaleLowerCase("en-US") ===
          source.login.toLocaleLowerCase("en-US"),
      ) === index,
  );
}

/** Preserve full caller-owned entries; later details win, and success takes priority. */
export function orderGithubRefreshEntries<
  Entry extends { owner: { login: string } },
>(
  sources: readonly Pick<GithubImportSource, "login">[],
  successfulDetails: readonly Entry[],
  failures: readonly Entry[],
): Entry[] {
  const successfulByLogin = new Map(
    successfulDetails.map((detail) => [
      detail.owner.login.toLocaleLowerCase("en-US"),
      detail,
    ]),
  );
  const failedByLogin = new Map(
    failures.map((detail) => [
      detail.owner.login.toLocaleLowerCase("en-US"),
      detail,
    ]),
  );
  return sources
    .map(
      (source) =>
        successfulByLogin.get(source.login.toLocaleLowerCase("en-US")) ??
        failedByLogin.get(source.login.toLocaleLowerCase("en-US")),
    )
    .filter((entry): entry is Entry => Boolean(entry));
}

/** Summary for the successful batch path; the all-request-failed path stays separate. */
export function createGithubRefreshNotice(
  importedOwners: number,
  added: number,
  skipped: number,
  failedOwners: number,
): { kind: "error" | "success"; message: string } {
  const summary = `已刷新 ${importedOwners} 个作者仓库，新增 ${added} 个，跳过 ${skipped} 个。`;
  return {
    kind: failedOwners > 0 ? "error" : "success",
    message:
      failedOwners > 0 ? `${summary}失败 ${failedOwners} 个。` : summary,
  };
}
