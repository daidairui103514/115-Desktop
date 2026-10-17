import { useEffect, useMemo, useState } from "react";
import { TitleBar } from "@/components/TitleBar";
import { Sidebar } from "@/components/Sidebar";
import { Inspector } from "@/components/Inspector";
import { TransferBar } from "@/components/TransferBar";
import { FilesPage } from "@/pages/FilesPage";
import { CURRENT_PATH, MOCK_FILES, MOCK_TRANSFERS } from "@/lib/mock";
import type { FileItem, NavKey, SortDir, SortKey, ThemeMode, ViewMode } from "@/lib/types";
import "@/styles/tokens.css";
import "@/styles/app.css";

const NAV_TITLE: Record<NavKey, string> = {
  files: "我的文件",
  recent: "最近使用",
  starred: "星标",
  downloads: "下载",
  shares: "分享",
  offline: "离线下载",
  trash: "回收站",
  media: "媒体库",
  toolbox: "工具箱",
};

function compareFiles(a: FileItem, b: FileItem, key: SortKey): number {
  if (key === "name") return a.name.localeCompare(b.name, "zh-CN");
  if (key === "size") return a.size - b.size;
  return a.modified.localeCompare(b.modified);
}

/** 文件夹恒定排在文件前面，升降序只作用于组内 */
function sortFiles(files: FileItem[], key: SortKey, dir: SortDir): FileItem[] {
  return [...files].sort((a, b) => {
    const aFolder = a.kind === "folder";
    const bFolder = b.kind === "folder";
    if (aFolder !== bFolder) return aFolder ? -1 : 1;
    const base = compareFiles(a, b, key);
    return dir === "asc" ? base : -base;
  });
}

export default function App() {
  const [nav, setNav] = useState<NavKey>("files");
  const [selectedId, setSelectedId] = useState<string | null>("f-01");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    const apply = () => {
      const next =
        themeMode === "system" ? (media.matches ? "dark" : "light") : themeMode;
      setResolvedTheme(next);
      document.documentElement.dataset.theme = next;
    };

    apply();
    if (themeMode !== "system") return;

    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [themeMode]);

  const visibleFiles = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const filtered = keyword
      ? MOCK_FILES.filter((file) => file.name.toLowerCase().includes(keyword))
      : MOCK_FILES;

    return sortFiles(filtered, sortKey, sortDir);
  }, [query, sortKey, sortDir]);

  const selectedFile = useMemo(
    () => visibleFiles.find((file) => file.id === selectedId) ?? null,
    [visibleFiles, selectedId],
  );

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir("asc");
  };

  const toggleTheme = () => {
    setThemeMode((mode) => {
      if (mode === "system") return resolvedTheme === "dark" ? "light" : "dark";
      return mode === "dark" ? "light" : "dark";
    });
  };

  return (
    <div className="window">
      <TitleBar
        title={NAV_TITLE[nav]}
        subtitle={CURRENT_PATH.join(" › ")}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        query={query}
        onQueryChange={setQuery}
        onUpload={() => console.info("upload")}
        theme={resolvedTheme}
        onToggleTheme={toggleTheme}
      />

      <div className="window__body">
        <Sidebar active={nav} onChange={setNav} />

        <FilesPage
          path={CURRENT_PATH}
          files={visibleFiles}
          selectedId={selectedId}
          onSelect={setSelectedId}
          viewMode={viewMode}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
        />

        <Inspector file={selectedFile} />
      </div>

      <TransferBar tasks={MOCK_TRANSFERS} />
    </div>
  );
}
