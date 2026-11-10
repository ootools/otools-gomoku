/**
 * 五子棋 UI 主逻辑：模式 / 难度 / 执子、落子与悔棋、比分、
 * localStorage 持久化、AI 回合调度（先渲染玩家落子，再同步计算）。
 */
import {
  BLACK,
  WHITE,
  EMPTY,
  CELL_COUNT,
  createBoard,
  getGameResult,
  findBestMove,
} from '../engine/gomoku.js';
import { GomokuBoard } from './board.js';

const STORE_KEY = 'otools-gomoku-v1';

export class App {
  constructor() {
    this.$ = (sel) => document.querySelector(sel);
    this.view = new GomokuBoard(this.$('#board'), (cell) => this.onCellClick(cell));

    // ---- 对局状态
    this.board = createBoard();
    this.history = []; // [{i, p}]
    this.status = 'playing'; // playing | win | draw
    this.winner = 0;
    this.winLine = null;
    this.scoredGame = false; // 本局比分是否已计入（悔棋回退用）
    this.thinking = false;
    this.gameId = 0; // 新开一局/悔棋时 +1，作废挂起的 AI 计算

    // ---- 设置
    this.mode = 'ai';
    this.difficulty = 'medium';
    this.humanColor = BLACK;
    this.scores = { black: 0, white: 0 };
  }

  // ------------------------------------------------------------ 生命周期

  init() {
    this.load();
    this.view.mount(this.$('#boardArea'));
    this.view.render(this.viewState()); // 首帧绘制（含恢复的对局）

    this.$('#newBtn').addEventListener('click', () => this.newGame());
    this.$('#undoBtn').addEventListener('click', () => this.undo());
    this.wireSeg('#modeSeg', (v) => {
      if (this.mode !== v) {
        this.mode = v;
        this.newGame(); // 模式切换即重开一局
      }
    });
    this.wireSeg('#diffSeg', (v) => {
      this.difficulty = v; // 难度即时生效，不打断当前对局
      this.refreshSegs();
      this.save();
    });
    this.wireSeg('#colorSeg', (v) => {
      const color = v === 'white' ? WHITE : BLACK;
      if (this.humanColor !== color) {
        this.humanColor = color;
        this.newGame(); // 执子切换即重开一局
      }
    });

    try {
      if (window.otoolsPlugin && window.otoolsPlugin.available()) {
        this.$('#hostBadge').classList.remove('hidden');
      }
    } catch (e) { /* 宿主探测失败不影响游戏 */ }

    // 恢复的对局若正轮到 AI，则续算
    if (this.status === 'playing' && this.mode === 'ai' && this.turn === this.aiColor) {
      this.scheduleAi();
    }
    this.updateAll();
  }

  wireSeg(sel, onChange) {
    const root = this.$(sel);
    root.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-v]');
      if (!btn) return;
      root.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
      onChange(btn.dataset.v);
    });
  }

  // ------------------------------------------------------------ 状态推导

  get turn() {
    return this.history.length % 2 === 0 ? BLACK : WHITE;
  }

  get aiColor() {
    return this.mode === 'ai' ? (this.humanColor === BLACK ? WHITE : BLACK) : 0;
  }

  get humanTurn() {
    return this.status === 'playing' && !this.thinking && (this.mode === 'pvp' || this.turn === this.humanColor);
  }

  // ------------------------------------------------------------ 落子流程

  onCellClick(cell) {
    if (!this.humanTurn) return;
    if (this.board[cell] !== EMPTY) return;
    this.doMove(cell);
  }

  doMove(cell) {
    const player = this.turn;
    this.board[cell] = player;
    this.history.push({ i: cell, p: player });
    const res = getGameResult(this.board, cell);
    if (res.status === 'win') {
      this.status = 'win';
      this.winner = res.player;
      this.winLine = res.line;
      this.scores[res.player === BLACK ? 'black' : 'white']++;
      this.scoredGame = true;
    } else if (res.status === 'draw') {
      this.status = 'draw';
    }
    this.view.render(this.viewState());
    this.updateAll();
    this.save();
    if (this.status === 'playing' && this.mode === 'ai' && this.turn === this.aiColor) {
      this.scheduleAi();
    }
  }

  scheduleAi() {
    const gid = this.gameId;
    this.thinking = true;
    this.updateAll(); // 先渲染玩家落子与「思考中」状态
    // 让浏览器完成本轮绘制后再进入同步计算：优先 rAF（渲染后触发），
    // 若 webview 被遮挡导致 rAF 暂停，则由短延时定时器兜底（只触发一次）。
    let kicked = false;
    const kick = () => {
      if (kicked || gid !== this.gameId) return;
      kicked = true;
      setTimeout(() => this.computeAiMove(gid), 50);
    };
    requestAnimationFrame(kick);
    setTimeout(kick, 150);
  }

  computeAiMove(gid) {
    if (gid !== this.gameId) return; // 期间已新开一局/悔棋
    let mv = null;
    try {
      mv = findBestMove(this.board, this.aiColor, this.difficulty);
    } catch (err) {
      console.error('AI 计算异常', err);
    }
    if (gid !== this.gameId) return;
    this.thinking = false;
    if (mv != null && this.status === 'playing' && this.board[mv] === EMPTY) {
      this.doMove(mv);
    } else {
      this.updateAll();
      this.save();
    }
  }

  // ------------------------------------------------------------ 操作

  newGame() {
    this.gameId++;
    this.thinking = false;
    this.board = createBoard();
    this.history = [];
    this.status = 'playing';
    this.winner = 0;
    this.winLine = null;
    this.scoredGame = false;
    this.refreshSegs();
    this.view.render(this.viewState());
    this.updateAll();
    this.save();
    if (this.mode === 'ai' && this.turn === this.aiColor) {
      this.scheduleAi(); // 执白时 AI 开局天元
    }
  }

  undo() {
    if (this.thinking || this.history.length === 0) return;
    this.gameId++; // 作废挂起的 AI 计算
    let n = 1;
    if (this.mode === 'ai') {
      const last = this.history[this.history.length - 1];
      n = last.p === this.aiColor ? 2 : 1; // 人机模式一次悔两手（AI + 自己）
    }
    n = Math.min(n, this.history.length);
    for (let k = 0; k < n; k++) {
      const mv = this.history.pop();
      this.board[mv.i] = EMPTY;
    }
    if (this.scoredGame) {
      // 悔掉终局一手：回退本局已计入的比分
      if (this.status === 'win') {
        this.scores[this.winner === BLACK ? 'black' : 'white']--;
      }
      this.scoredGame = false;
    }
    this.status = 'playing';
    this.winner = 0;
    this.winLine = null;
    this.view.render(this.viewState());
    this.updateAll();
    this.save();
    if (this.mode === 'ai' && this.turn === this.aiColor) {
      this.scheduleAi(); // 极少见：悔成 AI 行棋（如只剩 AI 开局手）→ 让 AI 重下
    }
  }

  // ------------------------------------------------------------ 视图

  viewState() {
    return {
      board: this.board,
      last: this.history.length ? this.history[this.history.length - 1].i : -1,
      winLine: this.winLine,
      hoverColor: this.turn,
      interactive: this.humanTurn,
    };
  }

  updateAll() {
    this.updateStatus();
    this.updatePanel();
    this.refreshSegs();
  }

  updateStatus() {
    const el = this.$('#status');
    el.classList.remove('win');
    let text;
    if (this.status === 'win') {
      el.classList.add('win');
      text = this.mode === 'pvp'
        ? (this.winner === BLACK ? '黑方获胜！' : '白方获胜！')
        : this.winner === this.humanColor ? '你赢了！' : '电脑获胜';
    } else if (this.status === 'draw') {
      text = '和棋';
    } else if (this.thinking) {
      text = '对手思考中…';
    } else if (this.mode === 'pvp') {
      text = this.turn === BLACK ? '黑方行棋' : '白方行棋';
    } else {
      text = this.turn === this.humanColor
        ? `轮到你落子（${this.humanColor === BLACK ? '黑' : '白'}）`
        : '对手行棋';
    }
    el.textContent = text;
    this.$('#spinner').classList.toggle('hidden', !this.thinking);
  }

  updatePanel() {
    this.$('#scoreBlack').textContent = String(this.scores.black);
    this.$('#scoreWhite').textContent = String(this.scores.white);
    this.$('#moveCount').textContent = !this.history.length
      ? '尚未开局'
      : this.status === 'playing'
        ? `第 ${this.history.length} 手 · ${this.history.length >= CELL_COUNT ? '棋盘已满' : '对局进行中'}`
        : `共 ${this.history.length} 手 · 对局结束`;
    this.$('#undoBtn').disabled = this.thinking || this.history.length === 0;
  }

  refreshSegs() {
    this.$('#aiOpts').classList.toggle('hidden', this.mode !== 'ai');
    this.setSegActive('#modeSeg', this.mode);
    this.setSegActive('#diffSeg', this.difficulty);
    this.setSegActive('#colorSeg', this.humanColor === BLACK ? 'black' : 'white');
  }

  setSegActive(sel, value) {
    this.$(sel).querySelectorAll('button').forEach((b) => {
      b.classList.toggle('active', b.dataset.v === value);
    });
  }

  // ------------------------------------------------------------ 持久化

  save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        v: 1,
        scores: this.scores,
        mode: this.mode,
        difficulty: this.difficulty,
        humanColor: this.humanColor,
        board: Array.from(this.board),
        history: this.history,
        status: this.status,
        winner: this.winner,
        winLine: this.winLine,
        scoredGame: this.scoredGame,
      }));
    } catch (e) { /* 存储不可用时静默降级为不保存 */ }
  }

  load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (!data || data.v !== 1) return;
      this.scores = { black: 0, white: 0, ...data.scores };
      this.mode = data.mode === 'pvp' ? 'pvp' : 'ai';
      this.difficulty = ['easy', 'medium', 'hard'].includes(data.difficulty) ? data.difficulty : 'medium';
      this.humanColor = data.humanColor === WHITE ? WHITE : BLACK;
      if (Array.isArray(data.board) && data.board.length === CELL_COUNT) {
        this.board = Uint8Array.from(data.board.map((v) => (v === BLACK || v === WHITE ? v : EMPTY)));
      }
      if (Array.isArray(data.history)) {
        this.history = data.history.filter((m) => m && Number.isInteger(m.i) && (m.p === BLACK || m.p === WHITE));
      }
      this.status = data.status === 'win' || data.status === 'draw' ? data.status : 'playing';
      this.winner = data.winner === BLACK || data.winner === WHITE ? data.winner : 0;
      this.winLine = Array.isArray(data.winLine) && data.winLine.length >= 5 ? data.winLine : null;
      this.scoredGame = Boolean(data.scoredGame);
      if (this.status !== 'playing') this.scoredGame = Boolean(data.scoredGame);
    } catch (e) { /* 损坏的存档直接忽略 */ }
  }
}
