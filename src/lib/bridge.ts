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
    vImg: entry.v_img || undefined,
    starred: entry.starred || undefined,
    duration: entry.duration || undefined,
    resolution: entry.resolution || undefined,
  };
}

const VIDEO_INLINE = ["mp4", "m4v", "webm", "mov"];
const AUDIO_INLINE = ["mp3", "flac", "wav", "m4a", "aac", "ogg"];
const IMAGE_INLINE = ["jpg", "jpeg", "png", "gif", "webp", "bmp"];

/** WebView2 只能内嵌播 mp4/webm，其余交给系统程序 */
export function previewKind(ext: string): "video" | "audio" | "image" | "other" {
  const lower = ext.toLowerCase();
  if (VIDEO_INLINE.includes(lower)) return "video";
  if (AUDIO_INLINE.includes(lower)) return "audio";
  if (IMAGE_INLINE.includes(lower)) return "image";
  return "other";
}

/** 把文件名清理成可以拿去搜片名的形式 */
export function cleanMediaName(raw: string): string {
  return raw
    .replace(/\.[^.]+$/, "")
    .replace(/[._]/g, " ")
    .replace(/\[[^\]]*\]|\([^)]*\)/g, " ")
    .replace(
      /\b(2160p|1080p|720p|480p|4k|8k|bluray|blu-ray|web-dl|webrip|hdtv|remux|x264|x265|h264|h265|hevc|avc|aac|ac3|dts|ddp|hdr|10bit|8bit)\b/gi,
      " ",
    )
    .replace(/\bS\d{1,2}E\d{1,3}\b/gi, " ")
    .replace(/第\s*\d+\s*[集话期]/g, " ")
    .replace(/\bEP?\s*\d{1,3}\b/gi, " ")
    .replace(/\s+\d{1,3}$/, " ")
    .replace(/\s+/g, " ")
    .trim();
}
