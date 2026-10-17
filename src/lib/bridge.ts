import type { FileItem, FileKind, RemoteFile } from "./types";

/** 浏览器预览时没有 Tauri 运行时，所有原生能力都要降级 */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

const CATEGORY_KIND: Record<string, FileKind> = {
  "1": "document",
  "2": "image",
  "3": "audio",
  "4": "video",
  "5": "archive",
};

const EXT_KIND: Record<string, FileKind> = {
  mkv: "video",
  mp4: "video",
  avi: "video",
  mov: "video",
  ts: "video",
  wmv: "video",
  flv: "video",
  iso: "iso",
  jpg: "image",
  jpeg: "image",
  png: "image",
  gif: "image",
  webp: "image",
  bmp: "image",
  mp3: "audio",
  flac: "audio",
  wav: "audio",
  m4a: "audio",
  aac: "audio",
  zip: "archive",
  rar: "archive",
  "7z": "archive",
  tar: "archive",
  gz: "archive",
  ass: "subtitle",
  srt: "subtitle",
  ssa: "subtitle",
  vtt: "subtitle",
};

export function kindOf(entry: RemoteFile): FileKind {
  if (entry.is_dir) return "folder";
  const byCategory = CATEGORY_KIND[entry.category];
  if (byCategory) return byCategory;
  const ext = entry.name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_KIND[ext] ?? "document";
}

function formatDate(date: Date): string {
  const now = new Date();
  if (date.getFullYear() !== now.getFullYear()) {
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
  }
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

export function toFileItem(entry: RemoteFile): FileItem {
  const date = entry.modified ? new Date(entry.modified * 1000) : null;
  return {
    id: entry.id,
    name: entry.name,
    kind: kindOf(entry),
    size: entry.size,
    sizeText: entry.size_text,
    modified: date ? date.toISOString().slice(0, 19) : "",
    modifiedText: date ? formatDate(date) : "—",
    sha1: entry.sha1 || undefined,
    cid: entry.cid || undefined,
    pickCode: entry.pick_code || undefined,
  };
}
