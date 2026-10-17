<div align="center">

<img src="app-icon.svg" width="88" height="88" alt="115 Desktop icon">

# 115 Desktop

轻量的第三方 115 网盘桌面客户端 · 安装包约 5 MB

[![build](https://img.shields.io/github/actions/workflow/status/daidairui103514/115-Desktop/build.yml?branch=main&label=build)](https://github.com/daidairui103514/115-Desktop/actions/workflows/build.yml)
[![release](https://img.shields.io/github/v/release/daidairui103514/115-Desktop?include_prereleases&label=release)](https://github.com/daidairui103514/115-Desktop/releases)
[![license](https://img.shields.io/github/license/daidairui103514/115-Desktop)](LICENSE)
[![platform](https://img.shields.io/badge/platform-Windows-0078D6)](https://github.com/daidairui103514/115-Desktop/releases)

[特性](#特性) · [安装](#安装) · [开发](#开发) · [构建](#构建) · [数据存放](#数据存放) · [路线图](#路线图)

</div>

---

## 简介

115 Desktop 是一个基于 **Tauri 2** 的第三方 115 网盘客户端。它复用 Windows 自带的 WebView2 渲染界面，不打包 Chromium，因此安装体积只有 5 MB 左右，冷启动和内存占用都接近原生应用。

界面参考 macOS Finder 的信息层级：毛玻璃侧边栏、紧凑列表、常驻检查器，同时保留 Windows 的操作习惯。

> 项目处于早期阶段，当前版本可浏览界面与交互，115 API 通道尚未接入。

## 特性

**界面**

- 无边框窗口，自绘交通灯与毛玻璃标题栏
- 浅色 / 深色主题，跟随系统或手动切换
- 文件列表与网格双视图，点击表头排序，文件夹恒定置顶
- 实时搜索过滤，右侧检查器展示媒体信息与 SHA1
- 底部传输状态栏

**工程**

- 安装包约 5 MB，内存占用低
- 所有运行时数据写在程序目录，不污染系统盘
- 构建全部在 GitHub Actions 完成，无需本地 Rust 工具链

## 安装

从 [Releases](https://github.com/daidairui103514/115-Desktop/releases) 下载 `115 Desktop_x.x.x_x64-setup.exe`，双击安装。

也可以在 [Actions](https://github.com/daidairui103514/115-Desktop/actions/workflows/build.yml) 的最近一次运行底部下载 Artifacts：

| 文件 | 用途 |
|---|---|
| `115 Desktop_0.1.0_x64-setup.exe` | NSIS 安装包，可选安装目录 |
| `desktop115.exe` | 免安装，直接运行 |

> 安装包未做代码签名，Windows SmartScreen 会提示「已保护你的电脑」。点击「更多信息」→「仍要运行」即可。

**系统要求**：Windows 10 1803 及以上 / Windows 11，需具备 WebView2 运行时（Win11 与更新版 Win10 已内置）。

## 开发

需要 Node.js 20+ 与 Rust stable。

```bash
npm install
npm run dev        # 只启动前端，浏览器预览，无原生能力
npm run tauri dev  # 启动完整桌面窗口
```

## 构建

构建不在本地进行，推送到 `main` 由 GitHub Actions 自动完成：

```bash
git push origin main
```

流程见 [`.github/workflows/build.yml`](.github/workflows/build.yml)：安装依赖 → 由 `app-icon.svg` 生成图标 → 前端 `tsc --noEmit && vite build` → Rust release 编译 → NSIS 打包 → 上传 Artifacts。

推送 `v*` 标签会额外创建草稿 Release：

```bash
git tag v0.1.0 && git push origin v0.1.0
```

## 数据存放

程序是**绿色便携**的：所有运行时数据（WebView2 缓存、配置、日志）都写在可执行文件同级的 `data` 目录，不使用 `%APPDATA%` 或 `%LOCALAPPDATA%`。

```
115 Desktop/
├─ 115 Desktop.exe
└─ data/            # 运行后自动生成
   ├─ EBWebView/    # 浏览器内核缓存
   └─ ...
```

因此整个目录可以直接拷贝到其他磁盘或 U 盘使用；卸载时删掉目录即可，系统盘不留残留。

## 项目结构

```
├─ .github/workflows/build.yml   # Windows 构建流水线
├─ app-icon.svg                  # 图标源文件，构建时生成各尺寸
├─ src/
│  ├─ components/                # 标题栏、侧边栏、文件列表、检查器、传输条
│  ├─ pages/                     # 页面级组件
│  ├─ lib/                       # 类型、示例数据、窗口控制
│  └─ styles/                    # 设计令牌与全局样式
└─ src-tauri/
   ├─ src/lib.rs                 # 窗口创建、便携数据目录、插件注册
   ├─ capabilities/default.json  # 权限声明
   └─ tauri.conf.json            # 打包与安全配置
```

## 路线图

- [x] 应用骨架与 macOS 风格界面
- [x] Windows 构建流水线
- [x] 便携式数据目录
- [ ] 扫码登录与令牌管理
- [ ] 文件列表 / 上传 / 下载接入真实 API
- [ ] 重命名（含改后缀）、移动、复制、删除、批量操作
- [ ] 视频源码播放与外部播放器调用
- [ ] 离线下载、剪贴板监听、RSS 订阅
- [ ] WebDAV / MCP 本地服务
- [ ] STRM 生成、文件备份、ED2K 生成
- [ ] 海报墙媒体库

## 参与贡献

欢迎提 Issue 反馈问题或建议功能。提交代码前请确保 `npm run build` 通过，并保持现有的组件与样式组织方式。

## 免责声明

本项目为个人学习与自用工具，与 115 官方无任何关联。请遵守 115 服务条款，不得用于商业用途或任何违规场景。使用本软件产生的后果由使用者自行承担。

## 许可证

[MIT](LICENSE)
