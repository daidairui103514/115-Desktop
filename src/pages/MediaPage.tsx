import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/Icons";
import { FolderPicker } from "@/components/FolderPicker";
import { call, toFileItem } from "@/lib/bridge";
import type { FileItem, FilePage } from "@/lib/types";

interface MediaPageProps {
  rootCid: string;
  onPlay: (item: FileItem) => void;
}

/** 海报墙：默认取当前目录的视频，也可以另外挑一个文件夹 */
export function MediaPage({ rootCid, onPlay }: MediaPageProps) {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [dirLabel, setDirLabel] = useState("当前目录");
  const [loading, setLoading] = useState(false);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (cid: string, label: string) => {
    setLoading(true);
    setError("");
    try {
      const page = await call<FilePage>("list_files", {
        cid,
        offset: 0,
        limit: 115,
        mode: "files",
      });
      setFiles(page.entries.map(toFileItem));
      setDirLabel(label);
    } catch (err) {
      setError(String(err));
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(rootCid, "当前目录");
  }, [rootCid, load]);

  const videos = files.filter((file) => file.kind === "video" || file.kind === "iso");

  return (
    <main className="content">
      <div className="pathbar">
        <span className="pathbar__crumb pathbar__crumb--current">媒体库</span>
        <span className="pathbar__sep">·</span>
        <span className="pathbar__crumb">{dirLabel}</span>
        <span className="pathbar__count">
          {loading ? "加载中…" : `${videos.length} 个视频`}
        </span>
        <button type="button" className="pathbar__action" onClick={() => setPicking(true)}>
          选择文件夹
        </button>
      </div>

      {error ? (
        <div className="empty">
          <span>{error}</span>
        </div>
      ) : loading ? (
        <div className="empty">
          <div className="spinner" />
          <span>正在读取…</span>
        </div>
      ) : videos.length === 0 ? (
        <div className="empty">
          <span>这个目录里没有视频</span>
          <button
            type="button"
            className="modal__btn modal__btn--primary"
            style={{ marginTop: 6 }}
            onClick={() => setPicking(true)}
          >
            选择文件夹
          </button>
        </div>
      ) : (
        <div className="media-grid">
          {videos.map((file) => (
            <button
              type="button"
              className="media-card"
              key={file.id}
              onClick={() => onPlay(file)}
              title={file.name}
            >
              <span className="media-card__poster">
                {file.thumb ? (
                  <img src={file.thumb} alt="" loading="lazy" />
                ) : (
                  <span className="media-card__fallback">
                    <span className="media-card__initial">
                      {file.name.replace(/\.[^.]+$/, "").slice(0, 2)}
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
          ))}
        </div>
      )}

      {picking ? (
        <FolderPicker
          title="选择媒体文件夹"
          confirmText="载入这个文件夹"
          onPick={(cid, path) => {
            setPicking(false);
            void load(cid, path[path.length - 1] ?? "所选目录");
          }}
          onCancel={() => setPicking(false)}
        />
      ) : null}
    </main>
  );
}
