import { Icon } from "./Icons";
import { closeWindow, minimizeWindow, toggleMaximizeWindow } from "@/lib/window";
import type { ViewMode } from "@/lib/types";

interface TitleBarProps {
  title: string;
  subtitle: string;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  query: string;
  onQueryChange: (value: string) => void;
  onUpload: () => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
}

export function TitleBar({
  title,
  subtitle,
  viewMode,
  onViewModeChange,
  query,
  onQueryChange,
  onUpload,
  theme,
  onToggleTheme,
}: TitleBarProps) {
  return (
    <header className="titlebar" data-tauri-drag-region>
      <div className="traffic">
        <button
          type="button"
          className="traffic__dot traffic__dot--close"
          aria-label="关闭窗口"
          onClick={closeWindow}
        />
        <button
          type="button"
          className="traffic__dot traffic__dot--min"
          aria-label="最小化窗口"
          onClick={minimizeWindow}
        />
        <button
          type="button"
          className="traffic__dot traffic__dot--max"
          aria-label="最大化窗口"
          onClick={toggleMaximizeWindow}
        />
      </div>

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

      <button type="button" className="btn-accent" onClick={onUpload}>
        <Icon name="plus" size={13} />
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
    </header>
  );
}
