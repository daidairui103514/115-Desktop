import type { ReactNode, SVGProps } from "react";

/**
 * 统一图标集：16×16 网格，1.3–1.5px 描边，
 * 近似 SF Symbols 的线性风格（不引入图标库，保持包体轻量）。
 */

export type IconName =
  | "folder"
  | "clock"
  | "star"
  | "download"
  | "share"
  | "trash"
  | "cloud"
  | "magnet"
  | "film"
  | "wrench"
  | "search"
  | "plus"
  | "more"
  | "chevron-left"
  | "chevron-right"
  | "chevron-down"
  | "arrow-up"
  | "list"
  | "grid"
  | "image"
  | "document"
  | "subtitle"
  | "play"
  | "sort"
  | "lock"
  | "sun"
  | "moon";

const PATHS: Record<IconName, ReactNode> = {
  folder: (
    <path
      d="M1.5 4.2c0-.6.5-1.1 1.1-1.1h3.1l1.3 1.4h6.3c.6 0 1.1.5 1.1 1.1v6.2c0 .6-.5 1.1-1.1 1.1H2.6c-.6 0-1.1-.5-1.1-1.1V4.2z"
      fill="currentColor"
      opacity=".9"
    />
  ),
  clock: (
    <>
      <circle cx="8" cy="8" r="6.2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 4.6V8l2.4 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </>
  ),
  star: (
    <path
      d="M8 1.7l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.5l-3.8 2 .7-4.3-3.1-3 4.3-.6L8 1.7z"
      fill="currentColor"
    />
  ),
  download: (
    <>
      <path
        d="M8 1.8v7.4M5 6.6l3 3 3-3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2.4 10.6v2.1c0 .6.5 1.1 1.1 1.1h9c.6 0 1.1-.5 1.1-1.1v-2.1"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </>
  ),
  share: (
    <>
      <path
        d="M8 10.6V2.2M5.4 4.8L8 2.2l2.6 2.6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3.2 8.6v4.1c0 .6.5 1.1 1.1 1.1h7.4c.6 0 1.1-.5 1.1-1.1V8.6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </>
  ),
  trash: (
    <path
      d="M2.6 4.2h10.8M6 4.2V2.9c0-.3.2-.5.5-.5h3c.3 0 .5.2.5.5v1.3M4 4.2l.6 8.4c0 .5.4.9.9.9h5c.5 0 .9-.4.9-.9l.6-8.4"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
    />
  ),
  cloud: (
    <path
      d="M4.4 12.4h7.2a2.9 2.9 0 00.4-5.7 4.3 4.3 0 00-8.2-1.1 3 3 0 00.6 6.8z"
      stroke="currentColor"
      strokeWidth="1.3"
    />
  ),
  magnet: (
    <path
      d="M3.2 3.2v4.3a4.8 4.8 0 009.6 0V3.2h-2.7v4.3a2.1 2.1 0 01-4.2 0V3.2H3.2z"
      stroke="currentColor"
      strokeWidth="1.3"
    />
  ),
  film: (
    <>
      <rect x="1.8" y="3.2" width="12.4" height="9.6" rx="1.4" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5 3.2v9.6M11 3.2v9.6" stroke="currentColor" strokeWidth="1.1" opacity=".55" />
    </>
  ),
  wrench: (
    <path
      d="M9.9 2.4a3.6 3.6 0 00-3.3 5.1L2.6 11.5a1.3 1.3 0 001.8 1.8l4-4a3.6 3.6 0 004.9-4.3l-2 2-1.7-1.7 2-2a3.6 3.6 0 00-1.7-.9z"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinejoin="round"
    />
  ),
  search: (
    <>
      <circle cx="7.2" cy="7.2" r="4.4" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10.5 10.5l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </>
  ),
  plus: <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />,
  more: (
    <>
      <circle cx="3.4" cy="8" r="1.1" fill="currentColor" />
      <circle cx="8" cy="8" r="1.1" fill="currentColor" />
      <circle cx="12.6" cy="8" r="1.1" fill="currentColor" />
    </>
  ),
  "chevron-left": (
    <path
      d="M10 3.4L5.4 8l4.6 4.6"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  "chevron-right": (
    <path
      d="M6 3.4L10.6 8 6 12.6"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  "chevron-down": (
    <path
      d="M4 6.4L8 10.4l4-4"
      stroke="currentColor"
      strokeWidth="1.45"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  "arrow-up": (
    <path
      d="M8 13V3M4.6 6.4L8 3l3.4 3.4"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  list: (
    <>
      <path d="M5.4 4h8.4M5.4 8h8.4M5.4 12h8.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="2.7" cy="4" r=".9" fill="currentColor" />
      <circle cx="2.7" cy="8" r=".9" fill="currentColor" />
      <circle cx="2.7" cy="12" r=".9" fill="currentColor" />
    </>
  ),
  grid: (
    <>
      <rect x="2.2" y="2.2" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
      <rect x="8.8" y="2.2" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
      <rect x="2.2" y="8.8" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
      <rect x="8.8" y="8.8" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
    </>
  ),
  image: (
    <>
      <rect x="1.8" y="2.8" width="12.4" height="10.4" rx="1.6" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="5.6" cy="6.2" r="1.1" fill="currentColor" />
      <path
        d="M2.4 11.2l3.4-3 2.4 2 2.2-2.4 3.2 3.4"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
  document: (
    <>
      <path d="M3.4 2.2h5.4l3.8 3.8v7.8H3.4z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M8.8 2.4v3.6h3.6" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </>
  ),
  subtitle: (
    <>
      <rect x="1.8" y="2.8" width="12.4" height="10.4" rx="1.6" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5.6 6.6h4.8M5.6 9.4h3.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </>
  ),
  play: <path d="M5 3.4l7 4.6-7 4.6V3.4z" fill="currentColor" />,
  sort: (
    <path
      d="M8 3v10M4.6 9.6L8 13l3.4-3.4"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  lock: (
    <>
      <rect x="3.2" y="7" width="9.6" height="7" rx="1.8" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5.6 7V5.2a2.4 2.4 0 014.8 0V7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </>
  ),
  sun: (
    <>
      <circle cx="8" cy="8" r="3.1" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M8 1.6v1.5M8 12.9v1.5M1.6 8h1.5M12.9 8h1.5M3.5 3.5l1.1 1.1M11.4 11.4l1.1 1.1M12.5 3.5l-1.1 1.1M4.6 11.4l-1.1 1.1"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </>
  ),
  moon: (
    <path
      d="M13 9.6A5.8 5.8 0 016.4 3a5.9 5.9 0 100 11.8 5.9 5.9 0 006.6-5.2z"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinejoin="round"
    />
  ),
};

interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 16, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
