import { Icon } from "./Icons";
import { iconForKind } from "@/lib/fileView";
import { KIND_LABEL, type FileItem } from "@/lib/types";

interface InspectorProps {
  file: FileItem | null;
}

export function Inspector({ file }: InspectorProps) {
  if (!file) {
    return (
      <aside className="inspector">
        <div className="inspector__placeholder">未选择文件</div>
      </aside>
    );
  }

  return (
    <aside className="inspector">
      {file.thumb ? (
        <img className="inspector__preview" src={file.thumb} alt="" />
      ) : (
        <div className="inspector__placeholder">
          <Icon name={iconForKind(file.kind)} size={46} />
        </div>
      )}

      <div className="inspector__name">{file.name}</div>
      <div className="inspector__sub">
        {KIND_LABEL[file.kind]} · {file.sizeText}
      </div>

      <div className="inspector__actions">
        {file.kind === "video" || file.kind === "iso" ? (
          <button type="button" className="is-primary">
            <Icon name="play" size={11} /> 播放
          </button>
        ) : (
          <button type="button" className="is-primary">
            <Icon name="download" size={12} /> 下载
          </button>
        )}
        <button type="button">分享</button>
        <button type="button">更多</button>
      </div>

      <div className="inspector__section">
        <h4>信息</h4>
        {file.resolution ? (
          <div className="kv">
            <span className="kv__k">分辨率</span>
            <span className="kv__v">{file.resolution}</span>
          </div>
        ) : null}
        {file.duration ? (
          <div className="kv">
            <span className="kv__k">时长</span>
            <span className="kv__v">{file.duration}</span>
          </div>
        ) : null}
        {file.codec ? (
          <div className="kv">
            <span className="kv__k">编码</span>
            <span className="kv__v">{file.codec}</span>
          </div>
        ) : null}
        {file.audio ? (
          <div className="kv">
            <span className="kv__k">音轨</span>
            <span className="kv__v">{file.audio}</span>
          </div>
        ) : null}
        {file.itemCount ? (
          <div className="kv">
            <span className="kv__k">包含</span>
            <span className="kv__v">{file.itemCount} 项</span>
          </div>
        ) : null}
        <div className="kv">
          <span className="kv__k">位置</span>
          <span className="kv__v">我的文件 › 影视 › 4K 蓝光</span>
        </div>
        {file.sha1 ? (
          <div className="kv">
            <span className="kv__k">SHA1</span>
            <span className="kv__v kv__v--mono">{file.sha1.slice(0, 12)}…</span>
          </div>
        ) : null}
        <div className="kv">
          <span className="kv__k">修改时间</span>
          <span className="kv__v">{file.modified.replace("T", " ").slice(0, 16)}</span>
        </div>
        <div className="tag-row">
          {file.resolution?.includes("3840") ? <span className="tag">原画</span> : null}
          {file.resolution?.includes("2160") ? <span className="tag">2160p</span> : null}
          <span className="tag tag--muted">已同步</span>
        </div>
      </div>

      <div className="inspector__section">
        <h4>快捷操作</h4>
        <div className="kv">
          <span className="kv__k">生成 ED2K</span>
          <span className="kv__v" style={{ color: "var(--accent)" }}>
            批量支持
          </span>
        </div>
        <div className="kv">
          <span className="kv__k">重命名</span>
          <span className="kv__v" style={{ color: "var(--accent)" }}>
            可改后缀
          </span>
        </div>
        <div className="kv">
          <span className="kv__k">TMDB 匹配</span>
          <span className="kv__v" style={{ color: "var(--accent)" }}>
            已识别
          </span>
        </div>
      </div>
    </aside>
  );
}
