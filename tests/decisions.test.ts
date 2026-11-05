import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Rule } from '../src/classify';
import type { ArticleRecord } from '../src/data/record';
import { runCandidates } from '../src/data/selection-store';
import { emptyDecisions, importReview, judgeAll, kindId, kindKey, parseDecisions, parseReview, renderSelectionMonths, renderReview, reviewGroups, selectedKeys, serializeDecisions } from '../src/decisions';
import { buildReviewIssue, evaluate, formatEvaluation } from '../src/review-issue';
import { buildCandidates } from '../src/selection';

// 合成データのみ(実タイトル・本文は含めない)
const rules: Rule[] = [
  { name: 'r-off-cat', decision: 'off', category: ['web-shop'] },
  { name: 'r-off-word', decision: 'off', title_includes: ['AAA'] },
  { name: 'r-on-recurring', decision: 'on', min_count: 3 },
  { name: 'r-on', decision: 'on', category: ['event'], title_includes: ['BBB'] },
];
const rec = (id: string, title: string, category = 'event'): ArticleRecord => ({
  id, url: `https://x/${id}`, title, category, categories: [category], published: '2026-10-22',
  fetched_at: '', lastmod: null, content_hash: 'h', parse_status: 'ok', reward_until: null,
  events: [{ id: `${id}#0`, name: 'n', title_named: true, label: '期間', start: '2026-10-22T12:00:00+09:00', end: '2026-10-23T23:59:00+09:00', raw: '' }],
});
const long = (n: string, tail = 'で報酬が「2倍」になるキャンペーン!') => `「${n}」${tail}`;

describe('種類キー', () => {
  it('固有名を空にして同種を集約し、短くなりすぎるものは項目自身(一般化しない)', () => {
    expect(kindKey(long('追憶'))).toBe(kindKey(long('守護獣', 'で報酬が「5倍」になるキャンペーン!')));
    expect(kindKey(long('追憶'))).toBe('「」で報酬が「」になるキャンペーン!');
    expect(kindKey('ガチャ「A」開催！')).toBe('ガチャ「A」開催！');
    expect(kindKey('「A」が登場！')).toBe('「A」が登場！');
    expect(kindKey('超究極クエスト（ミザリー）が期間限定で出現！')).toBe('超究極クエスト（）が期間限定で出現！');
  });
  it('カテゴリが違えば別の種類', () => {
    expect(kindId('web-shop', long('A'))).not.toBe(kindId('event', long('A')));
  });
});

describe('判定と4区分', () => {
  const cands = buildCandidates([rec('1_1', long('A')), rec('2_1', long('B')), rec('3_1', 'BBB x'), rec('4_1', 'AAA y'), rec('5_1', 'mystery'), rec('6_1', 'collabx', 'web-shop')]);
  it('記憶なし: ルール(on/off)と要判断(未一致)。同種は集約して件数加算(定例)', () => {
    const js = judgeAll(cands, emptyDecisions(), rules);
    const by = (k: string) => js.find((j) => j.cand.key === k)!;
    expect(by('BBB x')).toMatchObject({ decision: 'on', source: 'rule', bucket: 'auto-on' });
    expect(by('AAA y')).toMatchObject({ decision: 'off', bucket: 'auto-off' });
    expect(by('collabx')).toMatchObject({ decision: 'off', rule: 'r-off-cat' });
    expect(by('mystery')).toMatchObject({ decision: null, bucket: 'review' });
    expect(by(long('A')).kindCount).toBe(2);
    const g = reviewGroups(js);
    expect(g.map((x) => x.id).sort()).toEqual(['mystery', kindKey(long('A'))].sort());
    expect(g.find((x) => x.id === kindKey(long('A')))).toMatchObject({ count: 2, examples: [long('A'), long('B')].sort() });
  });
  it('種類の記憶は同種全体に適用(定例)。個別の記憶は種類より優先。未選択=非表示', () => {
    const d = emptyDecisions();
    d.kinds[kindId('event', long('A'))] = { decision: 'on', example: long('A'), confirmed: true };
    d.items['BBB x'] = 'off';
    const js = judgeAll(cands, d, rules);
    expect(js.filter((j) => j.bucket === 'recurring').map((j) => j.cand.key).sort()).toEqual([long('A'), long('B')].sort());
    expect(js.find((j) => j.cand.key === 'BBB x')).toMatchObject({ decision: 'off', source: 'memory' });
    expect(selectedKeys(js).sort()).toEqual([long('A'), long('B')].sort());
  });
  it('未確定の種類の記憶が例以外でルールと食い違うときは誤適用せず要判断(確定済みなら適用)', () => {
    const cs = buildCandidates([rec('1_1', long('BBB')), rec('2_1', long('AAA'))]);
    const k = kindId('event', cs[0]!.key);
    const learned = emptyDecisions();
    learned.kinds[k] = { decision: 'on', example: long('BBB') };
    const js = judgeAll(cs, learned, rules);
    expect(js.find((j) => j.cand.key.includes('AAA'))).toMatchObject({ decision: null, bucket: 'review', conflict: 'on' });
    expect(renderReview(reviewGroups(js))).toContain('食い違うため再確認');
    const confirmed = emptyDecisions();
    confirmed.kinds[k] = { decision: 'on', example: long('BBB'), confirmed: true };
    expect(judgeAll(cs, confirmed, rules).every((j) => j.decision === 'on')).toBe(true);
  });
});

describe('要判断ファイル', () => {
  it('集約行の描画 → 判断(x=表示, -=非表示, 空=保留)の取り込み', () => {
    const js = judgeAll(buildCandidates([rec('1_1', long('A')), rec('2_1', long('B')), rec('5_1', 'mystery'), rec('6_1', 'other')]), emptyDecisions(), rules);
    const md = renderReview(reviewGroups(js)).replace('- [ ] mystery', '- [x] mystery').replace('- [ ] other', '- [-] other');
    const { rows, unrecognized } = parseReview(md);
    expect(unrecognized).toBe(0);
    expect(rows).toHaveLength(3);
    const d = emptyDecisions();
    expect(importReview(d, rows)).toBe(2);
    expect(d.kinds['event::mystery']).toMatchObject({ decision: 'on', confirmed: true });
    expect(d.kinds['event::other']?.decision).toBe('off');
    expect(Object.keys(d.kinds)).toHaveLength(2);
  });
  it('レビュー依頼本文は未判断の集約行のみ。無ければ null', () => {
    const js = judgeAll(buildCandidates([rec('1_1', long('A')), rec('2_1', long('B')), rec('5_1', 'mystery')]), emptyDecisions(), rules);
    const rows = parseReview(renderReview(reviewGroups(js))).rows;
    const issue = buildReviewIssue(rows, '2026-10-24')!;
    expect(issue.title).toContain('2種類');
    expect(issue.body).toContain('- [ ] mystery (event / 1件)');
    expect(issue.body).toContain(kindKey(long('A')));
    expect(buildReviewIssue(parseReview('(要判断はありません)').rows, 'd')).toBeNull();
    expect(buildReviewIssue(rows.map((r) => ({ ...r, mark: 'x' as const })), 'd')).toBeNull();
  });
  it('書式崩れのチェック行は unrecognized に数える', () => {
    expect(parseReview('- [ ] a | event\n-[x] b\n- [?] c').unrecognized).toBe(2);
  });
  it('decisions.json の検証と安定出力', () => {
    expect(() => parseDecisions({})).toThrow();
    expect(() => parseDecisions({ kinds: { a: { decision: 'maybe' } }, items: {} })).toThrow();
    const d = emptyDecisions();
    d.items.b = 'on';
    d.items.a = 'off';
    expect(serializeDecisions(d).indexOf('"a"')).toBeLessThan(serializeDecisions(d).indexOf('"b"'));
    expect(parseDecisions(JSON.parse(serializeDecisions(d)))).toEqual(d);
  });
});

describe('runCandidates と評価', () => {
  it('記憶取り込み→再生成。要判断で確定した種類は次回から自動適用され、2回目は変化しない', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dec-'));
    try {
      const paths = { selection: join(dir, 'selection'), review: join(dir, 'needs-review.md'), decisions: join(dir, 'decisions.json') };
      const pub = join(dir, 'pub');
      const recs = [rec('1_1', 'BBB x'), rec('2_1', 'mystery')];
      const r = await runCandidates(recs, paths, pub, 'G', rules);
      expect(r).toMatchObject({ candidates: 2, selected: 1, reviewGroups: 1, imported: 0 });
      expect(r.buckets).toMatchObject({ review: 1, 'auto-on': 1 });
      const review = await readFile(paths.review, 'utf8');
      await writeFile(paths.review, review.replace('- [ ] mystery', '- [x] mystery'));
      const r2 = await runCandidates(recs, paths, pub, 'G', rules);
      expect(r2).toMatchObject({ selected: 2, reviewGroups: 0, imported: 1 });
      expect(JSON.parse(await readFile(join(pub, 'selection.json'), 'utf8')).selected.sort()).toEqual(['BBB x', 'mystery']);
      const text = await readFile(join(paths.selection, '2026/10.md'), 'utf8');
      const r3 = await runCandidates(recs, paths, pub, 'G', rules);
      expect(r3.imported).toBe(0);
      expect(await readFile(join(paths.selection, '2026/10.md'), 'utf8')).toBe(text);
      expect(text).toContain('表示 2件 / 非表示 0件 / 要判断 0件');
      expect(text).toContain('| 表示 | クエスト | mystery |');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it('表示の判断の一覧は月ごとの表(selection/YYYY/MM.md)。範囲の外は載せず、日時を含まず、判断が変わらなければ同じ内容。範囲外になった月のファイルは消える', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dec-'));
    try {
      const paths = { selection: join(dir, 'selection'), review: join(dir, 'r.md'), decisions: join(dir, 'd.json') };
      const old = { ...rec('9_1', 'BBB old'), events: [{ ...rec('9_1', 'BBB old').events[0]!, start: '2024-01-01T12:00:00+09:00', end: '2024-01-05T11:59:00+09:00' }] };
      const recs = [rec('1_1', 'BBB x'), rec('2_1', 'mystery'), old];
      const at = '2026-10-23T12:00:00+09:00';
      await runCandidates(recs, paths, join(dir, 'pub'), at, rules);
      const text = await readFile(join(paths.selection, '2026/10.md'), 'utf8');
      expect(text).toContain('# 表示の判断 2026-10');
      expect(text).toContain('| 判定 | セクション | 項目 | カテゴリ | 期間 | 理由 | 記事 |');
      expect(text).toContain('| 表示 | クエスト | BBB x |');
      expect(text).toContain('| 要判断 | クエスト | mystery |');
      expect(text).not.toContain(at);
      expect(text).not.toContain('BBB old');
      await runCandidates(recs, paths, join(dir, 'pub'), '2026-10-24T09:00:00+09:00', rules);
      expect(await readFile(join(paths.selection, '2026/10.md'), 'utf8')).toBe(text);
      // 範囲の外(2か月ずつ進めて1年以上あと)になったら、その月のファイルは作られない(消える)
      await runCandidates(recs, paths, join(dir, 'pub'), '2028-10-24T09:00:00+09:00', rules);
      expect(await readdir(paths.selection).catch(() => [])).toEqual([]);
      // カレンダー用の selection.json は、一覧の範囲に関係なく全件の判断から作る
      expect(JSON.parse(await readFile(join(dir, 'pub/selection.json'), 'utf8')).total).toBe(3);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it('一覧: 記事の月(data/articles と同じ分類)に載せる。範囲の外の項目は載せない。記事の月が分からないときは開始の月。範囲なしなら全件', () => {
    const at = (id: string, url: string, title: string, start: string, end: string) => ({ ...rec(id, title), url, events: [{ ...rec(id, title).events[0]!, start, end }] });
    const news = (id: string) => `https://www.monster-strike.com/news/${id}.html`;
    const js = judgeAll(
      buildCandidates([
        at('20251030_3', news('20251030_3'), 'BBB cont', '2025-10-30T12:00:00+09:00', '2025-12-01T11:59:00+09:00'),
        at('20280401_1', news('20280401_1'), 'BBB far', '2028-05-01T12:00:00+09:00', '2028-05-02T11:59:00+09:00'),
        at('20260301_1', news('20260301_1'), 'BBB x', '2026-03-05T12:00:00+09:00', '2026-03-09T11:59:00+09:00'),
        at('x_1', 'https://x/x_1', 'BBB nodate', '2026-07-05T12:00:00+09:00', '2026-07-09T11:59:00+09:00'),
      ]),
      emptyDecisions(),
      rules,
    );
    const m = renderSelectionMonths(js, { from: '2025-11-05', to: '2027-11-05' });
    expect([...m.keys()]).toEqual(['2025-10', '2026-03', '2026-07']);
    expect(m.get('2025-10')).toContain('BBB cont');
    expect(m.get('2026-07')).toContain('BBB nodate');
    expect([...m.values()].join()).not.toContain('BBB far');
    expect([...renderSelectionMonths(js).keys()]).toEqual(['2025-10', '2026-03', '2026-07', '2028-04']);
  });
  it('月別の表はセクション(画面と同じ順)→期間の順に並び、セクションの列を持つ', () => {
    const at2 = (id: string, title: string, cat: string, start: string, end: string): ArticleRecord => ({ ...rec(id, title, cat), url: `https://www.monster-strike.com/news/${id}.html`, events: [{ ...rec(id, title, cat).events[0]!, start, end }] });
    const js = judgeAll(
      buildCandidates([
        at2('20261001_1', 'ガチャ「テスト」開催', 'collab', '2026-10-01T12:00:00+09:00', '2026-10-02T11:59:00+09:00'),
        at2('20261001_2', 'テストキャンペーン', 'campaign', '2026-10-01T12:00:00+09:00', '2026-10-02T11:59:00+09:00'),
        at2('20261001_3', 'テストクエスト', 'event', '2026-10-05T12:00:00+09:00', '2026-10-06T11:59:00+09:00'),
      ]),
      emptyDecisions(),
      rules,
    );
    const text = renderSelectionMonths(js).get('2026-10') as string;
    expect(text).toContain('| 判定 | セクション | 項目 |');
    const secs = text.split('\n').filter((l) => /^\| (表示|非表示|要判断) \|/.test(l)).map((l) => l.split(' | ')[1]);
    expect(secs).toEqual(['クエスト', 'キャンペーン', 'ガチャ']);
  });
  it('一致率: 記憶を教師にルール単独の判定を比較', () => {
    const d = emptyDecisions();
    d.items['BBB x'] = 'on';
    d.items['AAA y'] = 'on';
    d.items.mystery = 'off';
    const js = judgeAll(buildCandidates([rec('1_1', 'BBB x'), rec('2_1', 'AAA y'), rec('3_1', 'mystery')]), d, rules);
    const e = evaluate(js, rules);
    expect(e).toMatchObject({ total: 3, decided: 2, agreed: 1 });
    expect(e.mismatches.map((m) => m.key)).toEqual(['AAA y']);
    expect(formatEvaluation(e)).toContain('不一致 1件');
  });
});

describe('判断の記憶の整合', () => {
  it('未確定の種類記憶と逆の判断で食い違い行を確定しても、元の例は反転しない', () => {
    const d = emptyDecisions();
    const k = kindId('event', long('BBB'));
    d.kinds[k] = { decision: 'on', example: long('BBB') };
    const row = { mark: '-' as const, id: kindKey(long('BBB')), category: 'event', count: '1件', examples: long('AAA'), period: '', url: '' };
    importReview(d, [row]);
    expect(d.kinds[k]).toMatchObject({ decision: 'on', example: long('BBB') });
    expect(d.items[long('AAA')]).toBe('off');
  });
  it('kindKey の10字境界', () => {
    expect(kindKey('「A」1234567890')).toBe('「」1234567890');
    expect(kindKey('「A」123456789')).toBe('「A」123456789');
  });
  it('パック告知は非表示ルール(実ルール)', async () => {
    const { readRules } = await import('../src/data/selection-store');
    const real = (await readRules('config/judge/rules.json'))!;
    const { classify } = await import('../src/classify');
    expect(classify({ key: '「期間限定！13周年記念パック」が登場！', category: 'event', count: 1 }, real).decision).toBe('off');
    expect(classify({ key: 'キャラ育成パック販売!', category: 'campaign', count: 1 }, real).decision).toBe('off');
  });
});
