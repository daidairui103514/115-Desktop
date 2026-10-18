import { useMemo, useState } from "react";
import type { FileItem } from "@/lib/types";

type Mode = "replace" | "sequence" | "regex";

interface BatchRenameProps {
  files: FileItem[];
  busy?: boolean;
  onApply: (pairs: { id: string; name: string }[]) => void;
  onCancel: () => void;
}

/** 拆成主名 + 扩展名，重命名时默认不动扩展名 */
function splitExt(name: string): [string, string] {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return [name, ""];
  return [name.slice(0, dot), name.slice(dot)];
}

function nextName(
  file: FileItem,
  index: number,
  mode: Mode,
  from: string,
  to: string,
  prefix: string,
  pad: number,
): string {
  const [stem, ext] = splitExt(file.name);

  if (mode === "replace") {
    if (!from) return file.name;
    return stem.split(from).join(to) + ext;
  }

  if (mode === "sequence") {
    const number = String(index + 1).padStart(pad, "0");
    return `${prefix}${number}${ext}`;
  }

  // regex
  if (!from) return file.name;
  try {
    const re = new RegExp(from, "g");
    return stem.replace(re, to) + ext;
  } catch {
    return file.name;
  }
}

export function BatchRename({ files, busy, onApply, onCancel }: BatchRenameProps) {
  const [mode, setMode] = useState<Mode>("replace");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [prefix, setPrefix] = useState("");
  const [pad, setPad] = useState(2);

  const preview = useMemo(
    () =>
      files.map((file, index) => ({
        file,
        next: nextName(file, index, mode, from, to, prefix, pad),
      })),
    [files, mode, from, to, prefix, pad],
  );

  const changed = preview.filter((item) => item.next !== item.file.name);

  const submit = () => {
    onApply(
      changed.map((item) => ({ id: item.file.id, name: item.next })),
    );
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal modal--wide" onClick={(event) => event.stopPropagation()}>
        <h3 className="modal__title">批量重命名（{files.length} 项）</h3>

        <div className="rename-tabs">
          {(
            [
              ["replace", "查找替换"],
              ["sequence", "按序号"],
              ["regex", "正则"],
            ] as [Mode, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`rename-tab${mode === key ? " rename-tab--active" : ""}`}
              onClick={() => setMode(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "sequence" ? (
          <div className="rename-row">
            <label className="login__field" style={{ flex: 1 }}>
              <span className="login__field-label">前缀</span>
              <input
                className="modal__input"
                value={prefix}
                placeholder="例如 你是我的荣耀 E"
                onChange={(event) => setPrefix(event.target.value)}
              />
            </label>
            <label className="login__field" style={{ width: 96 }}>
              <span className="login__field-label">补零位数</span>
              <input
                className="modal__input"
                type="number"
                min={1}
                max={4}
                value={pad}
                onChange={(event) => setPad(Number(event.target.value) || 1)}
              />
            </label>
          </div>
        ) : (
          <div className="rename-row">
            <label className="login__field" style={{ flex: 1 }}>
              <span className="login__field-label">
                {mode === "regex" ? "正则表达式" : "查找"}
              </span>
              <input
                className="modal__input"
                value={from}
                spellCheck={false}
                placeholder={mode === "regex" ? "例如 \\[(\\d+)\\]" : "例如 .1080p"}
                onChange={(event) => setFrom(event.target.value)}
              />
            </label>
            <label className="login__field" style={{ flex: 1 }}>
              <span className="login__field-label">
                {mode === "regex" ? "替换为（可用 $1）" : "替换成"}
              </span>
              <input
                className="modal__input"
                value={to}
                spellCheck={false}
                onChange={(event) => setTo(event.target.value)}
              />
            </label>
          </div>
        )}

        <div className="rename-preview">
          {preview.slice(0, 40).map((item) => (
            <div className="rename-preview__row" key={item.file.id}>
              <span className="rename-preview__old">{item.file.name}</span>
              <span className="rename-preview__arrow">→</span>
              <span
                className={`rename-preview__new${
                  item.next === item.file.name ? " rename-preview__new--same" : ""
                }`}
              >
                {item.next}
              </span>
            </div>
          ))}
          {preview.length > 40 ? (
            <div className="rename-preview__more">…还有 {preview.length - 40} 项</div>
          ) : null}
        </div>

        <p className="modal__hint">
          扩展名自动保留；改名走 115 的秒传接口，不会重新上传文件内容。
        </p>

        <div className="modal__actions">
          <button type="button" className="modal__btn" onClick={onCancel} disabled={busy}>
            取消
          </button>
          <button
            type="button"
            className="modal__btn modal__btn--primary"
            disabled={busy || changed.length === 0}
            onClick={submit}
          >
            {busy ? "处理中…" : `确认改名（${changed.length} 项）`}
          </button>
        </div>
      </div>
    </div>
  );
}
