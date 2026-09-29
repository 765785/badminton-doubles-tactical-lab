# 羽毛球双打战术实验室

一个用中文解释双打击球与搭档跑位的静态教学网站。四名球员分别编辑，拖动斜视球场上的球员与羽毛球后，可查看 0–3 条有条件、有证据编号的建议，选择对方回应并播放逐拍战术链。局面和球员名片保存在当前浏览器的 IndexedDB。

在线网站：<https://765785.github.io/badminton-doubles-tactical-lab/>。2026-09-29 已通过公开网址访问、资源检查和 Chromium 基础功能验收。

## 本地运行

需要兼容 Vite 8 的 Node.js 版本。执行：

```sh
npm ci
npm run dev
```

打开终端显示的 `/badminton-doubles-tactical-lab/` 地址。生产构建和本地预览：

```sh
npm run build
npm run preview
```

检查：`npm run typecheck`、`npm run lint`、`npm run test`、`npx playwright install chromium`、`npm run test:e2e`。构建输出为 `dist/`。

如需对线上站点重复浏览器验收，可在运行 `npm run test:e2e` 前设置 `E2E_BASE_URL=https://765785.github.io/badminton-doubles-tactical-lab/`；网络环境需要代理时另设 `E2E_PROXY`。

## 设计与资料原则

- `src/domain/` 定义四名独立球员、球场、竞赛／训练组合和 18 项能力；性别不修改能力值。
- `src/knowledge/` 维护规则版本、Evidence ID 和经过核验的教学场景。
- `src/engine/analyze.ts` 是与界面解耦的纯函数。先校验球场与发球条件，再生成、过滤、排序候选。内部排序分不是胜率，证据不足时返回零条并给出中文修改指引。
- `src/visualization/` 用球场坐标计算并以 SVG 投影显示，`src/ui/` 处理编辑、选择和播放，`src/storage/` 用版本化 IndexedDB 保存。
- `docs/research.md` 只保存来源索引、原创中文归纳和 Evidence ID；不收录第三方教材 PDF、长篇原文或截图。

竞赛规则与训练建议分开。当前规则依据及核验边界见网站“战术依据／资料来源”页和 `docs/research.md`。规则版本按生效日期选择；未核验的新版本不会自动启用。正式男双、女双、混双与自定义训练组合分别标识。

## 限制

战术建议是条件化教学启发式，未由比赛数据校准为获胜概率；没有账户、服务器或运行时 AI API。浏览器数据清除、无痕模式结束或更换设备会失去本地保存内容。未有充分直接证据的“半场机会球”等场景暂不作为公开预设。

## 部署

Vite `base` 固定为 `/badminton-doubles-tactical-lab/`，页面使用 HashRouter。推送到 `main` 后，GitHub Actions 先运行类型检查、Lint、单元测试、构建与 Chromium 端到端检查，全部通过才部署 Pages。仓库 Settings → Pages → Build and deployment → Source 应选择 **GitHub Actions**。
