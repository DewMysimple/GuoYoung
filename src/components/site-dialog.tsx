import { useEffect, useId, useState, type FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Globe, LinkSimple, X } from "@phosphor-icons/react";
import {
  inferSiteName,
  normalizeOptionalIconUrl,
  normalizeUrl,
} from "../lib/site-utils";
import { findSiteByUrl } from "../lib/site-state";
import type { SiteFormValues, SiteGroup, SiteItem } from "../types";
import { CategoryIcon } from "./category-icon";
import { Favicon } from "./favicon";
import { IconSourcePicker } from "./icon-source-picker";

interface SiteDialogProps {
  open: boolean;
  sites: SiteItem[];
  groups: SiteGroup[];
  initialGroupId?: string;
  editingSite: SiteItem | null;
  prefill?: { name?: string; url: string };
  onOpenChange: (open: boolean) => void;
  onSubmit: (
    values: SiteFormValues & { url: string; customIconUrl?: string },
    replaceExistingId?: string,
  ) => void;
}

export function SiteDialog({
  open,
  sites,
  groups,
  initialGroupId,
  editingSite,
  prefill,
  onOpenChange,
  onSubmit,
}: SiteDialogProps) {
  const [values, setValues] = useState<SiteFormValues>({
    name: "",
    url: "",
    groupId: "",
    customIconUrl: "",
    iconSource: "auto",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof SiteFormValues, string>>>(
    {},
  );
  const [lastAutoName, setLastAutoName] = useState("");
  const [iconPickerUrl, setIconPickerUrl] = useState<string>();
  const [duplicateSite, setDuplicateSite] = useState<SiteItem | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const defaultGroupId =
      groups.find((group) => group.id === initialGroupId)?.id ?? groups[0]?.id ?? "";
    const prefillName = prefill?.name?.trim() ||
      (prefill?.url ? inferSiteName(prefill.url) : "") || "";
    setValues(
      editingSite
        ? {
            name: editingSite.name,
            url: editingSite.url,
            groupId: editingSite.groupId,
            customIconUrl: editingSite.customIconUrl ?? "",
            iconSource:
              editingSite.iconSource ??
              (editingSite.customIconUrl ? "custom" : "auto"),
          }
        : {
            name: prefillName,
            url: prefill?.url ?? "",
            groupId: defaultGroupId,
            customIconUrl: "",
            iconSource: "auto",
          },
    );
    setLastAutoName(editingSite ? "" : prefillName);
    setIconPickerUrl(editingSite?.url ?? prefill?.url);
    setErrors({});
    setDuplicateSite(null);
  }, [editingSite, groups, initialGroupId, open, prefill]);

  useEffect(() => {
    if (!open) return;
    if (editingSite && values.url === editingSite.url) {
      setIconPickerUrl(editingSite.url);
      return;
    }
    let nextUrl: string;
    try {
      nextUrl = normalizeUrl(values.url);
    } catch {
      setIconPickerUrl(undefined);
      return;
    }
    const timer = window.setTimeout(() => setIconPickerUrl(nextUrl), 250);
    return () => window.clearTimeout(timer);
  }, [editingSite, open, values.url]);

  function update<K extends keyof SiteFormValues>(key: K, value: SiteFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    if (key === "url" || key === "groupId") setDuplicateSite(null);
  }

  function updateUrl(value: string) {
    const inferredName = inferSiteName(value);
    setValues((current) => {
      const canAutofill =
        Boolean(inferredName) &&
        (!current.name.trim() || current.name.trim() === lastAutoName);
      return {
        ...current,
        url: value,
        name: canAutofill ? inferredName! : current.name,
      };
    });
    if (inferredName) setLastAutoName(inferredName);
    setErrors((current) => ({ ...current, url: undefined, name: undefined }));
    setDuplicateSite(null);
  }

  function updateCustomIconUrl(value: string) {
    setValues((current) => ({
      ...current,
      customIconUrl: value,
      iconSource: value.trim()
        ? "custom"
        : current.iconSource === "custom"
          ? "auto"
          : current.iconSource,
    }));
    setErrors((current) => ({ ...current, customIconUrl: undefined }));
  }

  function submitValues(confirmedDuplicateId?: string) {
    const nextErrors: Partial<Record<keyof SiteFormValues, string>> = {};

    if (!values.name.trim()) nextErrors.name = "请输入网站名称";
    if (!groups.some((group) => group.id === values.groupId)) {
      nextErrors.groupId = "请选择网站分组";
    }

    let url = "";
    let customIconUrl: string | undefined;
    try {
      url = normalizeUrl(values.url);
      const existing = findSiteByUrl(sites, url, editingSite?.id);
      if (existing) {
        if (editingSite) {
          nextErrors.url = "这个网站已经在收藏中";
        } else if (confirmedDuplicateId !== existing.id) {
          setDuplicateSite(existing);
          return;
        }
      }
    } catch (error) {
      nextErrors.url = error instanceof Error ? error.message : "网站地址无效";
    }

    try {
      customIconUrl = normalizeOptionalIconUrl(values.customIconUrl);
    } catch {
      nextErrors.customIconUrl = "请输入有效的图标地址";
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    onSubmit({
      name: values.name.trim(),
      url,
      groupId: values.groupId,
      customIconUrl: customIconUrl ?? "",
      iconSource:
        values.iconSource === "custom" && !customIconUrl
          ? "auto"
          : values.iconSource,
    }, confirmedDuplicateId);
    onOpenChange(false);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    submitValues(duplicateSite?.id);
  }

  let hasValidPreviewUrl = true;
  const previewUrl = (() => {
    try {
      return normalizeUrl(values.url);
    } catch {
      hasValidPreviewUrl = false;
      return "https://example.com";
    }
  })();
  const previewCustomIconUrl = (() => {
    try {
      return normalizeOptionalIconUrl(values.customIconUrl);
    } catch {
      return undefined;
    }
  })();

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay site-dialog-overlay" />
        <Dialog.Content
          className="dialog-content site-dialog-content"
          aria-labelledby={titleId}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            document.getElementById("site-url")?.focus();
          }}
        >
          <div className="dialog-header">
            <div>
              <Dialog.Title id={titleId} className="dialog-title">
                {editingSite ? "编辑网站" : "添加网站"}
              </Dialog.Title>
              <Dialog.Description className="dialog-description">
                保存后会自动读取网站图标，也可以填写自己的图标地址。
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button type="button" className="icon-button" aria-label="关闭">
                <X size={19} />
              </button>
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="site-form" noValidate>
            <div className="site-form-scroll">
              <div className="site-preview">
                <Favicon
                  size="large"
                  site={{
                    name: values.name || "新网站",
                    url: previewUrl,
                    customIconUrl: previewCustomIconUrl,
                    iconSource: values.iconSource,
                  }}
                />
                <div>
                  <strong>{values.name || "新网站"}</strong>
                  <span>{values.url || "example.com"}</span>
                </div>
              </div>

              <div className="field-group">
              <label htmlFor="site-url">网站地址</label>
              <div className="input-shell">
                <LinkSimple size={18} aria-hidden="true" />
                <input
                  id="site-url"
                  inputMode="url"
                  value={values.url}
                  onChange={(event) => updateUrl(event.target.value)}
                  placeholder="github.com"
                  aria-invalid={Boolean(errors.url)}
                  aria-describedby={errors.url ? "site-url-error" : "site-url-help"}
                />
              </div>
              <p id="site-url-help" className="field-help">
                可以省略 https://，填写后会自动生成网站名称
              </p>
              {errors.url && (
                <p id="site-url-error" className="field-error">
                  {errors.url}
                </p>
              )}
              {duplicateSite && !editingSite && (
                <div className="duplicate-site-notice" role="alert">
                  <strong>这个网站已经收藏在“{groups.find((group) => group.id === duplicateSite.groupId)?.name ?? "其他"}”</strong>
                  <span>
                    {duplicateSite.groupId === values.groupId
                      ? "确认后会更新现有收藏，并保留当前位置。"
                      : `确认后会移动到“${groups.find((group) => group.id === values.groupId)?.name ?? "当前分组"}”末尾，并更新名称和图标。`}
                  </span>
                  <button
                    type="button"
                    className="text-action"
                    onClick={() => setDuplicateSite(null)}
                  >
                    取消覆盖
                  </button>
                </div>
              )}
              </div>

              <div className="field-group">
              <label htmlFor="site-name">网站名称</label>
              <div className="input-shell">
                <Globe size={18} aria-hidden="true" />
                <input
                  id="site-name"
                  value={values.name}
                  onChange={(event) => update("name", event.target.value)}
                  placeholder="例如：GitHub"
                  aria-invalid={Boolean(errors.name)}
                  aria-describedby={errors.name ? "site-name-error" : undefined}
                />
              </div>
              {errors.name && (
                <p id="site-name-error" className="field-error">
                  {errors.name}
                </p>
              )}
              </div>

              {hasValidPreviewUrl && iconPickerUrl && (
                <section
                  className="icon-source-section"
                  aria-labelledby="icon-source-title"
                >
                  <div className="icon-source-heading">
                    <span id="icon-source-title">图标来源</span>
                    <small>选择你喜欢的版本</small>
                  </div>
                  <IconSourcePicker
                    key={iconPickerUrl}
                    site={{
                      name: values.name || editingSite?.name || "新网站",
                      url: iconPickerUrl,
                      customIconUrl: previewCustomIconUrl,
                    }}
                    value={values.iconSource}
                    onChange={(source) => update("iconSource", source)}
                  />
                </section>
              )}

              <fieldset className="field-group">
              <legend>分组</legend>
              <div className="category-choice-grid">
                {groups
                  .slice()
                  .sort((a, b) => a.order - b.order)
                  .map((group) => (
                  <label
                    key={group.id}
                    className={`category-choice ${
                      values.groupId === group.id ? "selected" : ""
                    }`}
                  >
                    <input
                      type="radio"
                      name="group"
                      value={group.id}
                      checked={values.groupId === group.id}
                      onChange={() => update("groupId", group.id)}
                    />
                    <CategoryIcon name={group.icon} size={17} />
                    <span>{group.name}</span>
                  </label>
                  ))}
              </div>
              {errors.groupId && <p className="field-error">{errors.groupId}</p>}
              </fieldset>

              <div className="field-group">
              <label htmlFor="site-icon">自定义图标地址（可选）</label>
              <div className="input-shell">
                <LinkSimple size={18} aria-hidden="true" />
                <input
                  id="site-icon"
                  inputMode="url"
                  value={values.customIconUrl}
                  onChange={(event) => updateCustomIconUrl(event.target.value)}
                  placeholder="https://example.com/icon.png"
                  aria-invalid={Boolean(errors.customIconUrl)}
                  aria-describedby={
                    errors.customIconUrl ? "site-icon-error" : "site-icon-help"
                  }
                />
              </div>
              <p id="site-icon-help" className="field-help">
                留空时自动读取网站 favicon
              </p>
              {errors.customIconUrl && (
                <p id="site-icon-error" className="field-error">
                  {errors.customIconUrl}
                </p>
              )}
              </div>

            </div>

            <div className="dialog-footer">
              <Dialog.Close asChild>
                <button type="button" className="button secondary-button">
                  取消
                </button>
              </Dialog.Close>
              <button type="submit" className="button primary-button">
                {editingSite
                  ? "保存修改"
                  : duplicateSite
                    ? duplicateSite.groupId === values.groupId
                      ? "更新现有收藏"
                      : "移动并更新"
                    : "添加网站"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
