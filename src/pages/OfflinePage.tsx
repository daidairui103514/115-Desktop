import { useState } from "react";
import type { OfflineTask } from "@/lib/types";

interface OfflinePageProps {
  tasks: OfflineTask[];
  loading?: boolean;
  error?: string;
  busy?: boolean;
  onAdd: (urls: string) => void;
  onDelete: (hash: string) => void;
}

const STATUS_TEXT: Record<string, string> = {
  "-1": "失败",
  "0": "分配中",
  "1": "下载中",
  "2": "已完成",
};

function formatTime(seconds: number): string {
  if (!seconds) return "—";
  const d = new Date(seconds * 1000);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;
}

export function OfflinePage({ tasks, loading, error, busy, onAdd, onDelete }: OfflinePageProps) {
  const [adding, setAdding] = useState(false);
  const [input, setInput] = useState("");

  const submit = () => {
    const urls = input
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .join("\n");
    if (!urls) return;
    onAdd(urls);
    setInput("");
    setAdding(false);
  };

  return (
    <main className="content">
      <div className="pathbar">
        <span className="pathbar__crumb pathbar__crumb--current">离线下载</span>
        <span className="pathbar__count">
          {loading ? "加载中…" : `${tasks.length} 个任务`}
        </span>
        <button type="button" className="pathbar__action" onClick={() => setAdding(true)}>
          添加任务
        </button>
      </div>

      {error ? (
        <div className="empty">
          <span>{error}</span>
        </div>
      ) : loading ? (
        <div className="empty">
          <div className="spinner" />
          <span>正在读取离线任务…</span>
        </div>
      ) : tasks.length === 0 ? (
        <div className="empty">
          <span>暂无离线任务</span>
          <span style={{ fontSize: 11, color: "var(--text-3)" }}>
            点右上角「添加任务」，粘贴磁力或 ed2k 链接
          </span>
        </div>
      ) : (
        <div className="offline-list">
          {tasks.map((task) => (
            <div className="offline-item" key={task.info_hash || task.name}>
              <div className="offline-item__main">
                <div className="offline-item__name" title={task.name}>
                  {task.name || "(未命名任务)"}
                </div>
                <div className="offline-item__meta">
                  {task.size_text}
                  <span className="dot-sep" />
                  {formatTime(task.add_time)}
                  <span className="dot-sep" />
                  <span
                    className={
                      task.status === 2
                        ? "offline-item__ok"
                        : task.status === -1
                          ? "offline-item__fail"
                          : undefined
                    }
                  >
                    {STATUS_TEXT[String(task.status)] ?? "未知"}
                  </span>
                </div>
              </div>
              <div className="offline-item__bar">
                <i style={{ width: `${Math.max(0, Math.min(100, task.percent))}%` }} />
              </div>
              <div className="offline-item__pct">{task.percent}%</div>
              <button
                type="button"
                className="rb-item__btn"
                disabled={busy || !task.info_hash}
                onClick={() => onDelete(task.info_hash)}
              >
                移除
              </button>
            </div>
          ))}
        </div>
      )}

      {adding ? (
        <div className="modal-backdrop" onClick={() => setAdding(false)}>
          <div className="modal modal--wide" onClick={(event) => event.stopPropagation()}>
            <h3 className="modal__title">添加离线任务</h3>
            <p className="modal__hint" style={{ marginTop: 10 }}>
              支持磁力链接、ed2k、http 直链，一行一个。
            </p>
            <textarea
              className="login__textarea"
              style={{ height: 132, marginTop: 10 }}
              value={input}
              spellCheck={false}
              placeholder={"magnet:?xt=urn:btih:...\ned2k://|file|...|/"}
              onChange={(event) => setInput(event.target.value)}
            />
            <div className="modal__actions">
              <button type="button" className="modal__btn" onClick={() => setAdding(false)}>
                取消
              </button>
              <button
                type="button"
                className="modal__btn modal__btn--primary"
                disabled={busy || !input.trim()}
                onClick={submit}
              >
                {busy ? "提交中…" : "添加到云端"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
