/**
 * Tauri 窗口控制的安全封装。
 * 在浏览器里预览时（没有 Tauri 运行时）静默降级，不抛错。
 */

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function currentWindow() {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow();
}

export async function minimizeWindow(): Promise<void> {
  if (!isTauri()) return;
  try {
    (await currentWindow()).minimize();
  } catch (err) {
    console.warn("minimize failed", err);
  }
}

export async function toggleMaximizeWindow(): Promise<void> {
  if (!isTauri()) return;
  try {
    (await currentWindow()).toggleMaximize();
  } catch (err) {
    console.warn("toggle maximize failed", err);
  }
}

export async function closeWindow(): Promise<void> {
  if (!isTauri()) return;
  try {
    (await currentWindow()).close();
  } catch (err) {
    console.warn("close failed", err);
  }
}
