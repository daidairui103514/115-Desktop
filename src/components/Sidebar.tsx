import { Icon, type IconName } from "./Icons";
import { NAV_GROUPS, STORAGE } from "@/lib/mock";
import type { NavKey } from "@/lib/types";

const NAV_ICON: Record<NavKey, IconName> = {
  files: "cloud",
  recent: "clock",
  starred: "star",
  downloads: "download",
  shares: "share",
  offline: "magnet",
  trash: "trash",
  media: "film",
  toolbox: "wrench",
};

interface SidebarProps {
  active: NavKey;
  onChange: (key: NavKey) => void;
}

export function Sidebar({ active, onChange }: SidebarProps) {
  return (
    <aside className="sidebar">
      {NAV_GROUPS.map((group) => (
        <div className="side-group" key={group.label}>
          <div className="side-group__label">{group.label}</div>
          {group.items.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`side-item${active === item.key ? " side-item--active" : ""}`}
              onClick={() => onChange(item.key)}
            >
              <span className="side-item__icon">
                <Icon name={NAV_ICON[item.key]} />
              </span>
              <span className="side-item__name">{item.name}</span>
              {item.badge ? <span className="side-item__badge">{item.badge}</span> : null}
            </button>
          ))}
        </div>
      ))}

      <div className="side-foot">
        <div className="storage">
          <div className="storage__top">
            <span>
              已用 <b>{STORAGE.usedText}</b>
            </span>
            <span style={{ opacity: 0.7 }}>/ {STORAGE.totalText}</span>
          </div>
          <div className="storage__bar">
            {STORAGE.segments.map((segment) => (
              <i
                key={segment.label}
                style={{ width: `${segment.percent}%`, background: segment.color }}
              />
            ))}
          </div>
          <div className="storage__legend">
            {STORAGE.segments.map((segment) => (
              <span key={segment.label}>
                <i style={{ background: segment.color }} />
                {segment.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}
