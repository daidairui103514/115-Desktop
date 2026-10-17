import type { OfflineTask } from "@/lib/types";

interface OfflinePageProps {
  tasks: OfflineTask[];
  loading?: boolean;
  error?: string;
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

export function OfflinePage({ tasks, loading, error }: OfflinePageProps) {
  return (
    <main className="content">
      <div className="pathbar">
        <span className="pathbar__crumb pathbar__crumb--current">离线下载</span>
        <span className="pathbar__count">
          {loading ? "加载中…" : `${tasks.length} 个任务`}
        </span>
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
            添加磁力或 ed2k 链接后会出现在这里
          </span>
        </div>
      ) : (
        <div className="offline-list">
          {tasks.map((task) => (
            <div className="offline-item" key={task.info_hash || task.name}>
              <div className="offline-item__main">
                <div className="offline-item__name">{task.name || "(未命名任务)"}</div>
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
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
