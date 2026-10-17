import { Fragment, useCallback, useEffect, useState } from "react";
import { Icon } from "./Icons";
import { call } from "@/lib/bridge";
import type { FilePage, RemoteFile } from "@/lib/types";

interface FolderPickerProps {
  title: string;
  confirmText?: string;
  hint?: string;
  /** 禁止选中的目录（例如源目录本身） */
  excludeCid?: string;
  busy?: boolean;
  onPick: (cid: string, path: string[]) => void;
  onCancel: () => void;
}

const ROOT = { cid: "0", name: "我的文件" };

/** 只列文件夹的懒加载目录树，用于选择移动/复制的目标位置 */
export function FolderPicker({
  title,
  confirmText = "确定",
  hint,
  excludeCid,
  busy,
  onPick,
  onCancel,
}: FolderPickerProps) {
  const [stack, setStack] = useState<{ cid: string; name: string }[]>([ROOT]);
  const [folders, setFolders] = useState<RemoteFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const current = stack[stack.length - 1];

  const load = useCallback(async (cid: string) => {
    setLoading(true);
    setError("");
    try {
      const page = await call<FilePage>("list_files", {
        cid,
        offset: 0,
        limit: 115,
        mode: "files",
      });
      setFolders(page.entries.filter((entry) => entry.is_dir));
    } catch (err) {
      setError(String(err));
      setFolders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(current.cid);
  }, [current.cid, load]);

  const disabled = excludeCid === current.cid;

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal modal--wide" onClick={(event) => event.stopPropagation()}>
        <h3 className="modal__title">{title}</h3>

        <div className="picker__bar">
          {stack.map((seg, index) => (
            <Fragment key={`${seg.cid}-${index}`}>
              {index > 0 ? <span className="pathbar__sep">›</span> : null}
              <button
                type="button"
                className={`pathbar__crumb${index === stack.length - 1 ? " pathbar__crumb--current" : ""}`}
                onClick={() => setStack((prev) => prev.slice(0, index + 1))}
                disabled={index === stack.length - 1}
              >
                {seg.name}
              </button>
            </Fragment>
          ))}
        </div>

        <div className="picker__list">
          {error ? (
            <div className="picker__empty">{error}</div>
          ) : loading ? (
            <div className="picker__empty">
              <div className="spinner" />
            </div>
          ) : folders.length === 0 ? (
            <div className="picker__empty">这个目录下没有子文件夹</div>
          ) : (
            folders.map((folder) => (
              <button
                key={folder.id}
                type="button"
                className="picker__row"
                onDoubleClick={() => setStack((prev) => [...prev, { cid: folder.cid, name: folder.name }])}
                onClick={() => setStack((prev) => [...prev, { cid: folder.cid, name: folder.name }])}
              >
                <Icon name="folder" size={15} style={{ color: "var(--accent)" }} />
                <span className="picker__name">{folder.name}</span>
                <Icon name="chevron-right" size={12} style={{ color: "var(--text-3)" }} />
              </button>
            ))
          )}
        </div>

        <p className="modal__hint">
          {disabled ? "不能选择当前正在浏览的目录作为目标" : hint ?? `目标：${stack.map((s) => s.name).join(" › ")}`}
        </p>

        <div className="modal__actions">
          <button type="button" className="modal__btn" onClick={onCancel} disabled={busy}>
            取消
          </button>
          <button
            type="button"
            className="modal__btn modal__btn--primary"
            disabled={busy || disabled}
            onClick={() => onPick(current.cid, stack.map((s) => s.name))}
          >
            {busy ? "处理中…" : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
