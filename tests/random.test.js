import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  BLACK,
  CELL_COUNT,
  EMPTY,
  idx,
  createBoard,
  getGameResult,
  findBestMove,
} from '../web/js/engine/gomoku.js';

/** 可复现的 LCG 伪随机（固定种子，测试确定性）。 */
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

describe('AI 合法性', () => {
  it('随机对弈 50 步：无非法着法、无异常', () => {
    const rng = makeRng(20241111);
    const b = createBoard();
    let player = BLACK;
    let placed = 0;
    for (let ply = 0; ply < 50; ply++) {
      const legal = [];
      for (let i = 0; i < CELL_COUNT; i++) {
        if (b[i] === EMPTY) legal.push(i);
      }
      assert.ok(legal.length > 0, '棋盘未满时必须有合法点');
      const mv = legal[Math.floor(rng() * legal.length)];
      assert.equal(b[mv], EMPTY, `第 ${ply + 1} 手落在非空点`);
      b[mv] = player;
      placed++;
      const res = getGameResult(b, mv);
      assert.ok(
        res.status === 'playing' || res.status === 'win' || res.status === 'draw',
        `结果状态非法：${res.status}`,
      );
      if (res.status !== 'playing') {
        // 随机对弈出现胜负即提前结束，重新开局继续计数
        for (let i = 0; i < CELL_COUNT; i++) b[i] = EMPTY;
        player = BLACK;
        continue;
      }
      player = 3 - player;
    }
    assert.ok(placed >= 50, `应完成 50 次落子，实际 ${placed}`);
  });

  it('AI（易档）自对弈整局：每手合法、结果一致', () => {
    const b = createBoard();
    let player = BLACK;
    for (let ply = 0; ply < 225; ply++) {
      const mv = findBestMove(b, player, 'easy');
      if (mv == null) {
        assert.ok(player >= BLACK && player <= WHITE);
        break; // 棋满
      }
      assert.equal(b[mv], EMPTY, `AI 第 ${ply + 1} 手落在非空点 (${(mv / 15) | 0},${mv % 15})`);
      b[mv] = player;
      const res = getGameResult(b, mv);
      if (res.status === 'win') {
        assert.equal(res.player, player, '胜方应为刚落子一方');
        assert.ok(res.line.length >= 5);
        return;
      }
      if (res.status === 'draw') {
        assert.ok(
          [...b].every((v) => v !== EMPTY),
          '和棋时棋盘应为满',
        );
        return;
      }
      player = 3 - player;
    }
  });

  it('难档在中局局面的单次计算不超过 1.2 秒（时间预算护栏）', () => {
    const b = createBoard();
    // 用易档自对弈快速构造一个自然中局（12 手）
    let player = BLACK;
    for (let n = 0; n < 12; n++) {
      const mv = findBestMove(b, player, 'easy');
      if (mv == null) break;
      b[mv] = player;
      const res = getGameResult(b, mv);
      if (res.status !== 'playing') break;
      player = 3 - player;
    }
    const t0 = Date.now();
    const mv = findBestMove(b, player, 'hard');
    const dt = Date.now() - t0;
    assert.notEqual(mv, null);
    assert.equal(b[mv], EMPTY);
    assert.ok(dt < 1200, `难档单次计算 ${dt}ms，超过 1.2s 护栏`);
  });
});
