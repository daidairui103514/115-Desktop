import { useCallback, useEffect, useMemo, useState } from "react";
import { TitleBar } from "@/components/TitleBar";
import { Sidebar } from "@/components/Sidebar";
import { Inspector } from "@/components/Inspector";
import { TransferBar } from "@/components/TransferBar";
import { FilesPage } from "@/pages/FilesPage";
import { LoginPage } from "@/pages/LoginPage";
import { OfflinePage } from "@/pages/OfflinePage";
import { WindowResizer } from "@/components/WindowResizer";
import { MOCK_FILES } from "@/lib/mock";
import { call, isTauri, toFileItem } from "@/lib/bridge";
import type {
  AuthStatus,
  FileItem,
  FilePage,
  NavKey,
  OfflineTask,
  SortDir,
  SortKey,
  ThemeMode,
  UserProfile,
  ViewMode,
} from "@/lib/types";
import "@/styles/tokens.css";
import "@/styles/app.css";

type Phase = "booting" | "guest" | "ready";
type DataMode = "files" | "recent" | "starred";

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

/** 能直接落到 /open/ufile/files 的分类 */
const NAV_MODE: Partial<Record<NavKey, DataMode>> = {
  files: "files",
  recent: "recent",
  starred: "starred",
};

/** 还没有接口或还没做的分类，给出明确说明，而不是点了没反应 */
const NAV_NOTICE: Partial<Record<NavKey, string>> = {
  shares: "115 开放平台没有开放分享接口，这个功能暂时做不了。\n需要生成分享链接的话，目前只能在网页版或官方客户端操作。",
  trash: "回收站接口尚未接入。",
  downloads: "下载管理还没做。\n下一步会接 /open/ufile/downurl 拿直链，再配本地下载器。",
  media: "海报墙媒体库还没做。\n这一块会复用文件列表里的视频条目，按 TMDb 元数据铺成网格。",
  toolbox: "工具箱还没做。\n计划里包括 ED2K 生成、STRM 导出、文件夹排重、空目录清理。",
};

const ROOT = { cid: "0", name: "我的文件" };

function compareFiles(a: FileItem, b: FileItem, key: SortKey): number {
  if (key === "name") return a.name.localeCompare(b.name, "zh-CN");
  if (key === "size") return a.size - b.size;
  return a.modified.localeCompare(b.modified);
}

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
  const [offline, setOffline] = useState<OfflineTask[]>([]);
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

  /* ---------- 数据加载 ---------- */
  const loadDir = useCallback(async (cid: string, mode: DataMode = "files") => {
    setLoading(true);
    setLoadError("");
    setEntries([]);
    try {
      const page = await call<FilePage>("list_files", {
        cid,
        offset: 0,
        limit: 115,
        mode,
      });
      setEntries(page.entries.map(toFileItem));
    } catch (err) {
      setLoadError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadOffline = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const tasks = await call<OfflineTask[]>("offline_tasks", { page: 1 });
      setOffline(tasks);
    } catch (err) {
      setLoadError(String(err));
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

  /* 侧边栏切换时真的换数据 */
  useEffect(() => {
    if (phase !== "ready") return;
    const mode = NAV_MODE[nav];
    if (mode === "files") {
      const current = stack[stack.length - 1];
      void loadDir(current.cid, "files");
    } else if (mode) {
      void loadDir("0", mode);
    } else if (nav === "offline") {
      void loadOffline();
    }
    setSelectedId(null);
    setQuery("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav]);

  const handleLoggedIn = useCallback(
    async (profile: UserProfile | null) => {
      setUser(profile);
      setPhase("ready");
      setStack([ROOT]);
      setNav("files");
      await loadDir(ROOT.cid);
    },
    [loadDir],
  );

  const handlePreview = useCallback(() => {
    setEntries(MOCK_FILES);
    setPhase("ready");
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await call("logout");
    } catch {
      /* 忽略 */
    }
    setUser(null);
    setEntries([]);
    setOffline([]);
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

  /* ---------- 派生 ---------- */
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
        onUpload={() => undefined}
        theme={resolvedTheme}
        onToggleTheme={toggleTheme}
        user={user}
        onLogout={desktop ? handleLogout : undefined}
      />

      <div className="window__body">
        <Sidebar active={nav} onChange={setNav} user={user} />

        {nav === "offline" ? (
          <OfflinePage tasks={offline} loading={loading} error={loadError} />
        ) : (
          <FilesPage
            path={nav === "files" ? stack.map((s) => s.name) : [NAV_TITLE[nav]]}
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
            notice={NAV_NOTICE[nav]}
          />
        )}

        <Inspector file={selectedFile} />
      </div>

      <TransferBar tasks={[]} />
    </div>
  );
}
