import { Icon } from "./Icons";
import type { TransferTask } from "@/lib/types";

interface TransferBarProps {
  tasks: TransferTask[];
}

export function TransferBar({ tasks }: TransferBarProps) {
  const active = tasks.filter((task) => task.status !== "done").length;

  return (
    <footer className="transfer">
      <div className="transfer__label">
        <Icon name="download" size={13} style={{ color: "var(--text-3)" }} />
        传输 <b>{tasks.length}</b>
      </div>

      {tasks.length === 0 ? (
        <span className="transfer__empty">暂无传输任务</span>
      ) : (
        tasks.map((task) => (
          <div className="transfer__item" key={task.id}>
            <span className="transfer__item-name">{task.name}</span>
            <span className="transfer__bar">
              <i style={{ width: `${task.progress}%` }} />
            </span>
            <span className="transfer__pct">{task.progress}%</span>
          </div>
        ))
      )}

      <div className="transfer__spacer" />
      {active > 0 ? <span className="transfer__speed">{active} 项进行中</span> : null}
    </footer>
  );
}
