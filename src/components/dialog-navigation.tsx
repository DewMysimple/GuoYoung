import * as Dialog from "@radix-ui/react-dialog";
import { ArrowLeft, X } from "@phosphor-icons/react";

/** Shared navigation for collection editors; Radix owns focus restoration. */
export function DialogNavigation() {
  return (
    <div className="panel-header-actions">
      <Dialog.Close asChild>
        <button type="button" className="panel-back-button" aria-label="返回收藏主页">
          <ArrowLeft size={16} />
          返回
        </button>
      </Dialog.Close>
      <Dialog.Close asChild>
        <button type="button" className="icon-button" aria-label="关闭">
          <X size={19} />
        </button>
      </Dialog.Close>
    </div>
  );
}
