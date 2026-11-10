import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  BLACK,
  WHITE,
  idx,
  createBoard,
  findBestMove,
} from '../web/js/engine/gomoku.js';

/**
 * 固定战术局面断言（SPEC：成五点、必防成五、堵活三、双三机会）。
 * 全部用「难」档断言应着；堵活三同时断言「中」档。
 */
describe('AI 必胜 / 必防战术', () => {
  it('能立即找到成五点（两端开，任一端均可）', () => {
    const b = createBoard();
    for (const c of [4, 5, 6, 7]) b[idx(7, c)] = BLACK;
    for (const [r, c] of [[2, 2], [2, 3], [12, 12]]) b[idx(r, c)] = WHITE;
    const t0 = Date.now();
    const mv = findBestMove(b, BLACK, 'hard');
    assert.notEqual(mv, null);
    assert.equal(b[mv], EMPTY_FOR_CHECK(), 'AI 应着必须落在空点');
    assert.ok(mv === idx(7, 3) || mv === idx(7, 8), `应落在 (7,3)/(7,8)，实际 ${mv}`);
    assert.ok(Date.now() - t0 < 200, '成五点应瞬时裁决');
  });

  it('能立即找到成五点（单端开，唯一成五点）', () => {
    const b = createBoard();
    for (const c of [4, 5, 6, 7]) b[idx(7, c)] = BLACK;
    b[idx(7, 3)] = WHITE; // 左端被堵
    for (const [r, c] of [[2, 2], [2, 3], [12, 12]]) b[idx(r, c)] = WHITE;
    const mv = findBestMove(b, BLACK, 'hard');
    assert.equal(mv, idx(7, 8));
  });

  it('对方已成四（下一手成五）→ 必堵成五点', () => {
    const b = createBoard();
    for (const c of [5, 6, 7, 8]) b[idx(9, c)] = WHITE;
    for (const [r, c] of [[3, 3], [3, 4]]) b[idx(r, c)] = BLACK;
    const mv = findBestMove(b, BLACK, 'hard');
    assert.notEqual(mv, null);
    assert.ok(mv === idx(9, 4) || mv === idx(9, 9), `必须堵在 (9,4)/(9,9)，实际 ${mv}`);
  });

  it('对方活三 → 正确封堵（难档）', () => {
    const b = createBoard();
    for (const c of [5, 6, 7]) b[idx(9, c)] = WHITE; // 白活三 _●●●_
    for (const [r, c] of [[3, 3], [3, 4]]) b[idx(r, c)] = BLACK;
    const t0 = Date.now();
    const mv = findBestMove(b, BLACK, 'hard');
    const dt = Date.now() - t0;
    assert.ok(mv === idx(9, 4) || mv === idx(9, 8), `必须堵活三两端 (9,4)/(9,8)，实际 ${mv}`);
    assert.ok(dt < 1500, `难档应着应在 1.5s 内（实际 ${dt}ms）`);
  });

  it('对方活三 → 正确封堵（中档）', () => {
    const b = createBoard();
    for (const c of [5, 6, 7]) b[idx(9, c)] = WHITE;
    for (const [r, c] of [[3, 3], [3, 4]]) b[idx(r, c)] = BLACK;
    const mv = findBestMove(b, BLACK, 'medium');
    assert.ok(mv === idx(9, 4) || mv === idx(9, 8), `必须堵活三两端 (9,4)/(9,8)，实际 ${mv}`);
  });

  it('双三机会 → 落在双活三点（难档）', () => {
    const b = createBoard();
    // 黑：横 (7,6)(7,8) 间隔对 + 竖 (6,7)(8,7) 间隔对；(7,7) 一子双关成两个活三
    for (const [r, c] of [[7, 6], [7, 8], [6, 7], [8, 7]]) b[idx(r, c)] = BLACK;
    for (const [r, c] of [[2, 2], [2, 3]]) b[idx(r, c)] = WHITE;
    const mv = findBestMove(b, BLACK, 'hard');
    assert.equal(mv, idx(7, 7), `应落双三点 (7,7)，实际 ${mv}`);
  });

  it('三档难度都返回合法着法', () => {
    const b = createBoard();
    for (const [r, c] of [[7, 7], [8, 8]]) b[idx(r, c)] = BLACK;
    for (const [r, c] of [[7, 8], [6, 6]]) b[idx(r, c)] = WHITE;
    for (const lv of ['easy', 'medium', 'hard']) {
      const mv = findBestMove(b, WHITE, lv);
      assert.notEqual(mv, null, `${lv} 应有应着`);
      assert.equal(b[mv], 0, `${lv} 应着必须落在空点`);
    }
  });
});

/** 占位：测试里不直接引 EMPTY 也行，这里用 0 显式表达「空点」。 */
function EMPTY_FOR_CHECK() {
  return 0;
}
