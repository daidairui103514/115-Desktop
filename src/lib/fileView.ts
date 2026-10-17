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
