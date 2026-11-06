import { describe, expect, it } from 'vitest';
import order from '../config/display/order.json';
import { orderProblems, type OrderConfig } from '../src/order-check';
import { CAMPAIGN_GROUPS, CAMPAIGN_ORDER, GACHA_GROUPS, QUEST_GROUPS, QUEST_DEFAULT, QUEST_EVENT, QUEST_RAID, QUEST_SUPER, SECTIONS, matchGroup } from '../src/sections';
import { campaignGroup, questGroup } from '../src/week';

const cfg = (): OrderConfig => structuredClone(order) as unknown as OrderConfig;

describe('表示順・小見出しの設定(order.json)', () => {
  it('現在の設定に誤りは無い', () => expect(orderProblems()).toEqual([]));
  it('設定の順がそのまま表示順になる', () => {
    expect(SECTIONS.map((s) => s.id)).toEqual(order.sections.map((s) => s.id));
    expect(QUEST_GROUPS).toEqual(order.groups.quest.map((g) => g.name));
    expect(GACHA_GROUPS).toEqual(order.groups.gacha.map((g) => g.name));
    expect(CAMPAIGN_GROUPS).toEqual(order.groups.campaign.map((g) => g.name));
  });
  it('ミッションは語で振り分けない(キャンペーンの語から除く)', () => {
    expect(CAMPAIGN_GROUPS).toContain('ミッション');
    expect(CAMPAIGN_ORDER).not.toContain('ミッション');
    expect(campaignGroup({ name: 'CM視聴で…' })).toBe('ミッション');
  });
  it('役割(role)の小見出しは名前から独立して引ける', () => {
    expect([QUEST_EVENT, QUEST_RAID, QUEST_SUPER, QUEST_DEFAULT]).toEqual(['イベントクエスト', '絶級クエスト', '超究極クエスト', 'その他']);
  });
  it('振り分け: late でない match を配列の順に、次に late、最後に default', () => {
    expect(matchGroup('quest', '覇者の塔')).toBe('定例クエスト');
    expect(matchGroup('quest', '轟絶 テスト降臨')).toBe('絶級クエスト');
    expect(matchGroup('quest', '超究極クエスト（テスト）')).toBe('超究極クエスト'); // 「クエスト」(late)より先
    expect(matchGroup('quest', 'ただのクエスト')).toBe('期間限定クエスト');
    expect(matchGroup('quest', '何かの項目')).toBeNull();
    expect(questGroup({ name: '何かの項目' })).toBe('その他');
  });
  it('名前・個数は自由: 小見出しを足す/改名しても点検を通る', () => {
    const c = cfg();
    c.groups.quest = (c.groups.quest ?? []).map((g) => (g.name === '定例クエスト' ? { ...g, name: '毎月のクエスト' } : g));
    c.groups.quest?.splice(2, 0, { name: '新しい小見出し', match: { includes: ['新語'] } });
    expect(orderProblems(c)).toEqual([]);
  });
  it('色: 現在の設定は4セクションとも同じ色相(青灰。彩度は既定)で、sat は 0〜100・lit は −15〜15 の整数だけ許す', () => {
    const c = cfg();
    expect(c.sections.map((x) => [x.id, x.hue, x.sat ?? null, x.lit ?? 0])).toEqual([['quest', 215, null, 0], ['campaign', 215, null, 0], ['gacha', 215, null, 0]]);
    const badSat = cfg();
    badSat.sections = badSat.sections.map((x) => (x.id === 'quest' ? { ...x, sat: 120 } : x));
    expect(orderProblems(badSat).join()).toContain('sat は 0〜100');
    const bad = cfg();
    bad.sections = bad.sections.map((x) => (x.id === 'quest' ? { ...x, lit: 20 } : x));
    expect(orderProblems(bad).join()).toContain('lit は −15〜15');
    bad.sections = bad.sections.map((x) => (x.id === 'quest' ? { ...x, lit: 2.5 } : x));
    expect(orderProblems(bad).join()).toContain('lit は −15〜15');
  });
  it('誤りを検出する', () => {
    const bad = cfg();
    bad.sections = [{ id: 'quest', label: 'クエスト', hue: 215, categories: ['event'] }];
    bad.groups.quest = [
      { name: 'A', role: 'event', sort: 'x' as never },
      { name: 'A', role: 'nope' },
      { name: 'B', sort: 'fixed' },
      { name: 'C', match: { pattern: '(' } },
      { name: 'D', match: 'words' },
    ];
    bad.groups.gacha = [{ name: 'G', default: true }, { name: 'H', default: true }];
    const p = orderProblems(bad).join('\n');
    for (const w of ['sections に campaign', 'sort は', '重複', 'role は', 'words が必要', '正規表現', 'role「raid」', 'role「super」', 'role「event」', 'role「regular」', 'default の小見出し']) expect(p).toContain(w);
  });
});
