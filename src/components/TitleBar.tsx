import { useState } from "react";
import { Icon } from "./Icons";
import { TrafficLights } from "./TrafficLights";
import type { UserProfile, ViewMode } from "@/lib/types";

interface TitleBarProps {
  title: string;
  subtitle: string;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  query: string;
  onQueryChange: (value: string) => void;
  onNewFolder: () => void;
  onUpload: () => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  user?: UserProfile | null;
  onLogout?: () => void;
}

export function TitleBar({
  title,
  subtitle,
  viewMode,
  onViewModeChange,
  query,
  onQueryChange,
  onNewFolder,
  onUpload,
  theme,
  onToggleTheme,
  user,
  onLogout,
}: TitleBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="titlebar" data-tauri-drag-region>
      <TrafficLights />

      <div className="nav-arrows">
        <button type="button" className="icon-btn" aria-label="后退">
          <Icon name="chevron-left" />
        </button>
        <button type="button" className="icon-btn" aria-label="前进" disabled>
          <Icon name="chevron-right" />
        </button>
      </div>

      <div className="title-block">
        <span className="title-block__main">{title}</span>
        <span className="title-block__sub">{subtitle}</span>
      </div>

      <div className="toolbar-spacer" />

      <div className="segmented" role="group" aria-label="视图模式">
        <button
          type="button"
          className={`segmented__item${viewMode === "list" ? " segmented__item--active" : ""}`}
          aria-label="列表视图"
          aria-pressed={viewMode === "list"}
          onClick={() => onViewModeChange("list")}
        >
          <Icon name="list" size={14} />
        </button>
        <button
          type="button"
          className={`segmented__item${viewMode === "grid" ? " segmented__item--active" : ""}`}
          aria-label="网格视图"
          aria-pressed={viewMode === "grid"}
          onClick={() => onViewModeChange("grid")}
        >
          <Icon name="grid" size={14} />
        </button>
      </div>

      <label className="search">
        <Icon name="search" size={13} className="search__icon" />
        <input
          className="search__input"
          type="search"
          placeholder="搜索当前目录"
          spellCheck={false}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </label>

      <button type="button" className="btn-accent" onClick={onNewFolder}>
        <Icon name="plus" size={13} />
        新建
      </button>

      <button type="button" className="btn-ghost" onClick={onUpload}>
        <Icon name="arrow-up" size={13} />
        上传
      </button>

      <button
        type="button"
        className="icon-btn"
        aria-label={theme === "dark" ? "切换到浅色" : "切换到深色"}
        onClick={onToggleTheme}
      >
        <Icon name={theme === "dark" ? "sun" : "moon"} />
      </button>

      <button type="button" className="icon-btn" aria-label="更多操作">
        <Icon name="more" />
      </button>

      {user || onLogout ? (
        <div className="user-wrap">
          <button
            type="button"
            className="avatar"
            title={user?.user_name ?? "账号"}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {user?.user_name?.slice(0, 1).toUpperCase() ?? "预"}
          </button>

          {menuOpen ? (
            <>
              <div className="user-menu__backdrop" onClick={() => setMenuOpen(false)} />
              <div className="user-menu" role="menu">
                <div className="user-menu__head">
                  <div className="user-menu__name">{user?.user_name ?? "已登录"}</div>
                  <div className="user-menu__sub">
                    {user?.space_used ?? "—"} / {user?.space_total ?? "—"}
                  </div>
                </div>
                {onLogout ? (
                  <button
                    type="button"
                    className="user-menu__item user-menu__item--danger"
                    onClick={() => {
                      setMenuOpen(false);
                      onLogout();
                    }}
                  >
                    退出登录
                  </button>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}
