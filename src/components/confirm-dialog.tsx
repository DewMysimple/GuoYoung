import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { useRef } from "react";
import { Warning } from "@phosphor-icons/react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  alternateAction?: { label: string; onClick: () => void };
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "取消",
  destructive = false,
  alternateAction,
  onOpenChange,
  onConfirm,
}: ConfirmDialogProps) {
  const returnFocus = useRef<HTMLElement | null>(null);
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="dialog-overlay" />
        <AlertDialog.Content className="confirm-content"
          onOpenAutoFocus={() => { returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }}
          onCloseAutoFocus={(event) => {
            // Confirmations are controlled by external actions, without an
            // AlertDialog.Trigger. Return to the still-mounted caller while
            // respecting a new workspace/dialog that already received focus.
            event.preventDefault();
            if (document.activeElement !== document.body && document.activeElement !== document.documentElement) return;
            if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true });
          }}>
          <span className={`confirm-icon ${destructive ? "destructive" : ""}`}>
            <Warning size={24} weight="regular" />
          </span>
          <AlertDialog.Title className="dialog-title">{title}</AlertDialog.Title>
          <AlertDialog.Description className="dialog-description">
            {description}
          </AlertDialog.Description>
          <div className="dialog-footer confirm-footer">
            <AlertDialog.Cancel asChild>
              <button type="button" className="button secondary-button">
                {cancelLabel}
              </button>
            </AlertDialog.Cancel>
            {alternateAction && <AlertDialog.Action asChild>
              <button type="button" className="button destructive-button" onClick={alternateAction.onClick}>
                {alternateAction.label}
              </button>
            </AlertDialog.Action>}
            <AlertDialog.Action asChild>
              <button
                type="button"
                className={`button ${
                  destructive ? "destructive-button" : "primary-button"
                }`}
                onClick={onConfirm}
              >
                {confirmLabel}
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
