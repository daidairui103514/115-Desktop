import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TitleBar } from "@/components/TitleBar";
import { Sidebar } from "@/components/Sidebar";
import { Inspector } from "@/components/Inspector";
import { TransferBar } from "@/components/TransferBar";
import { ContextMenu, type MenuAction } from "@/components/ContextMenu";
import { ConfirmDialog, PromptDialog } from "@/components/Dialogs";
import { FolderPicker } from "@/components/FolderPicker";
import { BatchRename } from "@/components/BatchRename";
import { FilesPage } from "@/pages/FilesPage";
import { LoginPage } from "@/pages/LoginPage";
import { OfflinePage } from "@/pages/OfflinePage";
import { RecyclePage } from "@/pages/RecyclePage";
import { ToolboxPage } from "@/pages/ToolboxPage";
import { MediaPage } from "@/pages/MediaPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { DownloadsPage } from "@/pages/DownloadsPage";
import { WindowResizer } from "@/components/WindowResizer";
import { PreviewModal, type PreviewKind } from "@/components/PreviewModal";
import { MOCK_FILES } from "@/lib/mock";
import { call, isTauri, previewKind, toFileItem } from "@/lib/bridge";
import type {
  AuthStatus,
  FileItem,
  FilePage,
  NavKey,
  OfflineTask,
  OpResult,
  RecycleItem,
  TransferItem,
  UploadResult,
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
  settings: "设置",
};

const NAV_MODE: Partial<Record<NavKey, DataMode>> = {
  files: "files",
  recent: "recent",
  starred: "starred",
};

const NAV_NOTICE: Partial<Record<NavKey, string>> = {
  shares: "115 开放平台没有开放分享接口，这个功能暂时做不了。\n需要生成分享链接只能在网页版或官方客户端操作。",
};

const ROOT = { cid: "0", name: "我的文件" };

/** 这些扩展名优先尝试 115 的 HLS 转码流 */
const VIDEO_EXTS = [
  "mp4", "mkv", "avi", "mov", "wmv", "flv", "ts", "m2ts", "mts",
  "rmvb", "rm", "m4v", "webm", "iso", "3gp", "vob", "asf",
];

type DialogState =
  | { type: "rename"; item: FileItem }
  | { type: "mkdir" }
  | { type: "delete"; items: FileItem[] }
  | { type: "move"; items: FileItem[] }
  | { type: "copy"; items: FileItem[] }
  | { type: "batchRename"; items: FileItem[] }
  | null;

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
  const [recycle, setRecycle] = useState<RecycleItem[]>([]);
  const [recycleBusy, setRecycleBusy] = useState(false);
  const [transfers, setTransfers] = useState<TransferItem[]>([]);
  const [offlineBusy, setOfflineBusy] = useState(false);
  const [preview, setPreview] = useState<{
    item: FileItem;
    url: string;
    hlsUrl?: string;
    kind: PreviewKind;
  } | null>(null);
  const [stack, setStack] = useState<{ cid: string; name: string }[]>([ROOT]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [nav, setNav] = useState<NavKey>("files");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");

  const [menu, setMenu] = useState<{ x: number; y: number; item: FileItem } | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const toastTimer = useRef(0);

  const currentCid = stack[stack.length - 1]?.cid ?? "0";

  const notify = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 2600);
  }, []);

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
  useEffect(() => {
    if (!desktop) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        const stop = await listen<TransferItem>("download:progress", (event) => {
          const payload = event.payload;
          setTransfers((prev) => {
            const index = prev.findIndex((task) => task.id === payload.id);
            if (index === -1) return [payload, ...prev];
            const next = [...prev];
            next[index] = payload;
            return next;
          });
        });
        if (cancelled) stop();
        else unlisten = stop;
      } catch {
        /* 浏览器预览没有事件系统 */
      }
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [desktop]);

  const loadDir = useCallback(async (cid: string, mode: DataMode = "files") => {
    setLoading(true);
    setLoadError("");
    setEntries([]);
    try {
      const page = await call<FilePage>("list_files", { cid, offset: 0, limit: 115, mode });
      setEntries(page.entries.map(toFileItem));
    } catch (err) {
      setLoadError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(() => loadDir(currentCid), [loadDir, currentCid]);

  const loadOffline = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      setOffline(await call<OfflineTask[]>("offline_tasks", { page: 1 }));
    } catch (err) {
      setLoadError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const addOffline = useCallback(
    async (urls: string) => {
      setOfflineBusy(true);
      try {
        await call("offline_add", { urls });
        await loadOffline();
        notify("已提交离线任务");
      } catch (err) {
        notify(String(err));
      } finally {
        setOfflineBusy(false);
      }
    },
    [loadOffline, notify],
  );

  const deleteOffline = useCallback(
    async (hash: string) => {
      setOfflineBusy(true);
      try {
        await call("offline_delete", { hash });
        await loadOffline();
        notify("已移除任务");
      } catch (err) {
        notify(String(err));
      } finally {
        setOfflineBusy(false);
      }
    },
    [loadOffline, notify],
  );

  const loadRecycle = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      setRecycle(await call<RecycleItem[]>("recycle_list"));
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

  useEffect(() => {
    if (phase !== "ready") return;
    const mode = NAV_MODE[nav];
    if (mode === "files") {
      void loadDir(currentCid, "files");
    } else if (mode) {
      void loadDir("0", mode);
    } else if (nav === "offline") {
      void loadOffline();
    } else if (nav === "trash") {
      void loadRecycle();
    }
    setSelectedIds([]);
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

  const handleUpload = useCallback(async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ multiple: false, directory: false });
      if (!selected || typeof selected !== "string") return;
      notify("正在上传，文件较大时需要等待…");
      const result = await call<UploadResult>("upload_file", {
        path: selected,
        cid: currentCid,
      });
      await refresh();
      notify(
        result.instant
          ? `${result.file_name} 命中秒传，已入库`
          : `${result.file_name}（${result.size_text}）上传完成`,
      );
    } catch (err) {
      notify(String(err));
    }
  }, [currentCid, notify, refresh]);

  const handleLogout = useCallback(async () => {
    try {
      await call("logout");
    } catch {
      /* 忽略 */
    }
    setUser(null);
    setEntries([]);
    setOffline([]);
    setSelectedIds([]);
    setStack([ROOT]);
    setPhase("guest");
  }, []);

  /* ---------- 选择 ---------- */
  const handleSelect = useCallback((id: string, additive: boolean) => {
    setSelectedIds((prev) => {
      if (!additive) return [id];
      return prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
    });
  }, []);

  const openFolder = useCallback(
    (item: FileItem) => {
      if (item.kind !== "folder" || !item.cid) return;
      const cid = item.cid;
      setStack((prev) => [...prev, { cid, name: item.name }]);
      setSelectedIds([]);
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

  /* ---------- 操作 ---------- */
  const selectedItems = useMemo(
    () => entries.filter((entry) => selectedIds.includes(entry.id)),
    [entries, selectedIds],
  );

  const copyDownloadUrl = useCallback(
    async (item: FileItem) => {
      if (!item.pickCode) {
        notify("这个条目没有 pick_code");
        return;
      }
      try {
        const url = await call<string>("download_url", { pc: item.pickCode });
        await navigator.clipboard.writeText(url);
        notify("下载直链已复制到剪贴板");
      } catch (err) {
        notify(String(err));
      }
    },
    [notify],
  );

  const downloadItem = useCallback(
    async (item: FileItem) => {
      if (!item.pickCode) {
        notify("这个条目没有 pick_code");
        return;
      }
      try {
        const { open } = await import("@tauri-apps/plugin-dialog");
        const dir = await open({ directory: true, title: "选择保存位置" });
        if (!dir || typeof dir !== "string") return;
        notify(`开始下载：${item.name}`);
        const saved = await call<string>("download_file", {
          pc: item.pickCode,
          name: item.name,
          saveDir: dir,
        });
        notify(`已保存到 ${saved}`);
      } catch (err) {
        notify(String(err));
      }
    },
    [notify],
  );

  const playItem = useCallback(
    async (item: FileItem) => {
      if (!item.pickCode) {
        notify("这个条目没有 pick_code");
        return;
      }
      try {
        const base = await call<string>("stream_base");
        if (!base) {
          notify("本地代理还没启动，请重启程序");
          return;
        }
        const ext = (item.name.split(".").pop() ?? "").toLowerCase();
        const directUrl = `${base}/s/${item.pickCode}.${ext}`;

        // 视频优先走 115 的 HLS：云端已转码，mkv/avi/iso 都能播
        if (VIDEO_EXTS.includes(ext)) {
          let hlsError = "";
          try {
            const m3u8 = await call<string>("video_play_url", { pc: item.pickCode });
            setPreview({
              item,
              url: directUrl,
              hlsUrl: `${base}/hls?u=${encodeURIComponent(m3u8)}`,
              kind: "video",
            });
            return;
          } catch (err) {
            hlsError = String(err);
          }

          // mp4/webm 这类浏览器原生能解的，回退到直链
          if (previewKind(ext) === "video") {
            setPreview({ item, url: directUrl, kind: "video" });
            return;
          }

          // 其余格式浏览器解不了，不要静默打开浏览器（会变成下载几十 GB）
          notify(
            `${ext.toUpperCase()} 需要 115 云端转码后才能在线播放。\n${hlsError}\n可以右键「用 IDM 下载」到本地观看。`,
          );
          return;
        }

        const kind = previewKind(ext);
        if (kind === "other") {
          const { openUrl } = await import("@tauri-apps/plugin-opener");
          await openUrl(directUrl);
          notify("这个格式没法内嵌预览，已交给系统程序");
          return;
        }
        setPreview({ item, url: directUrl, kind });
      } catch (err) {
        notify(String(err));
      }
    },
    [notify],
  );

  const downloadWithIdm = useCallback(
    async (item: FileItem) => {
      if (!item.pickCode) return;
      try {
        await call("download_with_idm", { pc: item.pickCode, name: item.name });
        notify("已推送到 IDM，多线程下载中");
      } catch (err) {
        notify(String(err));
      }
    },
    [notify],
  );

  const openExternal = useCallback(async () => {
    if (!preview) return;
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(preview.url);
    } catch (err) {
      notify(String(err));
    }
  }, [preview, notify]);

  const submitRename = useCallback(
    async (name: string) => {
      if (dialog?.type !== "rename") return;
      setBusy(true);
      try {
        await call("rename_file", { fid: dialog.item.id, name });
        setDialog(null);
        await refresh();
        notify("已重命名");
      } catch (err) {
        notify(String(err));
      } finally {
        setBusy(false);
      }
    },
    [dialog, notify, refresh],
  );

  const submitMkdir = useCallback(
    async (name: string) => {
      setBusy(true);
      try {
        await call("create_folder", { pid: currentCid, name });
        setDialog(null);
        await refresh();
        notify("文件夹已创建");
      } catch (err) {
        notify(String(err));
      } finally {
        setBusy(false);
      }
    },
    [currentCid, notify, refresh],
  );

  const submitDelete = useCallback(async () => {
    if (dialog?.type !== "delete") return;
    setBusy(true);
    try {
      const result = await call<OpResult>("delete_files", {
        fids: dialog.items.map((item) => item.id),
      });
      setDialog(null);
      setSelectedIds([]);
      await refresh();
      notify(result.fail > 0 ? `成功 ${result.ok} 项，失败 ${result.fail} 项：${result.message}` : `已删除 ${result.ok} 项`);
    } catch (err) {
      notify(String(err));
    } finally {
      setBusy(false);
    }
  }, [dialog, notify, refresh]);

  const submitBatchRename = useCallback(
    async (pairs: { id: string; name: string }[]) => {
      setBusy(true);
      let ok = 0;
      let fail = 0;
      for (const pair of pairs) {
        try {
          await call("rename_file", { fid: pair.id, name: pair.name });
          ok += 1;
        } catch {
          fail += 1;
        }
      }
      setBusy(false);
      setDialog(null);
      setSelectedIds([]);
      await refresh();
      notify(fail > 0 ? `改名完成 ${ok} 项，失败 ${fail} 项` : `已改名 ${ok} 项`);
    },
    [notify, refresh],
  );

  const submitMoveOrCopy = useCallback(
    async (targetCid: string) => {
      if (dialog?.type !== "move" && dialog?.type !== "copy") return;
      setBusy(true);
      try {
        const fids = dialog.items.map((item) => item.id);
        const command = dialog.type === "move" ? "move_files" : "copy_files";
        const result = await call<OpResult>(command, { fids, toCid: targetCid });
        setDialog(null);
        setSelectedIds([]);
        if (dialog.type === "move") await refresh();
        notify(
          result.fail > 0
            ? `${dialog.type === "move" ? "移动" : "复制"}完成 ${result.ok} 项，失败 ${result.fail} 项：${result.message}`
            : `已${dialog.type === "move" ? "移动" : "复制"} ${result.ok} 项`,
        );
      } catch (err) {
        notify(String(err));
      } finally {
        setBusy(false);
      }
    },
    [dialog, notify, refresh],
  );

  const restoreItem = useCallback(
    async (item: RecycleItem) => {
      setRecycleBusy(true);
      try {
        await call("recycle_revert", { tid: item.id });
        await loadRecycle();
        notify("已还原");
      } catch (err) {
        notify(String(err));
      } finally {
        setRecycleBusy(false);
      }
    },
    [loadRecycle, notify],
  );

  const clearRecycle = useCallback(async () => {
    if (!window.confirm("确定清空回收站？清空后无法恢复。")) return;
    setRecycleBusy(true);
    try {
      await call("recycle_clear");
      await loadRecycle();
      notify("回收站已清空");
    } catch (err) {
      notify(String(err));
    } finally {
      setRecycleBusy(false);
    }
  }, [loadRecycle, notify]);

  const menuItems = useMemo<MenuAction[]>(() => {
    if (!menu) return [];
    const item = menu.item;
    const actions: MenuAction[] = [];

    if (item.kind === "folder") {
      actions.push({ label: "打开", onClick: () => openFolder(item) });
    }
    if (["video", "iso", "audio", "image"].includes(item.kind)) {
      actions.push({
        label: item.kind === "image" ? "预览" : "播放",
        onClick: () => void playItem(item),
      });
    }
    if (item.pickCode) {
      actions.push({ label: "用 IDM 下载", onClick: () => void downloadWithIdm(item) });
      actions.push({ label: "内置下载", onClick: () => void downloadItem(item) });
      actions.push({ label: "复制下载直链", onClick: () => void copyDownloadUrl(item) });
    }
    const targets = selectedItems.length > 0 ? selectedItems : [item];
    actions.push({
      label: "移动到…",
      onClick: () => setDialog({ type: "move", items: targets }),
    });
    actions.push({
      label: "复制到…",
      onClick: () => setDialog({ type: "copy", items: targets }),
    });
    if (targets.length > 1) {
      actions.push({
        label: `批量重命名（${targets.length} 项）`,
        onClick: () => setDialog({ type: "batchRename", items: targets }),
      });
    }
    actions.push({
      label: "重命名",
      onClick: () => setDialog({ type: "rename", item }),
    });
    actions.push({
      label: "删除",
      danger: true,
      onClick: () => setDialog({ type: "delete", items: [item] }),
    });
    return actions;
  }, [menu, openFolder, playItem, downloadItem, downloadWithIdm, copyDownloadUrl, selectedItems]);

  const selectedFile = selectedItems.length === 1 ? selectedItems[0] : null;

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir("asc");
  };

  const visibleFiles = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const filtered = keyword
      ? entries.filter((file) => file.name.toLowerCase().includes(keyword))
      : entries;
    return sortFiles(filtered, sortKey, sortDir);
  }, [entries, query, sortKey, sortDir]);

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
        onNewFolder={() => setDialog({ type: "mkdir" })}
        onBack={() => goToCrumb(stack.length - 2)}
        canGoBack={stack.length > 1}
        onUpload={() => void handleUpload()}
        theme={resolvedTheme}
        onToggleTheme={toggleTheme}
        user={user}
        onLogout={desktop ? handleLogout : undefined}
      />

      <div className="window__body">
        <Sidebar active={nav} onChange={setNav} user={user} />

        {nav === "offline" ? (
          <OfflinePage
            tasks={offline}
            loading={loading}
            error={loadError}
            busy={offlineBusy}
            onAdd={(urls) => void addOffline(urls)}
            onDelete={(hash) => void deleteOffline(hash)}
          />
        ) : nav === "media" ? (
          <MediaPage onPlay={(item) => void playItem(item)} />
        ) : nav === "downloads" ? (
          <DownloadsPage
            tasks={transfers}
            onOpenDir={() => void call("open_download_dir").catch(() => undefined)}
            onClear={() => setTransfers((prev) => prev.filter((task) => !task.done && !task.error))}
          />
        ) : nav === "settings" ? (
          <SettingsPage onNotify={notify} />
        ) : nav === "toolbox" ? (
          <ToolboxPage rootCid={currentCid} onNotify={notify} />
        ) : nav === "trash" ? (
          <RecyclePage
            items={recycle}
            loading={loading}
            error={loadError}
            busy={recycleBusy}
            onRestore={(item) => void restoreItem(item)}
            onClear={() => void clearRecycle()}
          />
        ) : (
          <FilesPage
            path={nav === "files" ? stack.map((s) => s.name) : [NAV_TITLE[nav]]}
            files={visibleFiles}
            selectedIds={selectedIds}
            onSelect={handleSelect}
            onOpen={openFolder}
            onPlay={(item) => void playItem(item)}
            onContextMenu={(x, y, item) => setMenu({ x, y, item })}
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

        <Inspector
          file={selectedFile}
          onPlay={(item) => void playItem(item)}
          onDownload={(item) => void downloadItem(item)}
          onRename={(item) => setDialog({ type: "rename", item })}
          onDelete={(item) => setDialog({ type: "delete", items: [item] })}
          onOpen={openFolder}
        />
      </div>

      <TransferBar
        tasks={transfers}
        onOpenDir={desktop ? () => void call("open_download_dir").catch(() => undefined) : undefined}
      />

      {menu ? (
        <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />
      ) : null}

      {dialog?.type === "rename" ? (
        <PromptDialog
          title="重命名"
          label="文件名（可以直接改后缀）"
          initialValue={dialog.item.name}
          confirmText="重命名"
          busy={busy}
          onConfirm={(value) => void submitRename(value)}
          onCancel={() => setDialog(null)}
        />
      ) : null}

      {dialog?.type === "mkdir" ? (
        <PromptDialog
          title="新建文件夹"
          label="文件夹名称"
          initialValue="新建文件夹"
          confirmText="创建"
          busy={busy}
          onConfirm={(value) => void submitMkdir(value)}
          onCancel={() => setDialog(null)}
        />
      ) : null}

      {dialog?.type === "delete" ? (
        <ConfirmDialog
          title="删除文件"
          message={`确定删除 ${dialog.items.length} 项吗？删除后可在网页版回收站找回。`}
          confirmText="删除"
          danger
          busy={busy}
          onConfirm={() => void submitDelete()}
          onCancel={() => setDialog(null)}
        />
      ) : null}

      {dialog?.type === "move" || dialog?.type === "copy" ? (
        <FolderPicker
          title={dialog.type === "move" ? "移动到" : "复制到"}
          confirmText={dialog.type === "move" ? "移动到这里" : "复制到这里"}
          excludeCid={currentCid}
          busy={busy}
          hint={`已选 ${dialog.items.length} 项`}
          onPick={(cid) => void submitMoveOrCopy(cid)}
          onCancel={() => setDialog(null)}
        />
      ) : null}

      {preview ? (
        <PreviewModal
          item={preview.item}
          url={preview.url}
          hlsUrl={preview.hlsUrl}
          kind={preview.kind}
          onClose={() => setPreview(null)}
          onOpenExternal={() => void openExternal()}
        />
      ) : null}

      {dialog?.type === "batchRename" ? (
        <BatchRename
          files={dialog.items}
          busy={busy}
          onApply={(pairs) => void submitBatchRename(pairs)}
          onCancel={() => setDialog(null)}
        />
      ) : null}

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}
