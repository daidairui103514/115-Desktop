export type FileKind =
  | "folder"
  | "video"
  | "image"
  | "document"
  | "archive"
  | "audio"
  | "subtitle"
  | "iso";

export interface FileItem {
  id: string;
  name: string;
  kind: FileKind;
  /** 字节数，文件夹为递归统计值 */
  size: number;
  /** 人类可读大小 */
  sizeText: string;
  /** ISO 日期，用于排序 */
  modified: string;
  modifiedText: string;
  starred?: boolean;
  thumb?: string;
  sha1?: string;
  /** 视频/图片专有 */
  resolution?: string;
  duration?: string;
  codec?: string;
  audio?: string;
  /** 文件夹专有 */
  itemCount?: number;
}

export type NavKey =
  | "files"
  | "recent"
  | "starred"
  | "downloads"
  | "shares"
  | "offline"
  | "trash"
  | "media"
  | "toolbox";

export interface NavItem {
  key: NavKey;
  name: string;
  badge?: string;
}

export interface TransferTask {
  id: string;
  name: string;
  thumb?: string;
  /** 0 - 100 */
  progress: number;
  status: "downloading" | "uploading" | "done" | "paused";
  speed?: string;
  detail?: string;
}

export type SortKey = "name" | "size" | "modified";
export type SortDir = "asc" | "desc";
export type ViewMode = "list" | "grid";
export type ThemeMode = "light" | "dark" | "system";

export const KIND_LABEL: Record<FileKind, string> = {
  folder: "文件夹",
  video: "视频",
  image: "图像",
  document: "文档",
  archive: "归档",
  audio: "音频",
  subtitle: "字幕",
  iso: "磁盘映像",
};
