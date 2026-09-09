import {
  ArrowCounterClockwise,
  DotsThreeVertical,
  GithubLogo,
  PencilSimple,
  Plus,
  Trash,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { Favicon } from "./favicon";
import type { SiteItem } from "../types";

interface GithubHomeEntryProps {
  site: SiteItem | null;
  deleteArmed: boolean;
  onAdd: () => void;
  onOpen: (site: SiteItem) => void;
  onRefresh: () => void | Promise<void>;
  refreshing: boolean;
  onEdit: (site: SiteItem) => void;
  onDelete: (site: SiteItem) => void;
}

export function GithubHomeEntry({
  site,
  deleteArmed,
  onAdd,
  onOpen,
  onRefresh,
  refreshing,
  onEdit,
  onDelete,
}: GithubHomeEntryProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [menuOpen]);

  return (
    <section
      className={`github-home-entry ${site ? "has-site" : ""}`}
      aria-label="GitHub 官方主页"
    >
      {site && (
        <a
          className="github-home-entry-full-link"
          href={site.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="打开 GitHub"
          aria-hidden="true"
          tabIndex={-1}
          onClick={() => onOpen(site)}
        />
      )}
      <div className="github-home-entry-copy">
        <span className="github-home-entry-icon">
          {site ? <Favicon site={site} size="large" /> : <GithubLogo size={28} weight="fill" />}
        </span>
        <div>
          <strong>{site?.name || "GitHub 官方主页"}</strong>
          <span>https://github.com/</span>
        </div>
      </div>
      <div className="github-home-entry-actions">
        {site ? (
          <button
            type="button"
            className="button icon-button primary-button github-home-entry-open"
            aria-label="刷新仓库"
            title="刷新仓库"
            aria-busy={refreshing || undefined}
            disabled={refreshing}
            onClick={() => void onRefresh()}
          >
            <ArrowCounterClockwise
              className={refreshing ? "spin" : undefined}
              size={18}
              weight="bold"
            />
          </button>
        ) : (
          <button type="button" className="button primary-button github-home-entry-open" onClick={onAdd}>
            <Plus size={16} weight="bold" />
            添加官方主页
          </button>
        )}
        <div className="github-home-entry-menu" ref={menuRef}>
          <button
            type="button"
            className="icon-button github-home-entry-menu-trigger"
            aria-label="管理 GitHub 官方主页"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            disabled={!site}
            onClick={() => setMenuOpen((current) => !current)}
          >
            <DotsThreeVertical size={18} weight="bold" />
          </button>
          {menuOpen && (
            <div className="github-home-entry-menu-popover" role="menu">
              {site && (
                <>
                  <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onEdit(site); }}>
                    <PencilSimple size={16} />编辑官方入口
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="is-danger"
                    data-delete-site-id={site.id}
                    onClick={() => {
                      if (deleteArmed) setMenuOpen(false);
                      onDelete(site);
                    }}
                  >
                    <Trash size={16} />{deleteArmed ? "再次点击删除官方入口" : "删除官方入口"}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
