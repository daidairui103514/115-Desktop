import { Icon } from "./Icons";
import type { FileItem } from "@/lib/types";

export type PreviewKind = "video" | "audio" | "image" | "other";

interface PreviewModalProps {
  item: FileItem;
  url: string;
  kind: PreviewKind;
  onClose: () => void;
  onOpenExternal: () => void;
}

export function PreviewModal({ item, url, kind, onClose, onOpenExternal }: PreviewModalProps) {
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
          <video className="preview__video" src={url} controls autoPlay playsInline />
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
            <button type="button" className="modal__btn modal__btn--primary" onClick={onOpenExternal}>
              用系统程序打开
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
