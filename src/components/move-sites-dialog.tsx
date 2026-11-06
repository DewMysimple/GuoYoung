import * as Dialog from "@radix-ui/react-dialog";
import { useState, type FormEvent } from "react";
import { getGroupPath, getGroupsInTreeOrder } from "../lib/group-hierarchy";
import { getGroupWorkspace } from "../lib/github-workspace";
import { canMoveSiteToGroup } from "../lib/site-state";
import type { SiteGroup, SiteItem } from "../types";
import { CategoryIcon } from "./category-icon";
import { DialogNavigation } from "./dialog-navigation";

export function MoveSitesDialog({ sites, groups, onClose, onMove }: {
  sites: SiteItem[];
  groups: SiteGroup[];
  onClose: () => void;
  onMove: (groupId: string) => void;
}) {
  const [target, setTarget] = useState("");
  const destinations = getGroupsInTreeOrder(groups)
    .filter(group => sites.length > 0 &&
      sites.some(site => site.groupId !== group.id) &&
      sites.every(site => canMoveSiteToGroup(site, group)));
  const validTarget = destinations.some(group => group.id === target);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (validTarget) onMove(target);
  }

  return (
    <Dialog.Root open onOpenChange={open => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content new-group-dialog move-sites-dialog">
          <div className="dialog-header">
            <div>
              <Dialog.Title className="dialog-title">移动至分组</Dialog.Title>
              <Dialog.Description className="dialog-description">
                为所选的 {sites.length} 个网站选择一个目标分组。
              </Dialog.Description>
            </div>
            <DialogNavigation />
          </div>
          <form className="new-group-dialog-form" onSubmit={submit}>
            <div className="new-group-dialog-scroll">
              {destinations.length ? (
                <fieldset className="field-group">
                  <legend>目标分组</legend>
                  <div className="category-choice-grid">
                    {destinations.map(group => (
                      <label key={group.id} className={`category-choice ${target === group.id ? "selected" : ""}`}>
                        <input type="radio" name="move-target" value={group.id}
                          checked={target === group.id} onChange={() => setTarget(group.id)} />
                        <CategoryIcon name={group.icon} size={17} />
                        <span>{getGroupWorkspace(group) === "github" ? "GitHub · " : ""}{getGroupPath(groups, group.id)}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : <p className="field-help">所选网站没有共同可用的目标分组。请分别移动不同工作区的网站。</p>}
            </div>
            <div className="dialog-footer">
              <Dialog.Close asChild><button type="button" className="button secondary-button">取消</button></Dialog.Close>
              <button type="submit" className="button primary-button" disabled={!validTarget}>移动网站</button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
