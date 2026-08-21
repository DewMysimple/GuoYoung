import { useEffect, useId, useState, type FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { FolderPlus, X } from "@phosphor-icons/react";
import { GROUP_ICON_OPTIONS } from "../data/group-icons";
import type { CategoryIcon, SiteGroup } from "../types";
import { CategoryIcon as GroupIcon } from "./category-icon";

interface NewGroupDialogProps {
  open: boolean;
  groups: SiteGroup[];
  insertionContext?: {
    groupName: string;
    position: "before" | "after";
  };
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string, icon: CategoryIcon) => void;
}

export function NewGroupDialog({
  open,
  groups,
  insertionContext,
  onOpenChange,
  onSubmit,
}: NewGroupDialogProps) {
  const titleId = useId();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<CategoryIcon>("folder");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setName("");
    setIcon("folder");
    setError("");
  }, [open]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const iconLabel =
      GROUP_ICON_OPTIONS.find((option) => option.value === icon)?.label ??
      "文件夹";
    const trimmed = name.trim() || iconLabel;
    if (
      groups.some(
        (group) =>
          group.name.toLocaleLowerCase("zh-CN") ===
          trimmed.toLocaleLowerCase("zh-CN"),
      )
    ) {
      setError("已经有同名分组");
      return;
    }
    onSubmit(trimmed, icon);
    onOpenChange(false);
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay group-dialog-overlay" />
        <Dialog.Content
          className="dialog-content new-group-dialog"
          aria-labelledby={titleId}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            document.getElementById("new-group-name")?.focus();
          }}
        >
          <div className="dialog-header">
            <div>
              <Dialog.Title id={titleId} className="dialog-title">
                新建分组
              </Dialog.Title>
              <Dialog.Description className="dialog-description">
                {insertionContext
                  ? `分组会创建在“${insertionContext.groupName}”${
                      insertionContext.position === "before" ? "之前" : "之后"
                    }，并保留当前分组总览。`
                  : "分组会添加到选择栏末尾，并自动切换到新分组。"}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button type="button" className="icon-button" aria-label="关闭">
                <X size={19} />
              </button>
            </Dialog.Close>
          </div>

          <form className="new-group-dialog-form" onSubmit={handleSubmit}>
            <div className="new-group-dialog-scroll">
              <div className="field-group">
                <label htmlFor="new-group-name">分组名称</label>
                <div className="input-shell">
                  <FolderPlus size={18} aria-hidden="true" />
                  <input
                    id="new-group-name"
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value);
                      setError("");
                    }}
                    placeholder="例如：工作"
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? "new-group-error" : undefined}
                  />
                </div>
                {error && (
                  <p id="new-group-error" className="field-error">
                    {error}
                  </p>
                )}
                {!name.trim() && !error && (
                  <p className="field-help">
                    留空将使用“
                    {GROUP_ICON_OPTIONS.find((option) => option.value === icon)
                      ?.label ?? "文件夹"}
                    ”
                  </p>
                )}
              </div>

              <fieldset className="field-group">
                <legend>分组图标</legend>
                <div className="group-icon-choice-grid">
                  {GROUP_ICON_OPTIONS.map((option) => (
                    <label
                      key={option.value}
                      className={`group-icon-choice ${
                        icon === option.value ? "selected" : ""
                      }`}
                    >
                      <input
                        type="radio"
                        name="group-icon"
                        value={option.value}
                        checked={icon === option.value}
                        onChange={() => setIcon(option.value)}
                      />
                      <GroupIcon name={option.value} size={19} />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>

            <div className="dialog-footer">
              <Dialog.Close asChild>
                <button type="button" className="button secondary-button">
                  取消
                </button>
              </Dialog.Close>
              <button type="submit" className="button primary-button">
                创建分组
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
