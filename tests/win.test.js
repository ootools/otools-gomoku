import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  SIZE,
  CELL_COUNT,
  EMPTY,
  BLACK,
  WHITE,
  idx,
  createBoard,
  isBoardFull,
  getGameResult,
} from '../web/js/engine/gomoku.js';

describe('胜负判定', () => {
  it('横向五连判黑胜，返回胜利连线', () => {
    const b = createBoard();
    for (const c of [4, 5, 6, 7, 8]) b[idx(7, c)] = BLACK;
    const res = getGameResult(b, idx(7, 8));
    assert.equal(res.status, 'win');
    assert.equal(res.player, BLACK);
    assert.deepEqual(res.line.sort((a, z) => a - z), [4, 5, 6, 7, 8].map((c) => idx(7, c)));
  });

  it('纵向五连判白胜', () => {
    const b = createBoard();
    for (const r of [3, 4, 5, 6, 7]) b[idx(r, 9)] = WHITE;
    const res = getGameResult(b, idx(7, 9));
    assert.equal(res.status, 'win');
    assert.equal(res.player, WHITE);
    assert.equal(res.line.length, 5);
  });

  it('↘ 对角线五连判胜', () => {
    const b = createBoard();
    for (const k of [0, 1, 2, 3, 4]) b[idx(4 + k, 4 + k)] = BLACK;
    const res = getGameResult(b, idx(8, 8));
    assert.equal(res.status, 'win');
    assert.equal(res.player, BLACK);
  });

  it('↗ 对角线五连判胜', () => {
    const b = createBoard();
    // (8,4) (7,5) (6,6) (5,7) (4,8)
    for (const [r, c] of [[8, 4], [7, 5], [6, 6], [5, 7], [4, 8]]) b[idx(r, c)] = WHITE;
    const res = getGameResult(b, idx(4, 8));
    assert.equal(res.status, 'win');
    assert.equal(res.player, WHITE);
  });

  it('长连（6 子）也算胜，高亮整条连线', () => {
    const b = createBoard();
    for (const c of [3, 4, 5, 6, 7, 8]) b[idx(4, c)] = BLACK;
    const res = getGameResult(b, idx(4, 8));
    assert.equal(res.status, 'win');
    assert.equal(res.player, BLACK);
    assert.equal(res.line.length, 6);
  });

  it('只有四连不成胜', () => {
    const b = createBoard();
    for (const c of [4, 5, 6, 7]) b[idx(7, c)] = BLACK;
    assert.equal(getGameResult(b, idx(7, 7)).status, 'playing');
  });

  it('棋满无五连判和（构造无五连的满盘）', () => {
    const b = createBoard();
    // (r + 2c) % 4 < 2 → 黑，否则白：任意方向连续同色最多 2 子
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        b[idx(r, c)] = (r + 2 * c) % 4 < 2 ? BLACK : WHITE;
      }
    }
    assert.equal(b.constructor, Uint8Array);
    assert.equal(b.length, CELL_COUNT);
    assert.ok(isBoardFull(b));
    assert.equal(getGameResult(b, -1).status, 'draw');
    assert.equal(getGameResult(b, idx(7, 7)).status, 'draw');
  });

  it('未满盘且无胜 → 对局中', () => {
    const b = createBoard();
    b[idx(7, 7)] = BLACK;
    b[idx(7, 8)] = WHITE;
    assert.equal(getGameResult(b, idx(7, 8)).status, 'playing');
  });
});
