import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { ArrowBendDownRight, Trash, Warning } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import type { GroupDeletionStrategy, SiteGroup } from "../types";

interface DeleteGroupDialogProps {
  open: boolean;
  group: SiteGroup | null;
  siteCount: number;
  onOpenChange: (open: boolean) => void;
  onDelete: (strategy: GroupDeletionStrategy) => void;
}

export function DeleteGroupDialog({
  open,
  group,
  siteCount,
  onOpenChange,
  onDelete,
}: DeleteGroupDialogProps) {
  const groupName = group?.name ?? "这个分组";
  const hasSites = siteCount > 0;
  const [armedStrategy, setArmedStrategy] =
    useState<GroupDeletionStrategy | null>(null);
  const armedTimerRef = useRef<number | null>(null);

  function clearArmedStrategy() {
    if (armedTimerRef.current !== null) {
      window.clearTimeout(armedTimerRef.current);
      armedTimerRef.current = null;
    }
    setArmedStrategy(null);
  }

  function requestDelete(
    event: MouseEvent<HTMLButtonElement>,
    strategy: GroupDeletionStrategy,
  ) {
    if (armedStrategy === strategy) {
      clearArmedStrategy();
      onDelete(strategy);
      return;
    }

    event.preventDefault();
    clearArmedStrategy();
    setArmedStrategy(strategy);
    armedTimerRef.current = window.setTimeout(() => {
      armedTimerRef.current = null;
      setArmedStrategy(null);
    }, 2000);
  }

  useEffect(() => {
    if (!open) clearArmedStrategy();
  }, [open]);

  useEffect(() => {
    if (!armedStrategy) return;
    const handleOutsidePointer = (event: PointerEvent) => {
      const strategy =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>("[data-group-delete-strategy]")
              ?.dataset.groupDeleteStrategy
          : undefined;
      if (strategy !== armedStrategy) clearArmedStrategy();
    };
    window.addEventListener("pointerdown", handleOutsidePointer, true);
    return () => {
      window.removeEventListener("pointerdown", handleOutsidePointer, true);
    };
  }, [armedStrategy]);

  useEffect(
    () => () => {
      if (armedTimerRef.current !== null) {
        window.clearTimeout(armedTimerRef.current);
      }
    },
    [],
  );

  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="dialog-overlay" />
        <AlertDialog.Content className="confirm-content delete-group-content">
          <span className="confirm-icon destructive">
            <Warning size={24} weight="regular" />
          </span>
          <AlertDialog.Title className="dialog-title">
            删除这个分组？
          </AlertDialog.Title>
          <AlertDialog.Description className="dialog-description">
            {hasSites
              ? `“${groupName}”中有 ${siteCount} 个网站，请选择如何处理。`
              : `“${groupName}”中没有网站，删除后无法恢复这个分组。`}
          </AlertDialog.Description>

          {hasSites ? (
            <div className="delete-group-options">
              <AlertDialog.Action asChild>
                <button
                  type="button"
                  className={`delete-group-option ${
                    armedStrategy === "move-to-other" ? "is-delete-armed" : ""
                  }`}
                  aria-pressed={armedStrategy === "move-to-other"}
                  aria-label={
                    armedStrategy === "move-to-other"
                      ? "再次点击移动到“其他”并删除分组"
                      : "移动到“其他”并删除分组"
                  }
                  data-group-delete-strategy="move-to-other"
                  onClick={(event) => requestDelete(event, "move-to-other")}
                >
                  <span className="delete-group-option-icon">
                    <ArrowBendDownRight size={20} />
                  </span>
                  <span>
                    <strong>
                      {armedStrategy === "move-to-other"
                        ? "再次点击确认移动并删除"
                        : "移动到“其他”并删除分组"}
                    </strong>
                    <small>
                      {armedStrategy === "move-to-other"
                        ? "请在 2 秒内再次点击同一选项。"
                        : "保留全部网站，并追加到“其他”的末尾。"}
                    </small>
                  </span>
                </button>
              </AlertDialog.Action>
              <AlertDialog.Action asChild>
                <button
                  type="button"
                  className={`delete-group-option destructive ${
                    armedStrategy === "delete-sites" ? "is-delete-armed" : ""
                  }`}
                  aria-pressed={armedStrategy === "delete-sites"}
                  aria-label={
                    armedStrategy === "delete-sites"
                      ? "再次点击连同网站一起删除"
                      : "连同网站一起删除"
                  }
                  data-group-delete-strategy="delete-sites"
                  onClick={(event) => requestDelete(event, "delete-sites")}
                >
                  <span className="delete-group-option-icon">
                    <Trash size={20} />
                  </span>
                  <span>
                    <strong>
                      {armedStrategy === "delete-sites"
                        ? "再次点击确认全部删除"
                        : "连同网站一起删除"}
                    </strong>
                    <small>
                      {armedStrategy === "delete-sites"
                        ? "请在 2 秒内再次点击同一选项。"
                        : "永久删除这个分组及其中的全部网站。"}
                    </small>
                  </span>
                </button>
              </AlertDialog.Action>
            </div>
          ) : (
            <div className="dialog-footer confirm-footer">
              <AlertDialog.Cancel asChild>
                <button type="button" className="button secondary-button">
                  取消
                </button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <button
                  type="button"
                  className={`button destructive-button ${
                    armedStrategy === "delete-sites" ? "is-delete-armed" : ""
                  }`}
                  aria-pressed={armedStrategy === "delete-sites"}
                  aria-label={
                    armedStrategy === "delete-sites"
                      ? "再次点击删除空分组"
                      : "删除空分组"
                  }
                  data-group-delete-strategy="delete-sites"
                  onClick={(event) => requestDelete(event, "delete-sites")}
                >
                  {armedStrategy === "delete-sites"
                    ? "再次点击删除"
                    : "删除空分组"}
                </button>
              </AlertDialog.Action>
            </div>
          )}

          {hasSites && (
            <div className="dialog-footer confirm-footer delete-group-cancel">
              <AlertDialog.Cancel asChild>
                <button type="button" className="button secondary-button">
                  取消
                </button>
              </AlertDialog.Cancel>
            </div>
          )}
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
