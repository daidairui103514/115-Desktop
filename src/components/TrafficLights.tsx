import { closeWindow, minimizeWindow, toggleMaximizeWindow } from "@/lib/window";

interface TrafficLightsProps {
  maximizable?: boolean;
}

export function TrafficLights({ maximizable = true }: TrafficLightsProps) {
  return (
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
      {maximizable ? (
        <button
          type="button"
          className="traffic__dot traffic__dot--max"
          aria-label="最大化窗口"
          onClick={toggleMaximizeWindow}
        />
      ) : (
        <span className="traffic__dot traffic__dot--max" aria-hidden="true" />
      )}
    </div>
  );
}
