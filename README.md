# 羽毛球双打战术实验室

一个用中文解释双打击球与搭档跑位的静态教学网站。五个入口提供 2–4 拍引导教学；`#/board` 提供连续自由回合：四人和球独立摆放，手绘球路、确认球种、选择接球人，逐拍观察四人的实际跑位、阵型和搭档覆盖。可播放、撤销、分支、比较并保存回合。两种流程共用同一套逐拍核心引擎。

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
- `src/engine/coreRally.ts` 负责规则／物理成立性、执行难度、战术质量、羽毛球轨迹、四人可达移动、T2 阵型、接球候选与下一状态。引导教学与自由回合复用它；`analyze.ts` 只组织有依据的 0–3 个教学候选。
- `src/engine/simulationParameters.ts` 集中版本化飞行、启动、速度、平衡、Reach 和难度等教学参数。结果可复现，不使用随机跑位。
- `src/visualization/` 将米制球场坐标投影为 SVG；屏幕尺寸不参与战术计算。`src/storage/` 用 IndexedDB v2 保存球员、旧教学局面和不可变的自由回合历史。
- `docs/research.md` 只保存来源索引、原创中文归纳和 Evidence ID；不收录第三方教材 PDF、长篇原文或截图。

竞赛规则与训练建议分开。当前规则依据及核验边界见网站“战术依据／资料来源”页和 `docs/research.md`。规则版本按生效日期选择；未核验的新版本不会自动启用。正式男双、女双、混双与自定义训练组合分别标识。

## 限制

运动与战术建议是教学启发式，未用比赛数据或运动捕捉校准，不能精确预测现实到位时间，也不表示获胜概率。自由回合本版提供自动跑位和逐人“保持原位”；手动拖动一拍内的跑位留待后续版本。没有账户、服务器或运行时 AI API。浏览器数据清除、无痕模式结束或更换设备会失去本地保存内容。未有充分直接证据的“半场机会球”等场景暂不作为公开预设。

## 部署

Vite `base` 固定为 `/badminton-doubles-tactical-lab/`，页面使用 HashRouter。推送到 `main` 后，GitHub Actions 先运行类型检查、Lint、单元测试、构建与 Chromium 端到端检查，全部通过才部署 Pages。仓库 Settings → Pages → Build and deployment → Source 应选择 **GitHub Actions**。
