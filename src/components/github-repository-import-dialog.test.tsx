import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { createDefaultState } from "../data/defaults";
import { GithubRepositoryImportDialog } from "./github-repository-import-dialog";

afterEach(cleanup);
it("keeps user choices and input across unrelated updates, pruning only newly unavailable repositories", async () => {
  const user = userEvent.setup();
  const state = createDefaultState();
  const props = {
    open: true, state, loading: false, onOpenChange: vi.fn(), onRead: vi.fn(), onConfirm: vi.fn(),
    preview: {
      owner: { login: "sample", profileUrl: "https://github.com/sample", entityType: "user" as const },
      repositories: [1, 2, 3].map((id) => ({ id, name: `repo-${id}`, fullName: `sample/repo-${id}`, htmlUrl: `https://github.com/sample/repo-${id}`, fork: false, archived: false })),
    },
  };
  const { rerender } = render(<GithubRepositoryImportDialog {...props} />);
  await user.click(screen.getAllByRole("checkbox")[0]);
  await user.type(screen.getByLabelText("作者或组织主页"), "https://github.com/next");
  rerender(<GithubRepositoryImportDialog {...props} state={{ ...state, brand: { ...state.brand, name: "Changed" } }} />);
  expect(screen.getAllByRole("checkbox")[0]).not.toBeChecked();
  expect(screen.getByLabelText("作者或组织主页")).toHaveValue("https://github.com/next");
  rerender(<GithubRepositoryImportDialog {...props} state={{ ...state, sites: [...state.sites, { ...state.sites[0], id: "imported", url: props.preview.repositories[1].htmlUrl }] }} />);
  expect(screen.getAllByRole("checkbox")[1]).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "确认添加 1 项" }));
  expect(props.onConfirm).toHaveBeenCalledWith(new Set([3]));
});
