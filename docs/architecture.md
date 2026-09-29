# 技术架构

## 分层

- `domain`：米制球场坐标、四张独立球员名片、球状态、击球条件、规则版本与赛制分类。
- `knowledge`：证据索引、可追溯战术条目、已核验预设。源码只含原创中文归纳与链接，不存第三方教材文件。
- `engine`：纯函数，依次进行有效版本选择、状态检查、候选生成、可行性过滤、覆盖与空间评估、解释。返回 `AnalysisResult`，其中 `recommendations` 长度为 0–3，`issues` 说明零结果。
- `visualization`：二维球场坐标投影为斜视 SVG；羽毛球高度以地面影子和轨迹弧表示。动画只插值教学状态，不模拟真实空气动力学。
- `storage`：IndexedDB 中的球员和场景对象仓库，使用结构版本号与升级函数；UI 不直接访问数据库。
- `ui`：React 页面、球场、球员编辑、分析面板、证据页和播放控件。战术判断不得置于组件中。

## 主要接口

`PlayerCard` 包含 id、名称、性别、惯用手、简易等级、18 项 0–100 属性和可选身体参数。`CourtState` 包含四人位置、球的 x/y/z 与方向、击球者及平衡等接触条件。`RallyContext` 用独立字段表示击球阶段、主动权、交换类型、发球者和回合拍数。`LawVersion` 包含版本、生效区间、核验日期、官方 URL 与 Evidence ID。

`analyze(court, cards, context)` 不修改输入，返回可用推荐及不可用原因。`advanceRally` 根据用户选中的击球及对手回应构造下一状态；每个接触计一拍，最多四拍。预设和保存对象均带数据版本，防止以后字段调整破坏旧存档。

## 部署

React + TypeScript + Vite 构建静态文件。Vite `base` 固定为 `/badminton-doubles-tactical-lab/`，HashRouter 避免 Pages 子页面刷新 404。CI 在部署前完成类型检查、Lint、测试和生产构建；GitHub Pages 仅接收成功构建产物。浏览器端无需 API Key、服务器或账号。
