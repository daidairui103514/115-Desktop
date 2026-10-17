import type { IconName } from "@/components/Icons";
import type { FileKind } from "./types";

const ICON_MAP: Record<FileKind, IconName> = {
  folder: "folder",
  video: "film",
  image: "image",
  document: "document",
  archive: "document",
  audio: "film",
  subtitle: "subtitle",
  iso: "document",
};

export function iconForKind(kind: FileKind): IconName {
  return ICON_MAP[kind];
}

/** 文件夹图标用强调色，其它保持中性 */
export function iconTone(kind: FileKind): string | undefined {
  return kind === "folder" ? "var(--accent)" : undefined;
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** i;
  return `${value >= 100 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}
