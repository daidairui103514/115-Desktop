import { useCallback, useEffect, useMemo, useState } from "react";
import { TitleBar } from "@/components/TitleBar";
import { Sidebar } from "@/components/Sidebar";
import { Inspector } from "@/components/Inspector";
import { TransferBar } from "@/components/TransferBar";
import { FilesPage } from "@/pages/FilesPage";
import { LoginPage } from "@/pages/LoginPage";
import { WindowResizer } from "@/components/WindowResizer";
import { MOCK_FILES, MOCK_TRANSFERS } from "@/lib/mock";
import { call, isTauri, toFileItem } from "@/lib/bridge";
import type {
  AuthStatus,
  FileItem,
  FilePage,
  NavKey,
  SortDir,
  SortKey,
  ThemeMode,
  UserProfile,
  ViewMode,
} from "@/lib/types";
import "@/styles/tokens.css";
import "@/styles/app.css";

type Phase = "booting" | "guest" | "ready";

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

const ROOT = { cid: "0", name: "我的文件" };

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
  const desktop = isTauri();

  const [phase, setPhase] = useState<Phase>(desktop ? "booting" : "guest");
  const [user, setUser] = useState<UserProfile | null>(null);
  const [entries, setEntries] = useState<FileItem[]>([]);
  const [stack, setStack] = useState<{ cid: string; name: string }[]>([ROOT]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [nav, setNav] = useState<NavKey>("files");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");

  /* ---------- 主题 ---------- */
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    const apply = () => {
      const next = themeMode === "system" ? (media.matches ? "dark" : "light") : themeMode;
      setResolvedTheme(next);
      document.documentElement.dataset.theme = next;
    };

    apply();
    if (themeMode !== "system") return;

    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [themeMode]);

  /* ---------- 数据 ---------- */
  const loadDir = useCallback(async (cid: string) => {
    setLoading(true);
    setLoadError("");
    try {
      const page = await call<FilePage>("list_files", { cid, offset: 0, limit: 200 });
      setEntries(page.entries.map(toFileItem));
    } catch (err) {
      setLoadError(String(err));
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!desktop) return;

    let cancelled = false;
    void (async () => {
      try {
        const status = await call<AuthStatus>("auth_status");
        if (cancelled) return;
        if (status.logged_in) {
          setUser(status.user ?? null);
          setPhase("ready");
          void loadDir(ROOT.cid);
        } else {
          setPhase("guest");
        }
      } catch {
        if (!cancelled) setPhase("guest");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [desktop, loadDir]);

  const handleLoggedIn = useCallback(
    async (profile: UserProfile | null) => {
      setUser(profile);
      setPhase("ready");
      setStack([ROOT]);
      await loadDir(ROOT.cid);
    },
    [loadDir],
  );

  const handlePreview = useCallback(() => {
    setEntries(MOCK_FILES);
    setPhase("ready");
  }, []);

  const handleLogout = useCallback(async () => {
    if (!window.confirm("确定要退出当前账号吗？")) return;
    try {
      await call("logout");
    } catch {
      /* 忽略 */
    }
    setUser(null);
    setEntries([]);
    setSelectedId(null);
    setStack([ROOT]);
    setPhase("guest");
  }, []);

  const openFolder = useCallback(
    (item: FileItem) => {
      if (item.kind !== "folder" || !item.cid) return;
      const cid = item.cid;
      setStack((prev) => [...prev, { cid, name: item.name }]);
      setSelectedId(null);
      void loadDir(cid);
    },
    [loadDir],
  );

  const goToCrumb = useCallback(
    (index: number) => {
      const next = stack.slice(0, index + 1);
      if (next.length === 0) return;
      setStack(next);
      void loadDir(next[next.length - 1].cid);
    },
    [loadDir, stack],
  );

  /* ---------- 派生数据 ---------- */
  const visibleFiles = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const filtered = keyword
      ? entries.filter((file) => file.name.toLowerCase().includes(keyword))
      : entries;
    return sortFiles(filtered, sortKey, sortDir);
  }, [entries, query, sortKey, sortDir]);

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

  /* ---------- 渲染 ---------- */
  if (phase === "booting") {
    return (
      <div className="window">
        <WindowResizer />
        <div className="splash">
          <div className="splash__spinner" />
          <span>正在检查登录状态…</span>
        </div>
      </div>
    );
  }

  if (phase === "guest") {
    return (
      <>
        <WindowResizer />
        <LoginPage onLoggedIn={handleLoggedIn} onPreview={handlePreview} />
      </>
    );
  }

  return (
    <div className="window">
      <WindowResizer />
      <TitleBar
        title={NAV_TITLE[nav]}
        subtitle={stack.map((s) => s.name).join(" › ")}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        query={query}
        onQueryChange={setQuery}
        onUpload={() => console.info("upload")}
        theme={resolvedTheme}
        onToggleTheme={toggleTheme}
        user={user}
        onLogout={desktop ? handleLogout : undefined}
      />

      <div className="window__body">
        <Sidebar active={nav} onChange={setNav} user={user} />

        <FilesPage
          path={stack.map((s) => s.name)}
          files={visibleFiles}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onOpen={openFolder}
          onCrumb={goToCrumb}
          viewMode={viewMode}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
          loading={loading}
          error={loadError}
        />

        <Inspector file={selectedFile} />
      </div>

      <TransferBar tasks={MOCK_TRANSFERS} />
    </div>
  );
}
