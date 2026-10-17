import { Fragment } from "react";
import { FileList } from "@/components/FileList";
import type { FileItem, SortDir, SortKey, ViewMode } from "@/lib/types";

interface FilesPageProps {
  path: string[];
  files: FileItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  viewMode: ViewMode;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
}

export function FilesPage({
  path,
  files,
  selectedId,
  onSelect,
  viewMode,
  sortKey,
  sortDir,
  onSort,
}: FilesPageProps) {
  return (
    <main className="content">
      <div className="pathbar">
        {path.map((segment, index) => (
          <Fragment key={segment}>
            {index > 0 ? <span className="pathbar__sep">›</span> : null}
            <span className={index === path.length - 1 ? "pathbar__current" : undefined}>
              {segment}
            </span>
          </Fragment>
        ))}
        <span className="pathbar__count">{files.length} 项</span>
      </div>

      <FileList
        files={files}
        selectedId={selectedId}
        onSelect={onSelect}
        viewMode={viewMode}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={onSort}
      />
    </main>
  );
}
