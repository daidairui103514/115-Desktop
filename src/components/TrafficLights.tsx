import { closeWindow, minimizeWindow, toggleMaximizeWindow } from "@/lib/window";

interface TrafficLightsProps {
  maximizable?: boolean;
}

/** macOS 交通灯的鼠标悬停符号 */
const GLYPHS: Record<"close" | "min" | "max", string> = {
  close: "M3.4 3.4l5.2 5.2M8.6 3.4L3.4 8.6",
  min: "M3.2 6h5.6",
  max: "M3.6 8.4V5.6h2.8M8.4 3.6v2.8H5.6",
};

function Dot({
  kind,
  label,
  onClick,
}: {
  kind: "close" | "min" | "max";
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className={`traffic__dot traffic__dot--${kind}`}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
        <path
          d={GLYPHS[kind]}
          fill="none"
          stroke="rgba(0,0,0,0.55)"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

export function TrafficLights({ maximizable = true }: TrafficLightsProps) {
  return (
    <div className="traffic">
      <Dot kind="close" label="关闭" onClick={closeWindow} />
      <Dot kind="min" label="最小化" onClick={minimizeWindow} />
      {maximizable ? (
        <Dot kind="max" label="最大化" onClick={toggleMaximizeWindow} />
      ) : (
        <span className="traffic__dot traffic__dot--max" aria-hidden="true">
          <svg width="12" height="12" viewBox="0 0 12 12">
            <path
              d={GLYPHS.max}
              fill="none"
              stroke="rgba(0,0,0,0.55)"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      )}
    </div>
  );
}
