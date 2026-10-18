import { Icon } from "@/components/Icons";
import type { TransferItem } from "@/lib/types";

interface DownloadsPageProps {
  tasks: TransferItem[];
  onOpenDir: () => void;
  onClear: () => void;
}

function human(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value >= 100 || idx === 0 ? Math.round(value) : value.toFixed(1)} ${units[idx]}`;
}

export function DownloadsPage({ tasks, onOpenDir, onClear }: DownloadsPageProps) {
  return (
    <main className="content">
      <div className="pathbar">
        <span className="pathbar__crumb pathbar__crumb--current">下载</span>
        <span className="pathbar__count">{tasks.length} 个任务</span>
        <button type="button" className="pathbar__action" onClick={onOpenDir}>
          打开下载目录
        </button>
        {tasks.some((task) => task.done || task.error) ? (
          <button type="button" className="pathbar__action" onClick={onClear}>
            清除已完成
          </button>
        ) : null}
      </div>

      {tasks.length === 0 ? (
        <div className="empty">
          <span>还没有下载任务</span>
          <span style={{ fontSize: 11, color: "var(--text-3)" }}>
            在文件上右键选「下载到本地」
          </span>
        </div>
      ) : (
        <div className="offline-list">
          {tasks.map((task) => {
            const percent =
              task.total > 0
                ? Math.min(100, Math.round((task.downloaded / task.total) * 100))
                : task.done
                  ? 100
                  : 0;
            return (
              <div className="offline-item" key={task.id}>
                <span className="rb-item__icon">
                  <Icon name="download" size={15} />
                </span>
                <div className="offline-item__main">
                  <div className="offline-item__name" title={task.name}>
                    {task.name}
                  </div>
                  <div className="offline-item__meta">
                    {human(task.downloaded)}
                    {task.total > 0 ? ` / ${human(task.total)}` : ""}
                    <span className="dot-sep" />
                    <span
                      className={
                        task.error
                          ? "offline-item__fail"
                          : task.done
                            ? "offline-item__ok"
                            : undefined
                      }
                    >
                      {task.error ? `失败：${task.error}` : task.done ? "已完成" : "下载中"}
                    </span>
                  </div>
                </div>
                <div className="offline-item__bar">
                  <i
                    style={{
                      width: `${percent}%`,
                      background: task.error ? "#d70015" : undefined,
                    }}
                  />
                </div>
                <div className="offline-item__pct">{percent}%</div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
