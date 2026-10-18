import { Icon } from "./Icons";
import { iconForKind } from "@/lib/fileView";
import { KIND_LABEL, type FileItem, type SortDir, type SortKey, type ViewMode } from "@/lib/types";

interface FileListProps {
  files: FileItem[];
  selectedIds: string[];
  onSelect: (id: string, additive: boolean) => void;
  onOpen: (item: FileItem) => void;
  onPlay: (item: FileItem) => void;
  onContextMenu: (x: number, y: number, item: FileItem) => void;
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
  selectedIds,
  onSelect,
  onOpen,
  onPlay,
  onContextMenu,
  viewMode,
  sortKey,
  sortDir,
  onSort,
}: FileListProps) {
  if (files.length === 0) {
    return <div className="empty">这个目录是空的</div>;
  }

  if (viewMode === "grid") {
    return (
      <div className="grid" role="listbox" aria-label="文件网格" aria-multiselectable="true">
        {files.map((file) => {
          const active = selectedIds.includes(file.id);
          return (
            <button
              key={file.id}
              type="button"
              role="option"
              aria-selected={active}
              className={`grid-card${active ? " grid-card--active" : ""}`}
              onClick={(event) => onSelect(file.id, event.ctrlKey || event.metaKey)}
              onDoubleClick={() => (file.kind === "folder" ? onOpen(file) : onPlay(file))}
              onContextMenu={(event) => {
                event.preventDefault();
                onSelect(file.id, false);
                onContextMenu(event.clientX, event.clientY, file);
              }}
            >
              <span className="grid-card__shot">
                {file.thumb ? (
                  <img src={file.thumb} alt="" loading="lazy" />
                ) : (
                  <Icon name={iconForKind(file.kind)} size={34} />
                )}
              </span>
              <span className="grid-card__name">{file.name}</span>
              <span className="grid-card__meta">{file.sizeText}</span>
            </button>
          );
        })}
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

      <div className="filelist" role="listbox" aria-label="文件列表" aria-multiselectable="true">
        {files.map((file) => {
          const active = selectedIds.includes(file.id);
          return (
            <div
              key={file.id}
              role="option"
              tabIndex={0}
              aria-selected={active}
              className={`row${active ? " row--active" : ""}`}
              onClick={(event) => onSelect(file.id, event.ctrlKey || event.metaKey)}
              onDoubleClick={() => (file.kind === "folder" ? onOpen(file) : onPlay(file))}
              onContextMenu={(event) => {
                event.preventDefault();
                onSelect(file.id, false);
                onContextMenu(event.clientX, event.clientY, file);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (file.kind === "folder") onOpen(file);
                  else onPlay(file);
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
          );
        })}
      </div>
    </>
  );
}
