import type { FileItem, FileKind, RemoteFile } from "./types";

/** 浏览器预览时没有 Tauri 运行时，所有原生能力都要降级 */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

const VALID_KINDS: FileKind[] = [
  "folder",
  "video",
  "image",
  "document",
  "archive",
  "audio",
  "subtitle",
  "iso",
];

function formatDate(date: Date): string {
  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();
  const md = `${date.getMonth() + 1}月${date.getDate()}日`;
  return sameYear ? md : `${date.getFullYear()}年${md}`;
}

/** Rust 侧已经算好 kind，这里只做兜底与字段改名 */
export function toFileItem(entry: RemoteFile): FileItem {
  const date = entry.modified ? new Date(entry.modified * 1000) : null;
  const kind = (VALID_KINDS as string[]).includes(entry.kind)
    ? (entry.kind as FileKind)
    : entry.is_dir
      ? "folder"
      : "document";

  return {
    id: entry.id,
    name: entry.name,
    kind,
    size: entry.size,
    sizeText: entry.size_text,
    modified: date ? date.toISOString().slice(0, 19) : "",
    modifiedText: date ? formatDate(date) : "—",
    sha1: entry.sha1 || undefined,
    cid: entry.is_dir ? entry.cid : undefined,
    pickCode: entry.pick_code || undefined,
    thumb: entry.thumb || undefined,
    starred: entry.starred || undefined,
    duration: entry.duration || undefined,
    resolution: entry.resolution || undefined,
  };
}
