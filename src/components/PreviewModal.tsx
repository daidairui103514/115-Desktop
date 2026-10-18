import { useEffect, useRef } from "react";
import Hls from "hls.js";
import { Icon } from "./Icons";
import type { FileItem } from "@/lib/types";

export type PreviewKind = "video" | "audio" | "image" | "other";

interface PreviewModalProps {
  item: FileItem;
  /** 走本地代理的原始文件地址 */
  url: string;
  /** 走本地代理的 m3u8 地址；有它就用 HLS 播（覆盖 mkv 等格式） */
  hlsUrl?: string;
  kind: PreviewKind;
  onClose: () => void;
  onOpenExternal: () => void;
}

export function PreviewModal({
  item,
  url,
  hlsUrl,
  kind,
  onClose,
  onOpenExternal,
}: PreviewModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (kind !== "video" || !video) return;

    let hls: Hls | null = null;

    if (hlsUrl) {
      if (Hls.isSupported()) {
        hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          maxBufferLength: 30,
        });
        hls.loadSource(hlsUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.ERROR, (_event, data) => {
          // 清单还没转码好时回退到直链
          if (data.fatal && !video.src) {
            video.src = url;
          }
        });
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = hlsUrl;
      }
    } else {
      video.src = url;
    }

    return () => {
      if (hls) hls.destroy();
    };
  }, [hlsUrl, url, kind]);

  return (
    <div className="preview" onClick={onClose}>
      <div className="preview__bar" onClick={(event) => event.stopPropagation()}>
        <span className="preview__title" title={item.name}>
          {item.name}
        </span>
        <span className="preview__meta">
          {item.sizeText}
          {item.resolution ? ` · ${item.resolution}` : ""}
          {item.duration ? ` · ${item.duration}` : ""}
          {hlsUrl ? " · HLS" : ""}
        </span>
        <button type="button" className="preview__btn" onClick={onOpenExternal}>
          用其他程序打开
        </button>
        <button type="button" className="preview__close" aria-label="关闭" onClick={onClose}>
          <Icon name="chevron-down" size={16} style={{ transform: "rotate(180deg)" }} />
        </button>
      </div>

      <div className="preview__stage" onClick={(event) => event.stopPropagation()}>
        {kind === "video" ? (
          <video ref={videoRef} className="preview__video" controls autoPlay playsInline />
        ) : kind === "audio" ? (
          <div className="preview__audio">
            <div className="preview__audio-cover">
              <Icon name="film" size={42} />
            </div>
            <div className="preview__audio-name">{item.name}</div>
            <audio className="preview__audio-player" src={url} controls autoPlay />
          </div>
        ) : kind === "image" ? (
          <img className="preview__image" src={url} alt={item.name} />
        ) : (
          <div className="preview__fallback">
            <p>这个格式没法内嵌预览</p>
            <button
              type="button"
              className="modal__btn modal__btn--primary"
              onClick={onOpenExternal}
            >
              用系统程序打开
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
