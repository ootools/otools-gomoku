/**
 * 五子棋引擎（规则 + AI）。
 * ------------------------------------------------------------------
 * 纯函数、无 DOM 依赖：node --test 可直接 import，浏览器里由 UI 层调用。
 *
 * 规则：15 路自由规则，黑先行，先连成 ≥5 子者胜（长连 6 子也算胜），无禁手；
 *       棋满判和。
 *
 * AI：alpha-beta（negamax）+ 迭代加深 + 时间预算 + 候选收缩
 *     （只搜与已有棋子切比雪夫距离 ≤2 的空点）+ 棋型评分启发排序。
 *
 * 棋型评分用「五格窗口计数」：对每条线滑一个 5 格窗口，
 *   5 全己子 = 连五；4 子 1 空 = 冲四窗（活四 = 2 窗）；3 子 2 空 = 活三窗
 *   （跳活三同档）；3 子 1 空 = 眠三性质小分；2 子 3 空 = 活二……
 *   进攻（己方落子形状）与防守（堵对方形状）加权求和。
 *
 * 必胜 / 必防优先级（搜索前直接裁决）：
 *   1) 己方一步成五          → 立即下
 *   2) 对方一步成五          → 只搜堵五点
 *   3) 己方活四 / 双冲四点   → 立即下
 *   4) 对方活四级威胁点      → 候选收缩到（堵点 ∪ 己方冲四反击点）再搜索
 *
 * 搜索内部：叶子节点带「一步成五」即时判定，且被将军（对方有冲四）时
 * 只搜堵点并延伸搜索（不计深度），杜绝四连被深度截断的视界效应。
 */

// ---------------------------------------------------------------- 基础常量

export const SIZE = 15;
export const CELL_COUNT = SIZE * SIZE;
export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = 2;

export function idx(r, c) {
  return r * SIZE + c;
}
export function rowOf(i) {
  return (i / SIZE) | 0;
}
export function colOf(i) {
  return i % SIZE;
}
export function inBounds(r, c) {
  return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
}
/** 天元 */
export const CENTER = idx(7, 7);

const DIRS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

// ---------------------------------------------------------------- 规则

export function createBoard() {
  return new Uint8Array(CELL_COUNT);
}

export function isBoardFull(board) {
  for (let i = 0; i < CELL_COUNT; i++) {
    if (board[i] === EMPTY) return false;
  }
  return true;
}

/**
 * 胜负 / 和棋判定（胜利即时判定，四方向，≥5 连即胜，长连也算胜）。
 * @returns {{status:'playing'} | {status:'win', player:number, line:number[]} | {status:'draw'}}
 */
export function getGameResult(board, lastIdx) {
  if (lastIdx == null || lastIdx < 0) {
    return isBoardFull(board) ? { status: 'draw' } : { status: 'playing' };
  }
  const p = board[lastIdx];
  if (p === EMPTY) return { status: 'playing' };
  const r0 = rowOf(lastIdx);
  const c0 = colOf(lastIdx);
  for (let d = 0; d < 4; d++) {
    const dr = DIRS[d][0];
    const dc = DIRS[d][1];
    const line = [lastIdx];
    for (let s = 1; ; s++) {
      const r = r0 + dr * s;
      const c = c0 + dc * s;
      if (!inBounds(r, c) || board[idx(r, c)] !== p) break;
      line.push(idx(r, c));
    }
    for (let s = 1; ; s++) {
      const r = r0 - dr * s;
      const c = c0 - dc * s;
      if (!inBounds(r, c) || board[idx(r, c)] !== p) break;
      line.unshift(idx(r, c));
    }
    if (line.length >= 5) return { status: 'win', player: p, line };
  }
  if (isBoardFull(board)) return { status: 'draw' };
  return { status: 'playing' };
}

/** 从 cell 出发沿 4 方向数连子，判断刚下的这手是否成 ≥5 连。 */
export function isWinAt(board, cell, player) {
  const r0 = rowOf(cell);
  const c0 = colOf(cell);
  for (let d = 0; d < 4; d++) {
    const dr = DIRS[d][0];
    const dc = DIRS[d][1];
    let count = 1;
    for (let s = 1; s < 5; s++) {
      const r = r0 + dr * s;
      const c = c0 + dc * s;
      if (!inBounds(r, c) || board[idx(r, c)] !== player) break;
      count++;
    }
    for (let s = 1; s < 5; s++) {
      const r = r0 - dr * s;
      const c = c0 - dc * s;
      if (!inBounds(r, c) || board[idx(r, c)] !== player) break;
      count++;
    }
    if (count >= 5) return true;
  }
  return false;
}

// ---------------------------------------------------------------- 棋型分值

/** 连五（一条线上出现即终局级）。 */
const SCORE_FIVE = 1000000;
/** 一个冲四窗（4 己子 + 1 空）。活四 = 同线 2 窗；双冲四跨方向同档。 */
const W_FOUR = 10000;
/** 一个活三窗（3 己子 + 2 空，跳活三同档）。 */
const W_THREE = 2000;
/** 眠三性质小分（3 子 1 空，只能成冲四）。 */
const W_THREE_GAP = 300;
/** 一个活二窗。 */
const W_TWO = 200;
const W_TWO_GAP = 25;
const W_ONE = 10;
/** 活四 / 双冲四级别 = 必胜级威胁阈值。 */
const T_LIVE4 = W_FOUR * 2;
/** 搜索里的终局分（远大于任何局面分，且按 ply 修正 prefer 快胜）。 */
const WIN_SCORE = 1000000000;

function shapeScore(s, e) {
  if (s === 4) return e === 1 ? W_FOUR : 0;
  if (s === 3) return e === 2 ? W_THREE : e === 1 ? W_THREE_GAP : 0;
  if (s === 2) return e === 3 ? W_TWO : e === 2 ? W_TWO_GAP : 0;
  if (s === 1) return e === 4 ? W_ONE : 0;
  return 0;
}

// ---------------------------------------------------------------- 线表（评估用）

/** 所有长度 ≥5 的直线（行 / 列 / 两向对角线），评估按线增量维护。 */
const LINES = [];
/** 每个格所属的线 id（≤4 条）。 */
const CELL_LINES = Array.from({ length: CELL_COUNT }, () => []);

(function buildLines() {
  const push = (cells) => {
    if (cells.length < 5) return;
    const id = LINES.length;
    LINES.push(Int16Array.from(cells));
    for (const i of cells) CELL_LINES[i].push(id);
  };
  for (let r = 0; r < SIZE; r++) {
    push(Array.from({ length: SIZE }, (_, c) => idx(r, c)));
  }
  for (let c = 0; c < SIZE; c++) {
    push(Array.from({ length: SIZE }, (_, r) => idx(r, c)));
  }
  // ↘ 对角线 r-c = d，长度 = SIZE-|d| ≥ 5
  for (let d = -(SIZE - 5); d <= SIZE - 5; d++) {
    const cells = [];
    for (let r = 0; r < SIZE; r++) {
      const c = r - d;
      if (inBounds(r, c)) cells.push(idx(r, c));
    }
    push(cells);
  }
  // ↗ 反对角线 r+c = s，长度 ≥ 5
  for (let s = SIZE - 1 - (SIZE - 5); s <= SIZE - 1 + (SIZE - 5); s++) {
    const cells = [];
    for (let r = 0; r < SIZE; r++) {
      const c = s - r;
      if (inBounds(r, c)) cells.push(idx(r, c));
    }
    push(cells);
  }
})();

const LINE_SCRATCH = new Float64Array(4); // [黑分, 黑冲四窗, 白分, 白冲四窗]

function scoreLineBoth(cells, b) {
  const n = cells.length;
  let sB = 0, fB = 0, sW = 0, fW = 0, fiveB = false, fiveW = false;
  for (let w = 0; w + 5 <= n; w++) {
    let cb = 0, ce = 0;
    for (let k = w; k < w + 5; k++) {
      const v = b[cells[k]];
      if (v === BLACK) cb++;
      else if (v === EMPTY) ce++;
    }
    const cw = 5 - cb - ce;
    if (cb === 5) fiveB = true;
    else {
      const sc = shapeScore(cb, ce);
      if (sc) sB += sc;
      if (cb === 4 && ce === 1) fB++;
    }
    if (cw === 5) fiveW = true;
    else {
      const sc = shapeScore(cw, ce);
      if (sc) sW += sc;
      if (cw === 4 && ce === 1) fW++;
    }
  }
  LINE_SCRATCH[0] = fiveB ? SCORE_FIVE : sB;
  LINE_SCRATCH[1] = fB;
  LINE_SCRATCH[2] = fiveW ? SCORE_FIVE : sW;
  LINE_SCRATCH[3] = fW;
}

// ---------------------------------------------------------------- 搜索上下文

function createCtx(board) {
  const b = Uint8Array.from(board);
  const nL = LINES.length;
  const lineScore = new Float64Array(nL * 2);
  const lineFour = new Int32Array(nL * 2);
  const totals = new Float64Array(2); // [黑总分, 白总分]
  const fourWin = new Int32Array(2); // [黑冲四窗数, 白冲四窗数]；>0 ⟺ 该方存在一步成五点
  const near = new Int16Array(CELL_COUNT); // 切比雪夫距离 ≤2 内的棋子数（候选收缩）
  for (let l = 0; l < nL; l++) {
    scoreLineBoth(LINES[l], b);
    lineScore[l * 2] = LINE_SCRATCH[0];
    lineFour[l * 2] = LINE_SCRATCH[1];
    lineScore[l * 2 + 1] = LINE_SCRATCH[2];
    lineFour[l * 2 + 1] = LINE_SCRATCH[3];
    totals[0] += LINE_SCRATCH[0];
    totals[1] += LINE_SCRATCH[2];
    fourWin[0] += LINE_SCRATCH[1];
    fourWin[1] += LINE_SCRATCH[3];
  }
  for (let i = 0; i < CELL_COUNT; i++) {
    if (b[i] === EMPTY) continue;
    const r0 = rowOf(i);
    const c0 = colOf(i);
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        const r = r0 + dr;
        const c = c0 + dc;
        if (inBounds(r, c)) near[idx(r, c)]++;
      }
    }
  }
  return {
    b, near, lineScore, lineFour, totals, fourWin,
    toMove: BLACK, nodes: 0, deadline: Infinity, candNode: 10,
  };
}

function applyMove(ctx, cell, player) {
  const lines = CELL_LINES[cell];
  for (let k = 0; k < lines.length; k++) {
    const l = lines[k];
    ctx.totals[0] -= ctx.lineScore[l * 2];
    ctx.totals[1] -= ctx.lineScore[l * 2 + 1];
    ctx.fourWin[0] -= ctx.lineFour[l * 2];
    ctx.fourWin[1] -= ctx.lineFour[l * 2 + 1];
  }
  ctx.b[cell] = player;
  for (let k = 0; k < lines.length; k++) {
    const l = lines[k];
    scoreLineBoth(LINES[l], ctx.b);
    ctx.lineScore[l * 2] = LINE_SCRATCH[0];
    ctx.lineFour[l * 2] = LINE_SCRATCH[1];
    ctx.lineScore[l * 2 + 1] = LINE_SCRATCH[2];
    ctx.lineFour[l * 2 + 1] = LINE_SCRATCH[3];
    ctx.totals[0] += LINE_SCRATCH[0];
    ctx.totals[1] += LINE_SCRATCH[2];
    ctx.fourWin[0] += LINE_SCRATCH[1];
    ctx.fourWin[1] += LINE_SCRATCH[3];
  }
  const r0 = rowOf(cell);
  const c0 = colOf(cell);
  for (let dr = -2; dr <= 2; dr++) {
    for (let dc = -2; dc <= 2; dc++) {
      const r = r0 + dr;
      const c = c0 + dc;
      if (inBounds(r, c)) ctx.near[idx(r, c)]++;
    }
  }
}

function undoMove(ctx, cell, player) {
  const lines = CELL_LINES[cell];
  for (let k = 0; k < lines.length; k++) {
    const l = lines[k];
    ctx.totals[0] -= ctx.lineScore[l * 2];
    ctx.totals[1] -= ctx.lineScore[l * 2 + 1];
    ctx.fourWin[0] -= ctx.lineFour[l * 2];
    ctx.fourWin[1] -= ctx.lineFour[l * 2 + 1];
  }
  ctx.b[cell] = EMPTY;
  for (let k = 0; k < lines.length; k++) {
    const l = lines[k];
    scoreLineBoth(LINES[l], ctx.b);
    ctx.lineScore[l * 2] = LINE_SCRATCH[0];
    ctx.lineFour[l * 2] = LINE_SCRATCH[1];
    ctx.lineScore[l * 2 + 1] = LINE_SCRATCH[2];
    ctx.lineFour[l * 2 + 1] = LINE_SCRATCH[3];
    ctx.totals[0] += LINE_SCRATCH[0];
    ctx.totals[1] += LINE_SCRATCH[2];
    ctx.fourWin[0] += LINE_SCRATCH[1];
    ctx.fourWin[1] += LINE_SCRATCH[3];
  }
  const r0 = rowOf(cell);
  const c0 = colOf(cell);
  for (let dr = -2; dr <= 2; dr++) {
    for (let dc = -2; dc <= 2; dc++) {
      const r = r0 + dr;
      const c = c0 + dc;
      if (inBounds(r, c)) ctx.near[idx(r, c)]--;
    }
  }
}

// ---------------------------------------------------------------- 候选与打分

/**
 * 单点落子预演分：穿过该点 4 个方向的 9 格线上 5 格窗口打分之和。
 * 任一方向能直接成五 → 返回 SCORE_FIVE。
 */
function pointScore(b, cell, player) {
  const r0 = rowOf(cell);
  const c0 = colOf(cell);
  let total = 0;
  for (let d = 0; d < 4; d++) {
    const dr = DIRS[d][0];
    const dc = DIRS[d][1];
    let five = false;
    for (let w = 0; w < 5 && !five; w++) {
      let s = 0, e = 0;
      for (let k = w; k < w + 5; k++) {
        if (k === 4) {
          s++; // 中心即假设落下的己子
          continue;
        }
        const r = r0 + (k - 4) * dr;
        const c = c0 + (k - 4) * dc;
        if (!inBounds(r, c)) continue; // 出界同挡子
        const v = b[idx(r, c)];
        if (v === EMPTY) e++;
        else if (v === player) s++;
      }
      if (s === 5) five = true;
      else total += shapeScore(s, e);
    }
    if (five) return SCORE_FIVE;
  }
  return total;
}

const byScore = (x, y) => y.s - x.s;

/**
 * 生成候选着法（切比雪夫距离 ≤2 的空点），按 进攻+防守 分排序。
 * 战术过滤：己方成五点 → 只返回它；对方下一手成五 → 只返回堵五点。
 * 返回 [{i, s, a, d}]：a=进攻分，d=对方在此点的进攻分（即我的防守价值）。
 */
function genMoves(ctx, side, limit) {
  const b = ctx.b;
  const near = ctx.near;
  const other = 3 - side;
  const mustBlock = ctx.fourWin[other - 1] > 0;
  const moves = [];
  for (let i = 0; i < CELL_COUNT; i++) {
    if (b[i] !== EMPTY || near[i] === 0) continue;
    const a = pointScore(b, i, side);
    if (a >= SCORE_FIVE) return [{ i, s: SCORE_FIVE, a, d: 0 }]; // 己方成五：唯一选择
    const d = pointScore(b, i, other);
    if (mustBlock) {
      if (d >= SCORE_FIVE) moves.push({ i, s: d, a, d }); // 被将军：只考虑堵五点
      continue;
    }
    moves.push({ i, s: a + d, a, d });
  }
  moves.sort(byScore);
  if (mustBlock) return moves.slice(0, Math.min(limit, 4));
  return moves.length > limit ? moves.slice(0, limit) : moves;
}

/** 对方已有冲四时的堵五点（被迫应着）。 */
function genFiveBlocks(ctx, side) {
  const b = ctx.b;
  const near = ctx.near;
  const other = 3 - side;
  const out = [];
  for (let i = 0; i < CELL_COUNT; i++) {
    if (b[i] !== EMPTY || near[i] === 0) continue;
    if (pointScore(b, i, other) >= SCORE_FIVE) out.push(i);
  }
  return out;
}

function evalSide(ctx, side) {
  return ctx.totals[side - 1] - ctx.totals[2 - side];
}

// ---------------------------------------------------------------- 搜索

const ABORT = { abort: true };

function negamax(ctx, depth, alpha, beta, ply) {
  ctx.nodes++;
  if ((ctx.nodes & 127) === 0 && Date.now() > ctx.deadline) throw ABORT;
  const side = ctx.toMove;
  const other = 3 - side;
  // 己方一步成五：直接赢
  if (ctx.fourWin[side - 1] > 0) return WIN_SCORE - ply;
  if (depth <= 0) {
    if (ctx.fourWin[other - 1] > 0) {
      // 对方下一手成五（被将军）：只搜堵点并延伸搜索（不耗深度），链自然收敛
      const blocks = genFiveBlocks(ctx, side);
      let best = -Infinity;
      for (let k = 0; k < blocks.length; k++) {
        const m = blocks[k];
        applyMove(ctx, m, side);
        ctx.toMove = other;
        const sc = -negamax(ctx, 0, -beta, -alpha, ply + 1);
        ctx.toMove = side;
        undoMove(ctx, m, side);
        if (sc > best) best = sc;
        if (best > alpha) alpha = best;
        if (alpha >= beta) break;
      }
      return best === -Infinity ? evalSide(ctx, side) : best;
    }
    return evalSide(ctx, side);
  }
  const moves = genMoves(ctx, side, ctx.candNode);
  let best = -Infinity;
  for (let k = 0; k < moves.length; k++) {
    const m = moves[k].i;
    applyMove(ctx, m, side);
    ctx.toMove = other;
    let sc;
    if (isWinAt(ctx.b, m, side)) sc = WIN_SCORE - ply;
    else sc = -negamax(ctx, depth - 1, -beta, -alpha, ply + 1);
    ctx.toMove = side;
    undoMove(ctx, m, side);
    if (sc > best) best = sc;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best === -Infinity ? evalSide(ctx, side) : best; // 无空点（棋满）
}

// ---------------------------------------------------------------- 难度与入口

/**
 * 难度参数：
 *   easy   固定 2 层、少候选（约 10 点）
 *   medium 默认，迭代加深 300ms
 *   hard   迭代加深 700ms + 更多候选（根 20 / 节点 14）
 */
export const AI_LEVELS = {
  easy: { label: '易', maxDepth: 2, timeMs: 120, candRoot: 10, candNode: 8 },
  medium: { label: '中', maxDepth: 8, timeMs: 300, candRoot: 14, candNode: 10 },
  hard: { label: '难', maxDepth: 12, timeMs: 700, candRoot: 20, candNode: 14 },
};

function ensureLegal(board, mv) {
  if (mv != null && mv >= 0 && mv < CELL_COUNT && board[mv] === EMPTY) return mv;
  for (let i = 0; i < CELL_COUNT; i++) {
    if (board[i] === EMPTY) return i; // 兜底：绝不返回非法着
  }
  return null;
}

/**
 * AI 入口：为 player 选一手。
 * @param {Uint8Array} board 棋盘
 * @param {number} player 执子方
 * @param {'easy'|'medium'|'hard'|object} level 难度档名或参数对象
 * @param {object} overrides 覆盖参数（maxDepth/timeMs/candRoot/candNode）
 * @returns {number|null} 落点下标；棋满返回 null
 */
export function findBestMove(board, player = BLACK, level = 'medium', overrides = {}) {
  const base = typeof level === 'string' ? AI_LEVELS[level] || AI_LEVELS.medium : level;
  const cfg = { ...base, ...overrides };
  let hasStone = false;
  for (let i = 0; i < CELL_COUNT; i++) {
    if (board[i] !== EMPTY) {
      hasStone = true;
      break;
    }
  }
  if (!hasStone) return CENTER; // 空盘：天元

  const ctx = createCtx(board);
  ctx.candNode = cfg.candNode;
  ctx.deadline = Date.now() + Math.max(10, cfg.timeMs | 0);

  const root = genMoves(ctx, player, cfg.candRoot);
  if (root.length === 0) return null; // 棋满
  if (root.length === 1) return ensureLegal(board, root[0].i); // 成五 / 唯一堵点

  // 必胜级进攻：己方活四 / 双冲四点，直接落
  let bestAttack = null;
  for (const m of root) {
    if (m.a >= T_LIVE4 && (bestAttack === null || m.a > bestAttack.a)) bestAttack = m;
  }
  if (bestAttack) return ensureLegal(board, bestAttack.i);

  // 必防级威胁：对方有活四级点 → 候选收缩到（堵点 ∪ 己方冲四反击点）再搜索
  let pool = root;
  if (root.some((m) => m.d >= T_LIVE4)) {
    pool = root.filter((m) => m.d >= T_LIVE4 || m.a >= W_FOUR);
  }

  let best = pool[0].i;
  for (let depth = 2; depth <= cfg.maxDepth; depth++) {
    // 剩余时间不够下一层的典型开销就不再开新层（超时则用上一层完整结果）
    if (depth > 2 && ctx.deadline - Date.now() < cfg.timeMs * 0.6) break;
    let iterBest = null;
    let iterScore = -Infinity;
    let alpha = -Infinity;
    try {
      for (const m of pool) {
        applyMove(ctx, m.i, player);
        ctx.toMove = 3 - player;
        let sc;
        if (isWinAt(ctx.b, m.i, player)) sc = WIN_SCORE;
        else sc = -negamax(ctx, depth - 1, -Infinity, -alpha, 1);
        ctx.toMove = player;
        undoMove(ctx, m.i, player);
        m.last = sc;
        if (sc > iterScore) {
          iterScore = sc;
          iterBest = m;
          if (sc > alpha) alpha = sc;
        }
      }
    } catch (err) {
      if (err !== ABORT) throw err;
      break; // 超时：保留上一层完整结果
    }
    if (iterBest) {
      best = iterBest.i;
      pool.splice(pool.indexOf(iterBest), 1);
      pool.unshift(iterBest); // 上层最优优先，加速下层剪枝
    }
    if (iterScore >= WIN_SCORE - 1024) break; // 已找到必胜线
  }
  return ensureLegal(board, best);
}
