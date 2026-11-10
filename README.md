# otools-gomoku · 五子棋

OTools 独立插件：五子棋。双人对弈 + 电脑对手，15 路标准棋盘，纯静态实现
（原生 HTML/CSS/JS ES modules，无 npm 依赖、无打包器），引擎与 AI 是纯函数，
`node --test` 可直接测。

## 功能

| 能力 | 说明 |
| --- | --- |
| 对局模式 | 双人对弈 / 人机对战（人机可选难度与执子） |
| AI 对手 | alpha-beta + 迭代加深，三档难度，单步计算 ≤ ~0.7s |
| 规则 | 15 路自由规则：先连成 **≥5** 子者胜（长连 6 子也算胜），无禁手，黑先行，棋满判和 |
| UI | 深色主题，canvas 棋盘自适应窗口，悬停预览落点，最后一手标记，胜利五连金色高亮 |
| 比分与存档 | 黑白胜场累计；对局现场（棋盘 / 设置 / 比分）保存在 localStorage，刷新/重开插件后恢复 |
| 操作 | 点击落子、悔棋（人机模式一次悔两手）、新开一局 |

## AI 实现（`web/js/engine/gomoku.js`）

- **搜索**：negamax 形式的 alpha-beta + 迭代加深 + 时间预算（超时用上一层完整结果）；
  候选收缩——只考虑与已有棋子切比雪夫距离 ≤2 的空点，再按棋型分启发排序、限流
  （根 20 / 节点 14，「难」档）。
- **棋型评分**：五格窗口计数法——对每条线滑 5 格窗口：
  连五 > 活四（2 个冲四窗）> 冲四 > 活三（跳活三同档）> 眠三 > 活二 > 眠二；
  每个候选点同时算「我在这落子的形状」与「对方在这落子的形状」（防守价值）加权求和。
- **必胜 / 必防优先级**（搜索前直接裁决，难度无关）：
  ① 己方一步成五 → 立即下；② 对方一步成五 → 只搜堵五点；
  ③ 己方活四/双冲四点 → 立即下；④ 对方活四级威胁 → 候选收缩到（堵点 ∪ 己方冲四反击点）再搜索。
- **视界效应防护**：叶子节点带「一步成五」即时判定；被将军（对方有冲四）时只搜堵点
  并延伸搜索（不耗深度），四连对杀不会被深度截断。
- **评估**：全盘按线增量维护（每手只重算穿过落点的 ≤4 条线），节点开销低。

| 难度 | 深度 | 时间预算 | 候选数（根 / 节点） |
| --- | --- | --- | --- |
| 易 | 固定 2 层 | 120ms | 10 / 8 |
| 中（默认） | 迭代加深 ≤8 | 300ms | 14 / 10 |
| 难 | 迭代加深 ≤12 | 700ms | 20 / 14 |

固定战术局面（成五点、必防成五、堵活三、双三机会）由 `tests/ai.test.js` 断言应着。

## 目录结构

```
otools-gomoku/
├── plugin.json            # 插件清单（entry: dist/index.html）
├── logo.svg               # 插件图标（自绘：棋盘 + 黑五连高亮）
├── web/                   # 前端源码（build 直接拷贝到 dist/）
│   ├── index.html         # 入口，含 OTools 宿主桥（window.otoolsPlugin）
│   ├── style.css          # 深色主题样式（窄屏上下布局）
│   └── js/
│       ├── engine/gomoku.js  # 规则 + AI（纯函数、无 DOM，node 可 import）
│       └── ui/               # board.js（canvas 渲染）、app.js（对局状态）、main.js（启动）
├── tests/                 # node --test 测试（胜负判定 / AI 战术 / 合法性）
├── scripts/               # 模板自带构建 / 打包 / 发布脚本（未改动）
└── docs/SPEC.md           # 实现规格
```

## 快速开始

```bash
# 运行测试（胜负判定、AI 固定战术局面应着、随机对弈合法性）
node --test tests/

# 构建（web 模式：web/ → dist/，产物入库）
node scripts/build-web.mjs

# 本地预览
node scripts/serve-dist.mjs
```

## 宿主桥

`web/index.html` 完整保留了模板的 OTools 宿主桥脚本：宿主通过
`window.otools` / `window.utools` 或 `window.__TAURI_INTERNALS__.invoke` 注入能力，
桥统一暴露为 `window.otoolsPlugin`；两条通道都不通（把 dist 拖进普通浏览器）就退回
浏览器原生行为。五子棋本身只用 `available()` 在面板上显示「OTools 宿主」徽标，
对局存档走 localStorage；以后要加「导出棋谱 / 导入对局」直接调
`otoolsPlugin.saveText / openText` 即可。

## 设置行为

- 切换 **模式** 或 **执子** 会立即新开一局；调整 **难度** 即时生效、不打断当前对局。
- 人机模式执白时，AI 执黑开局下天元；AI 计算期间状态栏显示「对手思考中…」，
  且**先渲染玩家的落子再进入同步计算**（rAF + 短延时）。
- 比分累计黑白胜场；悔棋悔掉终局一手时会回退该局比分。

## 发布

与模板一致：`plugin.json` 的 `version` 与 tag `v<version>` 一致后，CI
（`.github/workflows/release-plugin.yml`）自动构建 + 打包 `.oplg`；是否上架市场由仓库
变量 `OTOOLS_PUBLISH_MARKET` 控制。本地可先打包校验：

```bash
node scripts/pack-plugin.mjs --out dist-pack --version 0.1.0
node scripts/verify-plugin.mjs dist-pack
```
