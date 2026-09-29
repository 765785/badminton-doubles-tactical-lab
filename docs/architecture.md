# 技术架构

## 两种流程，一套逐拍引擎

- `src/engine/coreRally.ts` 的 `evaluateConfirmedShot` 是纯函数，显式接收米制 `CourtState`、四张 `PlayerCard`、`RallyContext`、已确认球路、当前有效规则、证据版本、`SimulationParameters` 和运动约束。函数不读时间、不用随机数、不访问 DOM。
- `src/engine/guidedLesson.ts` 是预设教学控制器：选预设、控制 2–4 拍教学节奏、组合讲解。每次击球均调用核心引擎；推荐候选由 `analyze.ts` 生成后仍需通过相同的核心评价。
- `src/ui/SandboxPage.tsx` 是自由回合控制器：画线、确认球种、选择接球人、保存、分支和重播。它也调用相同的核心引擎，没有第二套球路、移动、覆盖或阵型算法。
- `src/engine/simulationParameters.ts` 集中版本化教学运动参数，包括飞行时间、轨迹、起步、加速、转向、失衡、恢复、覆盖、Reach、候选接球和击球难度。改数值必须提高参数版本。

同一完整输入（含接球人选择、运动约束、规则和参数版本）得到相同结果。屏幕尺寸只影响 `src/visualization/` 中的投影与指针逆变换；战术计算不读取 CSS/SVG 像素。

## 固定计算顺序

`ShotDraft` → 用户确认球种 → 规则与物理成立性 → 执行难度 → 战术质量 → 球轨迹 → 四人理想目标 → 运动约束 → 可达移动 → T2 实际位置 → 覆盖 → 双方阵型 → 四人职责 → 接球候选 → 搭档配合 → 结束条件 → 新 `CourtState` → 快照。

三类评价分别保存，不合成单一分数。内部战术排序分不是胜率。候选接球人各有独立的 T2 四人结果；两名合理候选时由用户选择，无人可达时默认落地结束。实验性假设接球在结果中显式标记，球员不会瞬移。

`hold` 约束让球员 T0→T2 的移动目标及实际位置保持在当前坐标，后续阵型、覆盖和下一拍均读取这个位置。`manualTarget` 已在接口中预留，本版不提供操作界面。

## 状态、历史与保存

- `RallySession` 以父节点引用组成分支树。`RallyShot` 创建时深拷贝球员、前后局面、三类评价、四人运动、覆盖、阵型、证据和羽毛球轨迹；后续只改变当前节点指针，不改历史节点。
- 会话和节点保存 `schemaVersion`、`engineVersion`、`simulationParametersVersion`、`evidenceDatasetVersion`。旧回合重播读取节点的实际位置与轨迹快照；从旧节点再开分支调用当前引擎，可能使用更新后的版本。
- `src/storage/localRepository.ts` 使用 IndexedDB v2，新增 `rallies` 对象仓库；原 `players` 和 `scenarios` 仓库继续可读。旧教学局面可直接打开，也可复制为新自由回合。
- 第一拍后改球员能力会从当前局面创建新会话，避免更改旧节点的名片和结果。

## 模型边界

移动和球轨迹是**教学用途的启发式模型**。模型以距离、能力、平衡、启动和预计飞行时间作可复现估算，未用运动捕捉或比赛数据校准，不声称能精确预测真实人体到位时间。画线只给方向与落点，球种须用户确认；明确无法过网、出界或已落地按相应结果处理。

## 部署

React + TypeScript + Vite 构建静态文件。`base` 为 `/badminton-doubles-tactical-lab/`，HashRouter 支持 GitHub Pages 子路径。CI 在部署前完成类型检查、Lint、单测、构建与浏览器端到端测试。浏览器端无需 API Key、服务器或账号。
