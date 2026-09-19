import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { createDefaultState } from "../data/defaults";
import { SiteDialog } from "./site-dialog";

afterEach(cleanup);
it("preserves a draft across external group updates and repairs only a deleted destination", async () => {
  const user = userEvent.setup();
  const state = createDefaultState();
  const props = { open: true, sites: state.sites, groups: state.groups, editingSite: null, onOpenChange: vi.fn(), onSubmit: vi.fn() };
  const { rerender } = render(<SiteDialog {...props} />);
  await user.type(screen.getByLabelText("网站地址"), "https://example.com/draft");
  await user.clear(screen.getByLabelText("网站名称"));
  await user.type(screen.getByLabelText("网站名称"), "Unfinished draft");
  rerender(<SiteDialog {...props} groups={state.groups.map((group) => ({ ...group }))} />);
  expect(screen.getByLabelText("网站名称")).toHaveValue("Unfinished draft");
  rerender(<SiteDialog {...props} groups={state.groups.filter((group) => group.id !== "search")} />);
  expect(screen.getByLabelText("网站名称")).toHaveValue("Unfinished draft");
  expect(screen.getByLabelText("网站地址")).toHaveValue("https://example.com/draft");
});
