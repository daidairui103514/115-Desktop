import { Icon } from "./Icons";
import type { TransferItem } from "@/lib/types";

interface TransferBarProps {
  tasks: TransferItem[];
  onOpenDir?: () => void;
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

export function TransferBar({ tasks, onOpenDir }: TransferBarProps) {
  const running = tasks.filter((task) => !task.done && !task.error).length;

  return (
    <footer className="transfer">
      <div className="transfer__label">
        <Icon name="download" size={13} style={{ color: "var(--text-3)" }} />
        传输 <b>{tasks.length}</b>
      </div>

      {tasks.length === 0 ? (
        <span className="transfer__empty">暂无传输任务</span>
      ) : (
        tasks.slice(0, 3).map((task) => {
          const percent =
            task.total > 0
              ? Math.min(100, Math.round((task.downloaded / task.total) * 100))
              : task.done
                ? 100
                : 0;
          return (
            <div className="transfer__item" key={task.id}>
              <span className="transfer__item-name" title={task.name}>
                {task.name}
              </span>
              <span className="transfer__bar">
                <i
                  style={{
                    width: `${percent}%`,
                    background: task.error ? "#d70015" : undefined,
                  }}
                />
              </span>
              <span className="transfer__pct">
                {task.error ? "失败" : task.done ? "完成" : `${percent}%`}
              </span>
            </div>
          );
        })
      )}

      <div className="transfer__spacer" />
      {running > 0 ? <span className="transfer__speed">{running} 项进行中</span> : null}
      {tasks.some((task) => task.done) ? (
        <span className="transfer__speed">
          {human(tasks.reduce((sum, task) => sum + task.downloaded, 0))}
        </span>
      ) : null}
      {onOpenDir ? (
        <button type="button" className="icon-btn" aria-label="打开下载目录" onClick={onOpenDir}>
          <Icon name="folder" size={13} />
        </button>
      ) : null}
    </footer>
  );
}
