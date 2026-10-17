# 115 Desktop

轻量的第三方 115 网盘桌面客户端。基于 **Tauri 2 + React + TypeScript**，当前构建目标为 Windows。

> 当前处于 **UI 骨架阶段**：文件浏览、排序、搜索、详情、传输状态已可交互，数据为本地示例。115 API 通道与本地服务能力在路线图中。

---

## 为什么不用 Electron

| | 115 Desktop (Tauri 2) | Electron 同类方案 |
|---|---|---|
| 安装包体积 | ~5 MB | ~120 MB |
| 内存占用 | 低（复用系统 WebView） | 高（自带 Chromium） |
| 冷启动 | 快 | 慢 |
| 系统集成 | 原生窗口 / 托盘 | 需额外适配 |

Windows 端复用系统自带的 WebView2，不打包浏览器内核。

## 功能

### 已实现（v0.1）

- macOS 风格无边框窗口：毛玻璃标题栏、交通灯、深浅色主题
- 文件列表 / 网格双视图，点击表头排序，文件夹优先
- 实时搜索过滤
- 右侧检查器：媒体信息、SHA1、标签、快捷操作
- 底部传输状态栏

### 计划中

**文件管理** — 重命名（含改后缀）、移动 / 复制 / 删除、批量操作、回收站、文件夹大小统计
**预览播放** — 图片预览、视频源码播放、外部播放器（PotPlayer / VLC / IINA）、在线解压、字幕匹配
**传输** — 拖拽上传、并发控制、断点续传、秒传检测、Aria2 / BitComet 对接
**离线与资源** — 剪贴板监听、磁力 / ED2K 离线、RSS 订阅、磁力搜索
**账号** — 扫码登录、多账号切换、跨账号迁移
**本地服务** — WebDAV、MCP、STRM 生成、文件夹自动备份、ED2K 生成、哈希导出
**媒体库** — 海报墙视图（独立页面，规划中）

## 技术栈

- **壳**：Tauri 2（Rust）
- **前端**：React 18 + TypeScript + Vite
- **样式**：原生 CSS 变量 + 设计令牌，无 UI 框架依赖
- **构建**：GitHub Actions，产物为 NSIS 安装包

## 构建

本项目 **不在本地编译**，全部构建在 CI 完成。

推送到 `main` 触发 `.github/workflows/build.yml`：

| Job | 产物 |
|---|---|
| `windows-x64` | `115 Desktop_0.1.0_x64-setup.exe`（NSIS 安装包） |

产物在对应 Actions 运行的 **Artifacts** 中下载。打 `v*` 标签时自动创建草稿 Release。

### 本地开发（可选）

```bash
npm install
npm run dev        # 仅前端，浏览器预览
npm run tauri dev  # 完整桌面窗口
```

## 目录结构

```
├─ .github/workflows/build.yml   # Tauri 三平台构建
├─ app-icon.svg                  # 应用图标源文件，CI 生成各尺寸
├─ src/
│  ├─ components/                # 标题栏、侧边栏、文件列表、检查器、传输条
│  ├─ pages/                     # 页面级组件
│  ├─ lib/                       # 类型、示例数据、窗口控制
│  └─ styles/                    # 设计令牌与全局样式
└─ src-tauri/
   ├─ src/lib.rs                 # 插件注册与窗口初始化
   ├─ capabilities/default.json  # 权限声明
   └─ tauri.conf.json            # 窗口与打包配置
```

> 图标不纳入版本库：CI 用 `npx tauri icon app-icon.svg` 从 SVG 生成 `src-tauri/icons/`。
> 本地跑 `npm run tauri build` 前需要先执行同一命令。

## 设计

- 字体栈优先 `SF Pro Text` / `PingFang SC`，Windows 回退 `Segoe UI Variable`
- 三层分离：毛玻璃侧边栏 / 白色内容层 / 浅灰检查器，靠 1px 线分隔而非投影
- 强调色 `#007AFF`（浅色）/ `#0A84FF`（深色），颜色主要来自内容缩略图本身
- 行高 28px，13px 正文，贴近 macOS Finder 的密度

## 免责声明

本项目为个人学习与自用工具，与 115 官方无关联。请遵守 115 服务条款，勿用于任何商业或违规用途。
