/**
 * 棋盘渲染（canvas）：深色棋盘、天元星位、棋子、悬停预览、
 * 最后一手标记、胜利五连高亮；窗口/容器缩放自适应（含 devicePixelRatio）。
 */
import { SIZE, EMPTY, BLACK, WHITE, idx, rowOf, colOf } from '../engine/gomoku.js';

const STAR_POINTS = [
  [3, 3],
  [3, 11],
  [11, 3],
  [11, 11],
  [7, 7], // 天元
];

export class GomokuBoard {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {(cell: number) => void} onCellClick 空点点击回调（是否可落由 UI 层判断）
   */
  constructor(canvas, onCellClick) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.onCellClick = onCellClick;
    this.cssSize = 300;
    this.cell = 300 / (SIZE + 1);
    this.hover = -1;
    /** @type {{board:Uint8Array, last:number, winLine:number[]|null, hoverColor:number, interactive:boolean}|null} */
    this.state = null;

    canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
    canvas.addEventListener('pointerleave', () => {
      if (this.hover !== -1) {
        this.hover = -1;
        this.render();
      }
    });
    canvas.addEventListener('click', (e) => {
      const cell = this.hitTest(e);
      if (cell != null) this.onCellClick(cell);
    });

    this.ro = new ResizeObserver(() => this.resize());
  }

  /** 挂到容器上，跟随容器尺寸自适应。 */
  mount(area) {
    this.area = area;
    this.ro.observe(area);
    this.resize();
  }

  unmount() {
    this.ro.disconnect();
  }

  resize() {
    if (!this.area) return;
    const w = this.area.clientWidth;
    const h = this.area.clientHeight;
    const size = Math.max(220, Math.floor(Math.min(w, h)) - 8);
    const dpr = window.devicePixelRatio || 1;
    this.cssSize = size;
    this.cell = size / (SIZE + 1);
    this.canvas.style.width = `${size}px`;
    this.canvas.style.height = `${size}px`;
    this.canvas.width = Math.round(size * dpr);
    this.canvas.height = Math.round(size * dpr);
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.render();
  }

  /** 交叉点中心坐标。 */
  xy(cellIndex) {
    const m = this.cell;
    return [m + colOf(cellIndex) * this.cell, m + rowOf(cellIndex) * this.cell];
  }

  /** 事件 → 最近交叉点；距中心超过 0.48 格视为未命中。 */
  hitTest(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const c = Math.round((x - this.cell) / this.cell);
    const r = Math.round((y - this.cell) / this.cell);
    if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return null;
    const [gx, gy] = this.xy(idx(r, c));
    if (Math.hypot(x - gx, y - gy) > this.cell * 0.48) return null;
    return idx(r, c);
  }

  onPointerMove(e) {
    if (!this.state || !this.state.interactive) {
      if (this.hover !== -1) {
        this.hover = -1;
        this.render();
      }
      this.canvas.style.cursor = 'default';
      return;
    }
    const cell = this.hitTest(e);
    const valid = cell != null && this.state.board[cell] === EMPTY;
    this.canvas.style.cursor = valid ? 'pointer' : 'default';
    const next = valid ? cell : -1;
    if (next !== this.hover) {
      this.hover = next;
      this.render();
    }
  }

  /**
   * 全量重绘（15×15 重绘开销 < 2ms，无需脏矩形）。
   * @param {object} state 见 this.state 结构
   */
  render(state) {
    if (state) this.state = state;
    const s = this.state;
    if (!s) return;
    const g = this.g;
    const size = this.cssSize;
    const cell = this.cell;
    const m = cell;
    const span = size - m * 2;

    // ---- 背景
    g.clearRect(0, 0, size, size);
    const bg = g.createLinearGradient(0, 0, size, size);
    bg.addColorStop(0, '#282d3a');
    bg.addColorStop(1, '#1a1e27');
    g.fillStyle = bg;
    g.fillRect(0, 0, size, size);
    const vig = g.createRadialGradient(size / 2, size / 2, size * 0.2, size / 2, size / 2, size * 0.75);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.28)');
    g.fillStyle = vig;
    g.fillRect(0, 0, size, size);

    // ---- 网格
    g.strokeStyle = 'rgba(210, 220, 240, 0.28)';
    g.lineWidth = 1;
    g.beginPath();
    for (let k = 0; k < SIZE; k++) {
      const p = m + k * cell;
      g.moveTo(Math.round(m) + 0.5, Math.round(p) + 0.5);
      g.lineTo(Math.round(m + span) + 0.5, Math.round(p) + 0.5);
      g.moveTo(Math.round(p) + 0.5, Math.round(m) + 0.5);
      g.lineTo(Math.round(p) + 0.5, Math.round(m + span) + 0.5);
    }
    g.stroke();
    g.strokeStyle = 'rgba(210, 220, 240, 0.45)';
    g.lineWidth = 1.5;
    g.strokeRect(m, m, span, span);

    // ---- 星位与天元
    g.fillStyle = 'rgba(210, 220, 240, 0.55)';
    for (const [r, c] of STAR_POINTS) {
      const [x, y] = this.xy(idx(r, c));
      g.beginPath();
      g.arc(x, y, Math.max(2, cell * 0.09), 0, Math.PI * 2);
      g.fill();
    }

    // ---- 棋子
    for (let i = 0; i < SIZE * SIZE; i++) {
      const v = s.board[i];
      if (v === EMPTY) continue;
      this.drawStone(i, v === BLACK, cell * 0.44, 1);
    }

    // ---- 最后一手标记（红点）
    if (s.last >= 0 && s.board[s.last] !== EMPTY && !(s.winLine && s.winLine.includes(s.last))) {
      const [x, y] = this.xy(s.last);
      g.beginPath();
      g.arc(x, y, Math.max(2.5, cell * 0.11), 0, Math.PI * 2);
      g.fillStyle = '#ff6b5e';
      g.fill();
      g.lineWidth = 1;
      g.strokeStyle = 'rgba(0,0,0,0.35)';
      g.stroke();
    }

    // ---- 胜利五连高亮（金线 + 描边）
    if (s.winLine && s.winLine.length >= 5) {
      g.save();
      g.strokeStyle = 'rgba(255, 196, 64, 0.95)';
      g.lineWidth = Math.max(3, cell * 0.13);
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.shadowColor = 'rgba(255, 180, 0, 0.9)';
      g.shadowBlur = cell * 0.45;
      g.beginPath();
      s.winLine.forEach((i, k) => {
        const [x, y] = this.xy(i);
        if (k === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      });
      g.stroke();
      g.restore();
      for (const i of s.winLine) {
        const [x, y] = this.xy(i);
        g.beginPath();
        g.arc(x, y, cell * 0.44 + 1.5, 0, Math.PI * 2);
        g.lineWidth = Math.max(1.5, cell * 0.07);
        g.strokeStyle = 'rgba(255, 196, 64, 0.95)';
        g.stroke();
      }
    }

    // ---- 悬停预览落点
    if (s.interactive && this.hover >= 0 && s.board[this.hover] === EMPTY) {
      this.drawStone(this.hover, s.hoverColor === BLACK, cell * 0.44, 0.42);
    }
  }

  drawStone(i, black, radius, alpha) {
    const g = this.g;
    const [x, y] = this.xy(i);
    g.save();
    g.globalAlpha = alpha;
    if (alpha === 1) {
      g.shadowColor = 'rgba(0, 0, 0, 0.5)';
      g.shadowBlur = radius * 0.4;
      g.shadowOffsetY = radius * 0.18;
    }
    const grad = g.createRadialGradient(x - radius * 0.35, y - radius * 0.4, radius * 0.1, x, y, radius);
    if (black) {
      grad.addColorStop(0, '#69707f');
      grad.addColorStop(0.55, '#23262e');
      grad.addColorStop(1, '#0a0c11');
    } else {
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.6, '#e8ecf3');
      grad.addColorStop(1, '#b9c1cf');
    }
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, radius, 0, Math.PI * 2);
    g.fill();
    g.shadowColor = 'transparent';
    g.lineWidth = 0.8;
    g.strokeStyle = black ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.22)';
    g.stroke();
    g.restore();
  }
}
