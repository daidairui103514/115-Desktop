import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icons";
import { FolderPicker } from "@/components/FolderPicker";
import { call, cleanMediaName, isTauri, toFileItem } from "@/lib/bridge";
import type { AppSettings, FileItem, MediaFolder, RemoteFile } from "@/lib/types";

interface MediaPageProps {
  onPlay: (item: FileItem) => void;
}

/** 媒体库：由用户指定若干文件夹，递归扫描后统一铺成海报墙 */
export function MediaPage({ onPlay }: MediaPageProps) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [folders, setFolders] = useState<MediaFolder[]>([]);
  const [items, setItems] = useState<FileItem[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(0);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState("");
  const [posters, setPosters] = useState<Record<string, string>>({});

  const fetched = useRef<Set<string>>(new Set());

  const scanAll = useCallback(async (list: MediaFolder[]) => {
    if (list.length === 0) {
      setItems([]);
      return;
    }
    setScanning(true);
    setScanned(0);
    setError("");

    const merged: FileItem[] = [];
    const seen = new Set<string>();

    for (const folder of list) {
      try {
        const entries = await call<RemoteFile[]>("scan_media", { rootCid: folder.cid });
        for (const entry of entries) {
          if (!seen.has(entry.id)) {
            seen.add(entry.id);
            merged.push(toFileItem(entry));
          }
        }
      } catch (err) {
        setError(String(err));
      }
    }

    setItems(merged);
    setScanning(false);
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    void (async () => {
      try {
        const loaded = await call<AppSettings>("get_settings");
        setSettings(loaded);
        setFolders(loaded.media_folders ?? []);
        if ((loaded.media_folders ?? []).length > 0) {
          void scanAll(loaded.media_folders);
        }
      } catch (err) {
        setError(String(err));
      }
    })();
  }, [scanAll]);

  /* 扫描进度 */
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        const stop = await listen<number>("media:scan", (event) => setScanned(event.payload));
        if (cancelled) stop();
        else unlisten = stop;
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const persist = useCallback(
    async (next: MediaFolder[]) => {
      setFolders(next);
      if (!settings) return;
      const updated = { ...settings, media_folders: next };
      setSettings(updated);
      try {
        await call("save_settings", { settings: updated });
      } catch (err) {
        setError(String(err));
      }
    },
    [settings],
  );

  const addFolder = useCallback(
    async (cid: string, name: string) => {
      const next = [...folders.filter((folder) => folder.cid !== cid), { cid, name }];
      await persist(next);
      void scanAll(next);
    },
    [folders, persist, scanAll],
  );

  const removeFolder = useCallback(
    async (cid: string) => {
      const next = folders.filter((folder) => folder.cid !== cid);
      await persist(next);
      void scanAll(next);
    },
    [folders, persist, scanAll],
  );

  /* 逐个片名刮封面 */
  useEffect(() => {
    if (items.length === 0 || !isTauri()) return;

    const names = [...new Set(items.map((file) => cleanMediaName(file.name)))].filter(
      (name) => name && !fetched.current.has(name),
    );
    if (names.length === 0) return;

    names.forEach((name) => fetched.current.add(name));

    let cancelled = false;
    let cursor = 0;

    const worker = async () => {
      while (cursor < names.length && !cancelled) {
        const name = names[cursor];
        cursor += 1;
        const target = items.find((item) => cleanMediaName(item.name) === name);
        const isAudio = target?.kind === "audio";

        try {
          let dataUrl = await call<string>(isAudio ? "music_poster" : "tmdb_poster", {
            query: name,
          });
          if (cancelled) continue;

          if (!dataUrl && !isAudio) {
            try {
              dataUrl = await call<string>("bangumi_poster", { query: name });
            } catch {
              /* 忽略 */
            }
            if (cancelled) continue;
          }

          if (!dataUrl && !isAudio && target?.pickCode) {
            try {
              dataUrl = await call<string>("extract_thumb", {
                pc: target.pickCode,
                seconds: 180,
              });
            } catch {
              /* 忽略 */
            }
            if (cancelled) continue;
          }

          setPosters((prev) => ({ ...prev, [name]: dataUrl }));
        } catch {
          if (!cancelled) setPosters((prev) => ({ ...prev, [name]: "" }));
        }
      }
    };

    void Promise.all([worker(), worker(), worker()]);

    return () => {
      cancelled = true;
    };
  }, [items]);

  const resolveCover = (file: FileItem): string =>
    file.thumb || file.vImg || posters[cleanMediaName(file.name)] || "";

  return (
    <main className="content">
      <div className="pathbar">
        <span className="pathbar__crumb pathbar__crumb--current">媒体库</span>
        <span className="pathbar__count">
          {scanning
            ? `正在扫描第 ${scanned} 个目录…`
            : `${items.length} 个文件 · ${folders.length} 个目录`}
        </span>
        <button type="button" className="pathbar__action" onClick={() => setPicking(true)}>
          添加文件夹
        </button>
        {folders.length > 0 ? (
          <button
            type="button"
            className="pathbar__action"
            onClick={() => void scanAll(folders)}
            disabled={scanning}
          >
            重新扫描
          </button>
        ) : null}
      </div>

      {folders.length > 0 ? (
        <div className="media-folders">
          {folders.map((folder) => (
            <span className="media-folder" key={folder.cid}>
              <Icon name="folder" size={12} style={{ color: "var(--accent)" }} />
              {folder.name}
              <button
                type="button"
                className="media-folder__x"
                aria-label="移除"
                onClick={() => void removeFolder(folder.cid)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {error ? (
        <div className="empty">
          <span>{error}</span>
        </div>
      ) : scanning ? (
        <div className="empty">
          <div className="spinner" />
          <span>正在递归扫描…（已扫描 {scanned} 个目录）</span>
          <span style={{ fontSize: 11, color: "var(--text-3)" }}>
            115 接口限流，每个目录约 1 秒
          </span>
        </div>
      ) : folders.length === 0 ? (
        <div className="empty">
          <span>还没有指定媒体文件夹</span>
          <span style={{ fontSize: 11, color: "var(--text-3)" }}>
            可以添加多个目录，比如「电影」「电视剧」「番剧」
          </span>
          <button
            type="button"
            className="modal__btn modal__btn--primary"
            style={{ marginTop: 6 }}
            onClick={() => setPicking(true)}
          >
            添加文件夹
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="empty">
          <span>这些目录里没有找到可播放的文件</span>
        </div>
      ) : (
        <div className="media-grid">
          {items.map((file) => {
            const cover = resolveCover(file);
            return (
              <button
                type="button"
                className="media-card"
                key={file.id}
                onClick={() => onPlay(file)}
                title={file.name}
              >
                <span className="media-card__poster">
                  {cover ? (
                    <img src={cover} alt="" loading="lazy" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="media-card__fallback">
                      <Icon name={file.kind === "audio" ? "film" : "document"} size={26} />
                      <span className="media-card__initial">
                        {cleanMediaName(file.name).slice(0, 8) || file.name.slice(0, 8)}
                      </span>
                    </span>
                  )}
                  <span className="media-card__play">
                    <Icon name="play" size={16} />
                  </span>
                  {file.duration ? <span className="media-card__time">{file.duration}</span> : null}
                </span>
                <span className="media-card__title">{file.name.replace(/\.[^.]+$/, "")}</span>
                <span className="media-card__meta">
                  {file.sizeText}
                  {file.resolution ? ` · ${file.resolution}` : ""}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {picking ? (
        <FolderPicker
          title="添加媒体文件夹"
          confirmText="添加"
          onPick={(cid, path) => {
            setPicking(false);
            void addFolder(cid, path[path.length - 1] ?? "未命名目录");
          }}
          onCancel={() => setPicking(false)}
        />
      ) : null}
    </main>
  );
}
