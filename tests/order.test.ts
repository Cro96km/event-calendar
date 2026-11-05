import { describe, expect, it } from 'vitest';
import order from '../config/display/order.json';
import { orderProblems } from '../src/order-check';
import { CAMPAIGN_GROUPS, CAMPAIGN_ORDER, GACHA_GROUP_ORDER, QUEST_GROUP_ORDER, SECTIONS } from '../src/sections';

describe('表示順の設定(order.json)', () => {
  it('現在の設定に誤りは無い', () => expect(orderProblems()).toEqual([]));
  it('設定の順がそのまま表示順になる', () => {
    expect(SECTIONS.map((s) => s.id)).toEqual(order.sections);
    expect(QUEST_GROUP_ORDER).toEqual(order.groups.quest);
    expect(GACHA_GROUP_ORDER).toEqual(order.groups.gacha);
    expect(CAMPAIGN_GROUPS).toEqual(order.groups.campaign);
  });
  it('ミッションは語で振り分けない(キャンペーンの語から除く)', () => {
    expect(CAMPAIGN_GROUPS).toContain('ミッション');
    expect(CAMPAIGN_ORDER).not.toContain('ミッション');
  });
  it('誤りを検出する', () => {
    const bad = { ...order, sections: ['quest'], groups: { ...order.groups, quest: ['定例クエスト'] }, rows: { ...order.rows, 無い: { sort: 'x' }, 英雄の神殿: { sort: 'name', words: ['a'] } } };
    const p = orderProblems(bad as unknown as typeof order).join('\n');
    for (const w of ['sections', 'groups.quest']) expect(p).toContain(w);
  });
});
