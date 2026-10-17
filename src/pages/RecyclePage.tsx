import { Icon } from "@/components/Icons";
import type { RecycleItem } from "@/lib/types";

interface RecyclePageProps {
  items: RecycleItem[];
  loading?: boolean;
  error?: string;
  busy?: boolean;
  onRestore: (item: RecycleItem) => void;
  onClear: () => void;
}

function formatTime(seconds: number): string {
  if (!seconds) return "—";
  const d = new Date(seconds * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function RecyclePage({
  items,
  loading,
  error,
  busy,
  onRestore,
  onClear,
}: RecyclePageProps) {
  return (
    <main className="content">
      <div className="pathbar">
        <span className="pathbar__crumb pathbar__crumb--current">回收站</span>
        <span className="pathbar__count">{loading ? "加载中…" : `${items.length} 项`}</span>
        {items.length > 0 ? (
          <button
            type="button"
            className="pathbar__action"
            onClick={onClear}
            disabled={busy}
          >
            清空回收站
          </button>
        ) : null}
      </div>

      {error ? (
        <div className="empty">
          <span>{error}</span>
        </div>
      ) : loading ? (
        <div className="empty">
          <div className="spinner" />
          <span>正在读取回收站…</span>
        </div>
      ) : items.length === 0 ? (
        <div className="empty">
          <span>回收站是空的</span>
        </div>
      ) : (
        <div className="rb-list">
          {items.map((item) => (
            <div className="rb-item" key={item.id || item.name}>
              <span className="rb-item__icon">
                <Icon
                  name={item.is_dir ? "folder" : "document"}
                  size={15}
                  style={{ color: item.is_dir ? "var(--accent)" : undefined }}
                />
              </span>
              <span className="rb-item__name">{item.name || "(未命名)"}</span>
              <span className="rb-item__size">{item.size_text}</span>
              <span className="rb-item__date">{formatTime(item.delete_time)}</span>
              <button
                type="button"
                className="rb-item__btn"
                onClick={() => onRestore(item)}
                disabled={busy || !item.id}
              >
                还原
              </button>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
