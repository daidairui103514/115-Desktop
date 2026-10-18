import { Icon } from "@/components/Icons";
import type { FileItem } from "@/lib/types";

interface MediaPageProps {
  files: FileItem[];
  loading?: boolean;
  onPlay: (item: FileItem) => void;
}

/** 海报墙：把当前目录的视频铺成封面网格 */
export function MediaPage({ files, loading, onPlay }: MediaPageProps) {
  const videos = files.filter((file) => file.kind === "video" || file.kind === "iso");

  return (
    <main className="content">
      <div className="pathbar">
        <span className="pathbar__crumb pathbar__crumb--current">媒体库</span>
        <span className="pathbar__count">
          {loading ? "加载中…" : `${videos.length} 个视频`}
        </span>
      </div>

      {loading ? (
        <div className="empty">
          <div className="spinner" />
          <span>正在读取…</span>
        </div>
      ) : videos.length === 0 ? (
        <div className="empty">
          <span>当前目录没有视频</span>
          <span style={{ fontSize: 11, color: "var(--text-3)" }}>
            先进入存放视频的文件夹，再点「媒体库」
          </span>
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
                    <Icon name="film" size={28} />
                  </span>
                )}
                <span className="media-card__play">
                  <Icon name="play" size={16} />
                </span>
                {file.duration ? (
                  <span className="media-card__time">{file.duration}</span>
                ) : null}
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
    </main>
  );
}
