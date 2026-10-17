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
        <Icon name="download" size={13} style={{ color: "var(--green)" }} />
        传输 <b>{active}</b>
      </div>

      {tasks.map((task) => (
        <div className="transfer__item" key={task.id}>
          <span className="transfer__item-name">{task.name}</span>
          <span className="transfer__bar">
            <i style={{ width: `${task.progress}%` }} />
          </span>
          <span className="transfer__pct">{task.progress}%</span>
        </div>
      ))}

      <div className="transfer__spacer" />
      <span className="transfer__speed">↓ 12.4 MB/s · ↑ 1.2 MB/s</span>
      <button type="button" className="icon-btn" aria-label="展开传输面板">
        <Icon name="chevron-down" size={14} />
      </button>
    </footer>
  );
}
