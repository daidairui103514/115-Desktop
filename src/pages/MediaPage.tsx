import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/Icons";
import { FolderPicker } from "@/components/FolderPicker";
import { call, isTauri, toFileItem } from "@/lib/bridge";
import type { FileItem, RemoteFile } from "@/lib/types";

interface MediaPageProps {
  rootCid: string;
  onPlay: (item: FileItem) => void;
}

/** 海报墙：递归扫描目录，把散在各子文件夹里的视频摊平展示 */
export function MediaPage({ rootCid, onPlay }: MediaPageProps) {
  const [videos, setVideos] = useState<FileItem[]>([]);
  const [dirLabel, setDirLabel] = useState("当前目录");
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(0);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState("");

  const scan = useCallback(async (cid: string, label: string) => {
    setScanning(true);
    setScanned(0);
    setError("");
    setVideos([]);
    try {
      const entries = await call<RemoteFile[]>("scan_media", { rootCid: cid });
      setVideos(entries.map(toFileItem));
      setDirLabel(label);
    } catch (err) {
      setError(String(err));
    } finally {
      setScanning(false);
    }
  }, []);

  useEffect(() => {
    void scan(rootCid, "当前目录");
  }, [rootCid, scan]);

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

  return (
    <main className="content">
      <div className="pathbar">
        <span className="pathbar__crumb pathbar__crumb--current">媒体库</span>
        <span className="pathbar__sep">·</span>
        <span className="pathbar__crumb">{dirLabel}</span>
        <span className="pathbar__count">
          {scanning
            ? `正在扫描第 ${scanned} 个文件夹…`
            : `${videos.length} 个视频`}
        </span>
        <button
          type="button"
          className="pathbar__action"
          onClick={() => setPicking(true)}
          disabled={scanning}
        >
          选择文件夹
        </button>
      </div>

      {error ? (
        <div className="empty">
          <span>{error}</span>
        </div>
      ) : scanning ? (
        <div className="empty">
          <div className="spinner" />
          <span>正在递归扫描子文件夹…（已扫描 {scanned} 个）</span>
          <span style={{ fontSize: 11, color: "var(--text-3)" }}>
            115 接口有限流，每个目录大约 1 秒
          </span>
        </div>
      ) : videos.length === 0 ? (
        <div className="empty">
          <span>这个目录里没有找到视频</span>
          <button
            type="button"
            className="modal__btn modal__btn--primary"
            style={{ marginTop: 6 }}
            onClick={() => setPicking(true)}
          >
            换个文件夹
          </button>
        </div>
      ) : (
        <div className="media-grid">
          {videos.map((file) => {
            const poster = file.thumb || file.vImg;
            return (
              <button
                type="button"
                className="media-card"
                key={file.id}
                onClick={() => onPlay(file)}
                title={file.name}
              >
                <span className="media-card__poster">
                  {poster ? (
                    <img src={poster} alt="" loading="lazy" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="media-card__fallback">
                      <Icon name="film" size={26} />
                      <span className="media-card__initial">
                        {file.name.replace(/\.[^.]+$/, "").slice(0, 6)}
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
          title="选择媒体文件夹"
          confirmText="扫描这个文件夹"
          onPick={(cid, path) => {
            setPicking(false);
            void scan(cid, path[path.length - 1] ?? "所选目录");
          }}
          onCancel={() => setPicking(false)}
        />
      ) : null}
    </main>
  );
}
