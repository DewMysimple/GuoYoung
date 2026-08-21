import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { Warning } from "@phosphor-icons/react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
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
  onOpenChange,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="dialog-overlay" />
        <AlertDialog.Content className="confirm-content">
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
