import { isTauri } from "@/lib/bridge";
import { getCurrentWindow } from "@tauri-apps/api/window";

type Dir =
  | "North"
  | "South"
  | "East"
  | "West"
  | "NorthEast"
  | "NorthWest"
  | "SouthEast"
  | "SouthWest";

const EDGES: { cls: string; dir: Dir }[] = [
  { cls: "n", dir: "North" },
  { cls: "s", dir: "South" },
  { cls: "e", dir: "East" },
  { cls: "w", dir: "West" },
  { cls: "ne", dir: "NorthEast" },
  { cls: "nw", dir: "NorthWest" },
  { cls: "se", dir: "SouthEast" },
  { cls: "sw", dir: "SouthWest" },
];

/**
 * 无边框窗口没法像原生窗口那样从边缘拉伸，
 * 这里沿四边和四角铺一层热区，按下时交给系统处理缩放。
 */
export function WindowResizer() {
  if (!isTauri()) return null;

  const begin = (dir: Dir) => {
    void getCurrentWindow()
      .startResizeDragging(dir)
      .catch(() => {
        /* 忽略：部分平台不支持某些方向 */
      });
  };

  return (
    <>
      {EDGES.map(({ cls, dir }) => (
        <div
          key={cls}
          className={`resizer resizer--${cls}`}
          aria-hidden="true"
          onMouseDown={(event) => {
            event.preventDefault();
            begin(dir);
          }}
        />
      ))}
    </>
  );
}
