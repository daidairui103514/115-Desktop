import { useCallback, useState } from "react";
import { Icon } from "@/components/Icons";
import { call } from "@/lib/bridge";
import type { FilePage, RemoteFile } from "@/lib/types";

interface ToolboxPageProps {
  rootCid: string;
  onNotify: (message: string) => void;
}

interface WalkNode extends RemoteFile {
  path: string;
  parentCid: string;
}

const MAX_DEPTH = 4;
const MAX_DIRS = 240;

async function walkTree(
  cid: string,
  basePath: string,
  depth: number,
  acc: WalkNode[],
  stats: { dirs: number },
): Promise<void> {
  if (depth > MAX_DEPTH || stats.dirs >= MAX_DIRS) return;
  stats.dirs += 1;

  const page = await call<FilePage>("list_files", {
    cid,
    offset: 0,
    limit: 115,
    mode: "files",
  });

  for (const entry of page.entries) {
    const path = `${basePath}/${entry.name}`;
    acc.push({ ...entry, path, parentCid: cid });
    if (entry.is_dir && entry.cid) {
      await walkTree(entry.cid, path, depth + 1, acc, stats);
    }
  }
}

interface DupGroup {
  sha1: string;
  sizeText: string;
  files: WalkNode[];
}

export function ToolboxPage({ rootCid, onNotify }: ToolboxPageProps) {
  const [busy, setBusy] = useState<"" | "empty" | "dupes" | "sha1">("");
  const [progress, setProgress] = useState("");
  const [emptyDirs, setEmptyDirs] = useState<WalkNode[]>([]);
  const [dupes, setDupes] = useState<DupGroup[]>([]);
  const [waste, setWaste] = useState("");

  const runEmpty = useCallback(async () => {
    setBusy("empty");
    setEmptyDirs([]);
    setProgress("正在扫描…");
    try {
      const acc: WalkNode[] = [];
      await walkTree(rootCid, "", 0, acc, { dirs: 0 });
      const parentsWithChild = new Set(acc.map((item) => item.parentCid));
      const empty = acc.filter(
        (item) => item.is_dir && item.cid && !parentsWithChild.has(item.cid),
      );
      setEmptyDirs(empty);
      onNotify(empty.length ? `发现 ${empty.length} 个空文件夹` : "没有发现空文件夹");
    } catch (err) {
      onNotify(String(err));
    } finally {
      setBusy("");
      setProgress("");
    }
  }, [onNotify, rootCid]);

  const runDupes = useCallback(async () => {
    setBusy("dupes");
    setDupes([]);
    setWaste("");
    setProgress("正在扫描…");
    try {
      const acc: WalkNode[] = [];
      await walkTree(rootCid, "", 0, acc, { dirs: 0 });
      const map = new Map<string, WalkNode[]>();
      for (const file of acc) {
        if (file.is_dir || !file.sha1 || file.size < 1024 * 1024) continue;
        const list = map.get(file.sha1) ?? [];
        list.push(file);
        map.set(file.sha1, list);
      }
      const groups: DupGroup[] = [...map.entries()]
        .filter(([, files]) => files.length > 1)
        .map(([sha1, files]) => ({ sha1, sizeText: files[0].size_text, files }))
        .sort((a, b) => b.files.length - a.files.length);

      setDupes(groups);
      const total = groups.reduce((sum, group) => sum + group.files.length - 1, 0);
      setWaste(`重复 ${total} 个文件`);
      onNotify(groups.length ? `发现 ${groups.length} 组重复文件` : "没有发现重复文件");
    } catch (err) {
      onNotify(String(err));
    } finally {
      setBusy("");
      setProgress("");
    }
  }, [onNotify, rootCid]);

  const runSha1 = useCallback(async () => {
    setBusy("sha1");
    setProgress("正在扫描…");
    try {
      const acc: WalkNode[] = [];
      await walkTree(rootCid, "", 0, acc, { dirs: 0 });
      const files = acc.filter((item) => !item.is_dir);
      const rows = [
        ["name", "size", "sha1", "pick_code", "path"],
        ...files.map((file) => [
          file.name,
          String(file.size),
          file.sha1,
          file.pick_code,
          file.path,
        ]),
      ];
      const csv = rows
        .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
        .join("\r\n");
      await navigator.clipboard.writeText(csv);
      onNotify(`已导出 ${files.length} 条 SHA1，CSV 已复制到剪贴板`);
    } catch (err) {
      onNotify(String(err));
    } finally {
      setBusy("");
      setProgress("");
    }
  }, [onNotify, rootCid]);

  return (
    <main className="content">
      <div className="pathbar">
        <span className="pathbar__crumb pathbar__crumb--current">工具箱</span>
        <span className="pathbar__count">{progress || "对当前目录执行"}</span>
      </div>

      <div className="toolbox">
        <section className="tool-card">
          <div className="tool-card__head">
            <Icon name="folder" size={16} />
            <h3>空文件夹清理</h3>
          </div>
          <p>递归扫描当前目录，找出没有任何内容的文件夹。</p>
          <button
            type="button"
            className="modal__btn modal__btn--primary"
            onClick={() => void runEmpty()}
            disabled={busy !== ""}
          >
            {busy === "empty" ? "扫描中…" : "开始扫描"}
          </button>
          {emptyDirs.length > 0 ? (
            <div className="tool-result">
              {emptyDirs.map((dir) => (
                <div className="tool-result__row" key={dir.id}>
                  <span className="tool-result__name">{dir.path || dir.name}</span>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <section className="tool-card">
          <div className="tool-card__head">
            <Icon name="document" size={16} />
            <h3>重复文件查找</h3>
          </div>
          <p>按 SHA1 比对，找出内容完全相同的文件（仅比对 1 MB 以上）。</p>
          <button
            type="button"
            className="modal__btn modal__btn--primary"
            onClick={() => void runDupes()}
            disabled={busy !== ""}
          >
            {busy === "dupes" ? "扫描中…" : "开始查找"}
          </button>
          {dupes.length > 0 ? (
            <div className="tool-result">
              <div className="tool-result__summary">{waste}</div>
              {dupes.map((group) => (
                <div className="tool-result__group" key={group.sha1}>
                  <div className="tool-result__sha">
                    {group.sha1.slice(0, 12)}… · {group.sizeText} · {group.files.length} 份
                  </div>
                  {group.files.map((file) => (
                    <div className="tool-result__row" key={file.id}>
                      <span className="tool-result__name">{file.path}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <section className="tool-card">
          <div className="tool-card__head">
            <Icon name="download" size={16} />
            <h3>导出 SHA1</h3>
          </div>
          <p>把当前目录下所有文件的 SHA1、大小、pick_code 导成 CSV，复制到剪贴板。</p>
          <button
            type="button"
            className="modal__btn modal__btn--primary"
            onClick={() => void runSha1()}
            disabled={busy !== ""}
          >
            {busy === "sha1" ? "导出中…" : "导出 CSV"}
          </button>
        </section>
      </div>
    </main>
  );
}
