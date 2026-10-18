import { Icon } from "./Icons";
import { iconForKind } from "@/lib/fileView";
import { KIND_LABEL, type FileItem } from "@/lib/types";

interface InspectorProps {
  file: FileItem | null;
  onPlay: (item: FileItem) => void;
  onDownload: (item: FileItem) => void;
  onRename: (item: FileItem) => void;
  onDelete: (item: FileItem) => void;
  onOpen: (item: FileItem) => void;
}

export function Inspector({
  file,
  onPlay,
  onDownload,
  onRename,
  onDelete,
  onOpen,
}: InspectorProps) {
  if (!file) {
    return (
      <aside className="inspector">
        <div className="inspector__placeholder">未选择文件</div>
      </aside>
    );
  }

  const isFolder = file.kind === "folder";
  const playable = file.kind === "video" || file.kind === "iso";
  const hasLink = Boolean(file.pickCode);

  return (
    <aside className="inspector">
      {file.thumb ? (
        <img className="inspector__preview" src={file.thumb} alt="" />
      ) : (
        <div className="inspector__placeholder">
          <Icon name={iconForKind(file.kind)} size={46} />
        </div>
      )}

      <div className="inspector__name">{file.name}</div>
      <div className="inspector__sub">
        {KIND_LABEL[file.kind]}
        {isFolder ? "" : ` · ${file.sizeText}`}
      </div>

      <div className="inspector__actions">
        {isFolder ? (
          <button type="button" className="is-primary" onClick={() => onOpen(file)}>
            打开
          </button>
        ) : playable ? (
          <button
            type="button"
            className="is-primary"
            onClick={() => onPlay(file)}
            disabled={!hasLink}
          >
            <Icon name="play" size={11} /> 播放
          </button>
        ) : (
          <button
            type="button"
            className="is-primary"
            onClick={() => onDownload(file)}
            disabled={!hasLink}
          >
            <Icon name="download" size={12} /> 取直链
          </button>
        )}

        {!isFolder ? (
          <button type="button" onClick={() => onDownload(file)} disabled={!hasLink}>
            复制链接
          </button>
        ) : null}
        <button type="button" onClick={() => onRename(file)}>
          重命名
        </button>
        <button type="button" className="is-danger" onClick={() => onDelete(file)}>
          删除
        </button>
      </div>

      <div className="inspector__section">
        <h4>信息</h4>
        {file.resolution ? (
          <div className="kv">
            <span className="kv__k">分辨率</span>
            <span className="kv__v">{file.resolution}</span>
          </div>
        ) : null}
        {file.duration ? (
          <div className="kv">
            <span className="kv__k">时长</span>
            <span className="kv__v">{file.duration}</span>
          </div>
        ) : null}
        {file.sizeText ? (
          <div className="kv">
            <span className="kv__k">大小</span>
            <span className="kv__v">{file.sizeText}</span>
          </div>
        ) : null}
        {file.sha1 ? (
          <div className="kv">
            <span className="kv__k">SHA1</span>
            <span className="kv__v kv__v--mono">{file.sha1.slice(0, 12)}…</span>
          </div>
        ) : null}
        {file.pickCode ? (
          <div className="kv">
            <span className="kv__k">pick_code</span>
            <span className="kv__v kv__v--mono">{file.pickCode.slice(0, 12)}…</span>
          </div>
        ) : null}
        <div className="kv">
          <span className="kv__k">修改时间</span>
          <span className="kv__v">{file.modified.replace("T", " ").slice(0, 16) || "—"}</span>
        </div>
        {file.starred ? (
          <div className="tag-row">
            <span className="tag">已星标</span>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
