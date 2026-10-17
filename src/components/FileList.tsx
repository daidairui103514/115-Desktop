import { Icon } from "./Icons";
import { iconForKind } from "@/lib/fileView";
import { KIND_LABEL, type FileItem, type SortDir, type SortKey, type ViewMode } from "@/lib/types";

interface FileListProps {
  files: FileItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onOpen: (item: FileItem) => void;
  viewMode: ViewMode;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
}

function SortArrow({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return null;
  return (
    <Icon
      name="sort"
      size={9}
      style={{ transform: dir === "asc" ? "rotate(180deg)" : undefined, opacity: 0.6 }}
    />
  );
}

export function FileList({
  files,
  selectedId,
  onSelect,
  onOpen,
  viewMode,
  sortKey,
  sortDir,
  onSort,
}: FileListProps) {
  if (files.length === 0) {
    return <div className="empty">这个目录里没有匹配的文件</div>;
  }

  if (viewMode === "grid") {
    return (
      <div className="grid" role="listbox" aria-label="文件网格">
        {files.map((file) => (
          <button
            key={file.id}
            type="button"
            role="option"
            aria-selected={selectedId === file.id}
            className={`grid-card${selectedId === file.id ? " grid-card--active" : ""}`}
            onClick={() => onSelect(file.id)}
            onDoubleClick={() => onOpen(file)}
          >
            <span className="grid-card__shot">
              {file.thumb ? (
                <img src={file.thumb} alt="" loading="lazy" />
              ) : (
                <Icon name={iconForKind(file.kind)} size={34} />
              )}
            </span>
            <span className="grid-card__name">{file.name}</span>
            <span className="grid-card__meta">
              {file.sizeText}
              {file.itemCount ? ` · ${file.itemCount} 项` : ""}
            </span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="table-head">
        <button
          type="button"
          className="table-head__cell table-head__cell--name"
          onClick={() => onSort("name")}
        >
          名称 <SortArrow active={sortKey === "name"} dir={sortDir} />
        </button>
        <button
          type="button"
          className="table-head__cell table-head__cell--size"
          onClick={() => onSort("size")}
        >
          大小 <SortArrow active={sortKey === "size"} dir={sortDir} />
        </button>
        <div className="table-head__cell table-head__cell--kind">类型</div>
        <button
          type="button"
          className="table-head__cell table-head__cell--date"
          onClick={() => onSort("modified")}
        >
          修改日期 <SortArrow active={sortKey === "modified"} dir={sortDir} />
        </button>
      </div>

      <div className="filelist" role="listbox" aria-label="文件列表">
        {files.map((file) => (
          <div
            key={file.id}
            role="option"
            tabIndex={0}
            aria-selected={selectedId === file.id}
            className={`row${selectedId === file.id ? " row--active" : ""}`}
            onClick={() => onSelect(file.id)}
            onDoubleClick={() => onOpen(file)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onOpen(file);
              } else if (event.key === " ") {
                event.preventDefault();
                onSelect(file.id);
              }
            }}
          >
            <div className="row__name">
              {file.thumb ? (
                <img className="row__thumb" src={file.thumb} alt="" loading="lazy" />
              ) : (
                <span
                  className="row__icon"
                  style={{ color: file.kind === "folder" ? "var(--accent)" : undefined }}
                >
                  <Icon name={iconForKind(file.kind)} />
                </span>
              )}
              <span className="row__text">{file.name}</span>
              {file.starred ? (
                <span className="row__star">
                  <Icon name="star" size={11} />
                </span>
              ) : null}
            </div>
            <div className="row__size">{file.sizeText}</div>
            <div className="row__kind">{KIND_LABEL[file.kind]}</div>
            <div className="row__date">{file.modifiedText}</div>
          </div>
        ))}
      </div>
    </>
  );
}
