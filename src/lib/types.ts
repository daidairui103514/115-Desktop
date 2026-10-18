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
  /** 字节数，文件夹为服务端统计值 */
  size: number;
  /** 人类可读大小 */
  sizeText: string;
  /** ISO 日期，用于排序 */
  modified: string;
  modifiedText: string;
  starred?: boolean;
  thumb?: string;
  vImg?: string;
  sha1?: string;
  /** 文件夹的 115 cid，用于进入目录 */
  cid?: string;
  pickCode?: string;
  /** 视频/图片专有 */
  resolution?: string;
  duration?: string;
  codec?: string;
  audio?: string;
  /** 文件夹专有 */
  itemCount?: number;
}

/* ---------- 来自 Rust 侧的 115 接口结构 ---------- */

export interface RemoteFile {
  id: string;
  cid: string;
  name: string;
  is_dir: boolean;
  /** folder / video / image / audio / archive / subtitle / iso / document */
  kind: string;
  size: number;
  size_text: string;
  /** Unix 秒 */
  modified: number;
  pick_code: string;
  sha1: string;
  thumb: string;
  v_img: string;
  starred: boolean;
  duration: string;
  resolution: string;
}

export interface OfflineTask {
  info_hash: string;
  name: string;
  size_text: string;
  percent: number;
  /** -1 失败 / 0 分配中 / 1 下载中 / 2 成功 */
  status: number;
  add_time: number;
}

export interface OpResult {
  ok: number;
  fail: number;
  message: string;
}

export interface TransferItem {
  id: string;
  name: string;
  downloaded: number;
  total: number;
  done: boolean;
  error: string;
}

export interface UploadResult {
  file_name: string;
  size_text: string;
  instant: boolean;
}

export interface AppSettings {
  tmdb_key: string;
  proxy: string;
  download_dir: string;
  preferred_quality: string;
}

export interface TmdbHit {
  id: number;
  title: string;
  year: string;
  poster: string;
  overview: string;
  media_type: string;
}

export interface RecycleItem {
  id: string;
  name: string;
  size_text: string;
  is_dir: boolean;
  delete_time: number;
}

export interface FilePage {
  cid: string;
  total: number;
  entries: RemoteFile[];
}

export interface UserProfile {
  user_id?: number;
  user_name?: string;
  is_vip: boolean;
  space_total?: string;
  space_used?: string;
  space_remain?: string;
  space_total_bytes: number;
  space_used_bytes: number;
}

export interface AuthStatus {
  logged_in: boolean;
  user?: UserProfile | null;
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
  | "toolbox"
  | "settings";

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
