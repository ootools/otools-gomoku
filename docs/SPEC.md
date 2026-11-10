# otools-gomoku 实现规格（五子棋）

OTools 独立插件：五子棋——双人对弈 + 电脑对手。纯静态实现（原生 HTML/CSS/JS ES modules，无 npm/打包器）。

## plugin.json

```json
{
  "uuid": "otools-gomoku", "packid": "otools-gomoku",
  "displayName": "Gomoku", "displayNameCN": "五子棋",
  "developerName": "OTools", "summary": "双人对弈与电脑对手，15 路标准棋盘，流畅的 AI 对战。",
  "version": "0.1.0", "entry": "dist/index.html",
  "devUrl": "http://127.0.0.1:6543", "quickDev": true, "hasAd": false,
  "inPluginPurchase": false, "openInBrowser": false,
  "logo": "logo.svg", "icon": "⚪", "screenshots": [],
  "key": ["五子棋", "五连珠", "对弈", "AI", "gomoku", "gomoku ai"]
}
```

## 目录与公共约定

- `web/index.html`：入口，**保留模板 OTools 宿主桥脚本**（含 "otools" 字样）。深色主题。
- `web/js/engine/gomoku.js`（规则+AI，纯函数无 DOM，node --test 可 import）；`web/js/ui/`；`tests/`（仓库根）：`node --test tests/` 全绿。
- `node scripts/build-web.mjs` → dist/（构建产物按模板惯例 gitignore 不入库，CI 出 artifact）。
- 棋盘 canvas 15×15，木纹/深色棋盘均可，窗口缩放自适应，天元与星位。

## 规则

- 15 路自由规则：先成 **≥5** 连者胜（长连也算胜，无禁手；README 注明）。
- 黑先行；胜利即时判定（横竖斜四方向）；平盘（棋满）判和。

## 电脑对手（核心）

- alpha-beta + **迭代加深**（时间预算 ~700ms，超时用上一层结果）+ 候选收缩（已有棋子切比雪夫距离 ≤2 的空点）+ 启发排序。
- 棋型评分：连五 / 活四 / 冲四 / 活三 / 眠三 / 活二 / 眠二，进攻与防守加权；先搜己方能成五/活四点、再堵对方成五/活四点（必胜/必防优先级）。
- 难度三档：易（固定 2 层、少候选）、中（默认，迭代加深 300ms）、难（700ms + 更多候选）。
- 计算期间 UI 显示「对手思考中…」；直接同步计算可接受（≤1s），但必须先渲染玩家落子再计算。
- 执子选择：玩家执黑或执白（执白时 AI 开局天元）。

## UI

- 模式：双人 / 人机（难度 + 执子选择）。
- 点击落子（悬停预览落点）；最后一手标记；**胜利时高亮五连线**并弹结果；比分累计（黑白胜场）；悔棋（人机模式一次悔两手）；新开一局；localStorage 保存比分与进行中对局。
- 左棋盘右面板（或窄屏上下布局），操作按钮清晰。

## 测试清单（node --test）

1. 胜负判定：横、竖、两条斜线、长连（6 子）各一个样本；棋满和棋。
2. 必胜/必防：AI 能立即找到成五点；对方活三能正确封堵（固定局面断言 AI 应着）。
3. AI 合法性：随机对弈 50 步无非法着法、无异常。
