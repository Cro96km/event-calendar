import { describe, expect, it } from 'vitest';
import type { Rule } from '../src/classify';
import type { ArticleRecord } from '../src/data/record';
import { emptyDecisions } from '../src/decisions';
import { buildUpdateReport, needsAttention, renderUpdateReport } from '../src/update-report';

// 合成データのみ(実本文は含めない)
const ev = (id: string, name: string, start: string, end: string | null) => ({ id, name, label: '開催期間', start, end, raw: '' });
const rec = (id: string, category: string, events: ReturnType<typeof ev>[], over: Partial<ArticleRecord> = {}): ArticleRecord => ({
  id, url: `https://example.test/${id}`, title: `記事${id}`, category, categories: [category], published: '2026-10-20',
  fetched_at: '', lastmod: null, content_hash: `h-${id}`, parse_status: 'ok', reward_until: null, events, ...over,
});
const rules: Rule[] = [
  { name: 'r-on', decision: 'on', title_includes: ['表示する企画'] },
  { name: 'r-off', decision: 'off', title_includes: ['隠す企画'] },
];
const D = emptyDecisions();
const T0 = '2026-10-27T12:00:00+09:00';
const T1 = '2026-11-03T12:00:00+09:00';
const run = (prev: ArticleRecord[], cur: ArticleRecord[]) => buildUpdateReport({ prev, cur, decisions: D, rules });

describe('buildUpdateReport(収集前後の差分)', () => {
  const base = rec('A_1', 'campaign', [ev('A_1#0', '表示する企画A', T0, T1)]);

  it('変更なしなら空(要対応もなし)', () => {
    const r = run([base], [base]);
    expect(r).toMatchObject({ newArticles: 0, changedArticles: 0, newEvents: [], changedEvents: [], visibleAdded: [], visibleRemoved: [], pending: [], carriedPending: 0, newQuests: [], longLabels: [], unparsed: [] });
    expect(needsAttention(r)).toBe(false);
  });

  it('新規の項目: 判定(ルール名つき)と、公開サイトに出るかを分ける', () => {
    const n = rec('B_1', 'campaign', [ev('B_1#0', '表示する企画B', T0, T1), ev('B_1#1', '隠す企画C', T0, T1)]);
    const r = run([base], [base, n]);
    expect(r.newArticles).toBe(1);
    expect(r.newEvents.map((e) => [e.id, e.judgment, e.rule])).toEqual([['B_1#0', 'on', 'r-on'], ['B_1#1', 'off', 'r-off']]);
    expect(r.visibleAdded.map((e) => e.id)).toEqual(['B_1#0']);
    expect(r.visibleRemoved).toEqual([]);
    expect(r.pending).toEqual([]);
  });

  it('新規の要判断は、前回に無かった候補だけ。前回からの未判断は件数だけ(再び出さない)', () => {
    const old = rec('O_1', 'campaign', [ev('O_1#0', '昔からの未判断の企画', T0, T1)]);
    const fresh = rec('N_1', 'campaign', [ev('N_1#0', '新しい未判断の企画', T0, T1)]);
    const r = run([base, old], [base, old, fresh]);
    expect(r.pending.map((g) => g.id)).toEqual(['新しい未判断の企画']);
    expect(r.carriedPending).toBe(1);
    expect(r.newEvents[0]?.judgment).toBe('review');
    expect(r.visibleAdded).toEqual([]); // 未判断は非表示
    expect(needsAttention(r)).toBe(true);
  });

  it('変更された項目: 期間が変わった既存の項目を 変更前→変更後 で。表示中なら公開側の項目として扱う', () => {
    const changed = rec('A_1', 'campaign', [ev('A_1#0', '表示する企画A', T0, '2026-11-10T11:59:00+09:00')], { content_hash: 'h-new' });
    const r = run([base], [changed]);
    expect(r.changedArticles).toBe(1);
    expect(r.changedEvents).toHaveLength(1);
    expect(r.changedEvents[0]?.before.end).toBe(T1);
    expect(r.changedEvents[0]?.after.end).toBe('2026-11-10T11:59:00+09:00');
    expect(r.newEvents).toEqual([]);
  });

  it('期間が取れなかった新規の記事は要対応。既存の none は出さない', () => {
    const none = rec('Z_1', 'event', [], { parse_status: 'none', title: '期間不明の記事' });
    const r = run([base], [base, none]);
    expect(r.unparsed).toEqual([{ id: 'Z_1', title: '期間不明の記事', url: 'https://example.test/Z_1' }]);
    expect(run([base, none], [base, none]).unparsed).toEqual([]);
  });

  it('1行に収まらない新規の表示ラベル(クエスト・キャンペーン)は要対応。ガチャは対象外', () => {
    const longName = '表示する企画の説明がとても長くて一行にはまったく収まらない名前の項目です';
    const n = rec('L_1', 'campaign', [ev('L_1#0', longName, T0, T1)]);
    const r = run([base], [base, n]);
    expect(r.longLabels).toHaveLength(1);
    expect(r.longLabels[0]?.width).toBeGreaterThan(15.5);
    const g = rec('G_1', 'collab', [ev('G_1#0', 'ガチャ「表示する企画のとても長い名前のガチャがここに入ります」開催!', T0, T1)]);
    expect(run([base], [base, g]).longLabels).toEqual([]);
  });

  it('新しい星墓クエスト(色の対応が無い階層名)は、前回から増えた分だけ要対応', () => {
    const star = (id: string, floors: string[]) => rec(id, 'event', [{ ...ev(`${id}#0`, '「破界の星墓」が登場', T0, T1), details: [{ label: '本開催の1階層～5階層までのクエスト', lines: floors }] }] as never);
    const prev = star('S_1', ['1階層：パライソの星墓', '2階層：未登録Aの星墓']);
    const cur = star('S_2', ['1階層：パライソの星墓', '2階層：未登録Aの星墓', '3階層：未登録Bの星墓']);
    const r = run([prev], [prev, cur]);
    expect(r.newQuests.map((q) => q.name)).toEqual(['未登録Bの星墓']);
  });
});

describe('renderUpdateReport', () => {
  it('要対応が無いときは「要対応はありません」。公開側に出る項目の表を出す', () => {
    const base = rec('A_1', 'campaign', [ev('A_1#0', '表示する企画A', T0, T1)]);
    const n = rec('B_1', 'campaign', [ev('B_1#0', '表示する企画B', T0, T1)]);
    const md = renderUpdateReport(run([base], [base, n]), { generatedAt: '2026-11-06' });
    expect(md).toContain('## 更新レポート (2026-11-06)');
    expect(md).toContain('### 公開サイトに新しく出る項目');
    expect(md).toContain('[表示する企画B](https://example.test/B_1)');
    expect(md).toContain('要対応はありません。');
    expect(md).not.toContain('公式の本文');
  });

  it('要対応を種類ごとに列挙し、表の区切り(|)を壊さない。長い一覧は件数で打ち切る', () => {
    const many = Array.from({ length: 70 }, (_, i) => rec(`M_${i}`, 'campaign', [ev(`M_${i}#0`, `表示する企画${i}|縦線`, T0, T1)]));
    const un = rec('U_1', 'campaign', [ev('U_1#0', '未判断の企画', T0, T1)]);
    const md = renderUpdateReport(run([], [...many, un]), { generatedAt: '2026-11-06' });
    expect(md).toContain('ほか 10 件');
    expect(md).toContain('要判断: 未判断の企画');
    expect(md).toContain('表示する企画0｜縦線');
    expect(md).not.toMatch(/表示する企画0\|縦線/);
  });
});

describe('判定の根拠(rule)の表示', () => {
  it('メンテナンスは常に表示、人の判断の記憶は「記憶」、ルール由来はルール名、要判断は null', () => {
    const mem = rec('M_1', 'campaign', [ev('M_1#0', '記憶で決めた企画', T0, T1)]);
    const maint = rec('X_1', 'maintenance', [ev('X_1#0', 'メンテナンス', T0, T1)]);
    const open = rec('R_1', 'campaign', [ev('R_1#0', '表示する企画R', T0, T1), ev('R_1#1', '未判断の企画R', T0, T1)]);
    const d = { kinds: {}, items: { 記憶で決めた企画: 'on' as const } }; // 個別の記憶(候補キーそのもの)
    const r = buildUpdateReport({ prev: [], cur: [mem, maint, open], decisions: d, rules });
    const by = (id: string) => r.newEvents.find((e) => e.id === id);
    expect(by('M_1#0')).toMatchObject({ judgment: 'on', rule: '記憶' });
    expect(by('X_1#0')).toMatchObject({ judgment: 'on', rule: '常に表示' });
    expect(by('R_1#0')).toMatchObject({ judgment: 'on', rule: 'r-on' });
    expect(by('R_1#1')).toMatchObject({ judgment: 'review', rule: null });
  });
});
