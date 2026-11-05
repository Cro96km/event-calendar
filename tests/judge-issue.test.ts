import { describe, expect, it } from 'vitest';
import { emptyDecisions, type ReviewGroup } from '../src/decisions';
import { applyJudgeMarks, parseJudgeIssue, renderJudgeIssue } from '../src/judge-issue';
import type { UpdateReport } from '../src/update-report';

// 合成データのみ(実本文は含めない)
const group = (id: string, category = 'campaign', over: Partial<ReviewGroup> = {}): ReviewGroup => ({
  id, category, examples: [`${id}の例A`, `${id}の例B`], count: 2, period: '2026-11-03〜2026-11-09', url: `https://example.test/${encodeURIComponent(id)}`, conflict: null, ...over,
});
const empty: UpdateReport = { newArticles: 0, changedArticles: 0, newEvents: [], changedEvents: [], visibleAdded: [], visibleRemoved: [], pending: [], carriedPending: 0, newQuests: [], longLabels: [], unparsed: [] };
const withPending = (pending: ReviewGroup[]): UpdateReport => ({ ...empty, pending });

describe('renderJudgeIssue', () => {
  it('要対応が無ければ null', () => {
    expect(renderJudgeIssue(empty, '2026-11-06')).toBeNull();
  });

  it('要判断をチェックボックスの一覧にし、/apply の案内と「チェック無し=非表示」を書く。リンク・件数・例を含む', () => {
    const r = renderJudgeIssue(withPending([group('企画「」が開催'), group('別の企画')]), '2026-11-06');
    expect(r?.title).toBe('要対応 (2026-11-06)');
    expect(r?.body).toContain('## 要判断(2種類)');
    expect(r?.body).toContain('`/apply`');
    expect(r?.body).toContain('チェックを入れない種類は「常に非表示」で確定');
    // 主表示は固有名つきの実際の項目名(例の先頭)。種類キー(「」の中身が空)は補足
    expect(r?.body).toMatch(/- \[ \] 企画「」が開催の例A \(campaign・同種2件\) 種類: 企画「」が開催 https:\/\/example\.test\/.* <!--k:/);
    expect(r?.body).toContain('固有名を空にして同種をまとめた表記');
  });

  it('新クエスト・長いラベル・期間不明は、コピーして使える書式つき(JSON)。名前の引用符を壊さない', () => {
    const r = renderJudgeIssue({
      ...empty,
      newQuests: [{ name: '新登場の星墓', article: '20261125_1', start: '2026-11-27' }],
      longLabels: [{ id: 'x#0', label: '長い"ラベル"の項目', width: 17.2 }],
      unparsed: [{ id: 'Z_1', title: '期間不明の記事', url: 'https://example.test/Z_1' }],
    }, '2026-11-06');
    expect(r?.body).toContain('{ "name": "新登場", "color": "red" }');
    expect(r?.body).toContain('{ "match": "長いラベルの項目", "label": "ここに短い表記" }');
    expect(r?.body).toContain('[期間不明の記事](https://example.test/Z_1)');
    expect(r?.body).not.toContain('<!--k:'); // 要判断が無ければチェック行は無い
  });
});

describe('parseJudgeIssue / applyJudgeMarks(往復)', () => {
  const groups = [group('企画「」が開催'), group('別の企画'), group('三つ目の企画')];
  const body = renderJudgeIssue(withPending(groups), '2026-11-06')?.body ?? '';
  // 種類IDの隠しコメントで行を特定してチェックを入れる(行の先頭は固有名つきの例なので、種類キーでは探さない)
  const tick = (b: string, id: string): string => b.split('\n').map((l) => (l.includes(`<!--k:${encodeURIComponent(`campaign::${id}`)}-->`) ? l.replace('- [ ]', '- [x]') : l)).join('\n');

  it('チェック状態を読む(未チェック=false、チェック=true。大文字Xも)', () => {
    const m = parseJudgeIssue(tick(tick(body, '別の企画'), '三つ目の企画').replace('- [x] 三つ目の企画の例A', '- [X] 三つ目の企画の例A'));
    expect(m).toEqual([
      { kind: 'campaign::企画「」が開催', ticked: false },
      { kind: 'campaign::別の企画', ticked: true },
      { kind: 'campaign::三つ目の企画', ticked: true },
    ]);
  });

  it('取り込み: チェック=表示(on)、無し=非表示(off)で確定する(confirmed)', () => {
    const d = emptyDecisions();
    const r = applyJudgeMarks(d, parseJudgeIssue(tick(body, '別の企画')), groups);
    expect(r).toEqual({ applied: 3, unknown: [] });
    expect(d.kinds['campaign::別の企画']).toMatchObject({ decision: 'on', confirmed: true });
    expect(d.kinds['campaign::企画「」が開催']).toMatchObject({ decision: 'off', confirmed: true });
    expect(d.kinds['campaign::三つ目の企画']).toMatchObject({ decision: 'off', confirmed: true });
  });

  it('現在の要判断に無い種類(本文の書き換え・古いIssue)は無視して報告する。既存の判断を変えない', () => {
    const d = emptyDecisions();
    d.kinds['campaign::既存の判断'] = { decision: 'on', example: '既存の判断', confirmed: true };
    const forged = `${body}\n- [ ] 既存の判断 (campaign・1件) 例: x https://e <!--k:${encodeURIComponent('campaign::既存の判断')}-->`;
    const r = applyJudgeMarks(d, parseJudgeIssue(forged), groups);
    expect(r.unknown).toEqual(['campaign::既存の判断']);
    expect(d.kinds['campaign::既存の判断']?.decision).toBe('on');
  });

  it('種類IDに記号が含まれても往復できる。壊れた行・コメントの無い行は無視する', () => {
    const g = group('「-->」を含む<!--名前', 'event');
    const b = renderJudgeIssue(withPending([g]), '2026-11-06')?.body ?? '';
    const m = parseJudgeIssue(`${b}\n- [x] 手で足した行(コメントなし)\n- [x] 壊れた <!--k:%E0%A4%A-->\n普通の文`);
    expect(m).toHaveLength(1);
    expect(m[0]?.kind).toBe('event::「-->」を含む<!--名前');
    const d = emptyDecisions();
    expect(applyJudgeMarks(d, m, [g]).applied).toBe(1);
  });

  it('同じ種類が重複していても1回だけ取り込む', () => {
    const d = emptyDecisions();
    const m = parseJudgeIssue(body);
    expect(applyJudgeMarks(d, [...m, ...m], groups).applied).toBe(3);
  });
});
