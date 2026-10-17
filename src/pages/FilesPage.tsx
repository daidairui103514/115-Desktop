import { Fragment } from "react";
import { FileList } from "@/components/FileList";
import type { FileItem, SortDir, SortKey, ViewMode } from "@/lib/types";

interface FilesPageProps {
  path: string[];
  files: FileItem[];
  selectedIds: string[];
  onSelect: (id: string, additive: boolean) => void;
  onOpen: (item: FileItem) => void;
  onContextMenu: (x: number, y: number, item: FileItem) => void;
  onCrumb: (index: number) => void;
  viewMode: ViewMode;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  loading?: boolean;
  error?: string;
  /** 该分类还没有实现时的说明，优先生效 */
  notice?: string;
}

export function FilesPage({
  path,
  files,
  selectedIds,
  onSelect,
  onOpen,
  onContextMenu,
  onCrumb,
  viewMode,
  sortKey,
  sortDir,
  onSort,
  loading,
  error,
  notice,
}: FilesPageProps) {
  return (
    <main className="content">
      <div className="pathbar">
        {path.map((segment, index) => {
          const current = index === path.length - 1;
          return (
            <Fragment key={`${segment}-${index}`}>
              {index > 0 ? <span className="pathbar__sep">›</span> : null}
              <button
                type="button"
                className={`pathbar__crumb${current ? " pathbar__crumb--current" : ""}`}
                onClick={() => {
                  if (!current) onCrumb(index);
                }}
                disabled={current}
              >
                {segment}
              </button>
            </Fragment>
          );
        })}
        <span className="pathbar__count">{loading ? "加载中…" : `${files.length} 项`}</span>
      </div>

      {notice ? (
        <div className="empty">
          <p className="notice-text">{notice}</p>
        </div>
      ) : error ? (
        <div className="empty">
          <span>加载失败：{error}</span>
        </div>
      ) : loading ? (
        <div className="empty">
          <div className="spinner" />
          <span>正在读取目录…</span>
        </div>
      ) : (
        <FileList
          files={files}
          selectedIds={selectedIds}
          onSelect={onSelect}
          onOpen={onOpen}
          onContextMenu={onContextMenu}
          viewMode={viewMode}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={onSort}
        />
      )}
    </main>
  );
}
